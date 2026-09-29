// Standalone detached updater process.
// Downloads the official Multiver CLI tarball from GitHub Releases and installs it with npm.
// Survives after parent Next server exits (detached + unref by spawner).

const { spawn } = require("child_process");
const http = require("http");
const net = require("net");
const path = require("path");
const fs = require("fs");
const os = require("os");

const packageName = process.env.UPDATER_PKG_NAME || "Multiver";
// ponytail: updater runs standalone (CJS, outside Next), so it can't import the
// NETWORK_CONFIG SSOT. Env UPDATER_PORT is set by the CLI/parent from
// NETWORK_CONFIG.statusPort. Defaults keep in sync with NETWORK_CONFIG.
const port = parseInt(process.env.UPDATER_PORT || "20223", 10);
const tailLines = parseInt(process.env.UPDATER_TAIL_LINES || "8", 10);
const maxRetries = parseInt(process.env.UPDATER_RETRIES || "3", 10);
const retryDelayMs = parseInt(process.env.UPDATER_RETRY_DELAY_MS || "5000", 10);
const lingerMs = parseInt(process.env.UPDATER_LINGER_MS || "30000", 10);
const waitMinMs = parseInt(process.env.UPDATER_WAIT_MIN_MS || "3000", 10);
const waitMaxMs = parseInt(process.env.UPDATER_WAIT_MAX_MS || "15000", 10);
const waitCheckMs = parseInt(process.env.UPDATER_WAIT_CHECK_MS || "500", 10);
const appPort = parseInt(process.env.UPDATER_APP_PORT || "20222", 10);

// Data directory (match mitm/paths.js logic)
function getDataDir() {
  if (process.env.DATA_DIR) return process.env.DATA_DIR;
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Multiver");
  }
  return path.join(os.homedir(), ".Multiver");
}
const updateDir = path.join(getDataDir(), "update");
try { fs.mkdirSync(updateDir, { recursive: true }); } catch { /* best effort */ }
const statusFile = path.join(updateDir, "status.json");
const logFile = path.join(updateDir, "install.log");

const state = {
  phase: "starting",
  packageName,
  startedAt: Date.now(),
  finishedAt: null,
  attempt: 0,
  maxRetries,
  done: false,
  success: false,
  exitCode: null,
  error: null,
  logTail: [],
};

function pushLog(line) {
  const trimmed = line.replace(/\r?\n$/, "");
  if (!trimmed) return;
  state.logTail.push(trimmed);
  if (state.logTail.length > tailLines) state.logTail = state.logTail.slice(-tailLines);
  try { fs.appendFileSync(logFile, `${trimmed}\n`); } catch { /* best effort */ }
}

function persistStatus() {
  try { fs.writeFileSync(statusFile, JSON.stringify(state, null, 2)); } catch { /* best effort */ }
}

function setPhase(phase) {
  state.phase = phase;
  persistStatus();
}

// HTTP server exposing status (browser polls this while Next server is dead)
const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Cache-Control", "no-store");
  if (req.url === "/update/status" || req.url === "/") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(state));
    return;
  }
  res.statusCode = 404;
  res.end("not found");
});

server.on("error", (e) => {
  state.error = `status server error: ${e.message}`;
  persistStatus();
});

server.listen(port, "127.0.0.1", () => {
  persistStatus();
  waitForAppExit().then(runInstall);
});

// Check if app port is still being listened on (= app server still alive)
function isAppPortBusy() {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (busy) => {
      socket.destroy();
      resolve(busy);
    };
    socket.setTimeout(300);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", () => done(false));
    socket.connect(appPort, "127.0.0.1");
  });
}

// Wait for app process to fully exit before running npm (avoids Windows file-lock)
async function waitForAppExit() {
  setPhase("waitingForExit");
  pushLog(`[updater] waiting for app to exit (min ${Math.round(waitMinMs / 1000)}s)...`);

  // Hard minimum delay: OS needs time to release file handles
  await sleep(waitMinMs);

  // Poll app port until free or max timeout
  const deadline = Date.now() + (waitMaxMs - waitMinMs);
  while (Date.now() < deadline) {
    const busy = await isAppPortBusy();
    if (!busy) {
      pushLog(`[updater] app port :${appPort} is free, proceeding`);
      return;
    }
    await sleep(waitCheckMs);
  }
  pushLog(`[updater] timeout waiting for app, proceeding anyway`);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function downloadFile(url, destination, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Terlalu banyak redirect saat mengunduh update"));
    const https = require("https");
    const request = https.get(url, {
      headers: { "User-Agent": "Multiver-Updater", Accept: "application/octet-stream" },
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        const location = res.headers.location;
        res.resume();
        if (!location) return reject(new Error("Redirect update tidak memiliki Location"));
        return downloadFile(new URL(location, url).toString(), destination, redirects + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`Download update gagal: HTTP ${res.statusCode}`));
      }
      const out = fs.createWriteStream(destination);
      res.pipe(out);
      out.on("finish", () => out.close(() => resolve(destination)));
      out.on("error", (error) => { try { fs.unlinkSync(destination); } catch {} reject(error); });
    });
    request.setTimeout(30000, () => request.destroy(new Error("Timeout download update")));
    request.on("error", reject);
  });
}

async function resolveReleaseTarball() {
  const directUrl = process.env.UPDATER_RELEASE_URL ||
    "https://github.com/rizki-habibi/multiver/releases/latest/download/multiver-latest.tgz";
  const fileName = path.basename(new URL(directUrl).pathname) || "multiver-latest.tgz";
  const destination = path.join(updateDir, fileName);
  pushLog(`[updater] downloading official release: ${directUrl}`);
  await downloadFile(directUrl, destination);
  const stat = fs.statSync(destination);
  if (!stat.size) throw new Error("Asset update kosong");
  return destination;
}

async function runInstall() {
  state.attempt += 1;
  setPhase("installing");
  let tarball = null;
  try {
    tarball = await resolveReleaseTarball();
    pushLog(`[updater] attempt ${state.attempt}/${maxRetries} — npm i -g ${path.basename(tarball)}`);
    const isWin = process.platform === "win32";
    const cmd = isWin ? "npm.cmd" : "npm";
    const args = ["i", "-g", tarball, "--no-audit", "--no-fund"];
    const child = spawn(cmd, args, {
      stdio: ["ignore", "pipe", "pipe"], windowsHide: true, shell: isWin,
    });
    child.stdout.on("data", (buf) => { buf.toString().split(/\r?\n/).forEach(pushLog); persistStatus(); });
    child.stderr.on("data", (buf) => { buf.toString().split(/\r?\n/).forEach(pushLog); persistStatus(); });
    child.on("error", (e) => { pushLog(`[updater] spawn error: ${e.message}`); finalize(false, null, e.message); });
    child.on("close", (code) => {
      try { if (tarball && fs.existsSync(tarball)) fs.unlinkSync(tarball); } catch {}
      pushLog(`[updater] npm exited with code ${code}`);
      if (code === 0) return finalize(true, code, null);
      if (state.attempt < maxRetries) {
        pushLog(`[updater] retrying in ${Math.round(retryDelayMs / 1000)}s...`);
        setTimeout(() => runInstall().catch((e) => finalize(false, null, e.message)), retryDelayMs);
        return;
      }
      finalize(false, code, `Install failed after ${maxRetries} attempts`);
    });
  } catch (error) {
    try { if (tarball && fs.existsSync(tarball)) fs.unlinkSync(tarball); } catch {}
    pushLog(`[updater] release download failed: ${error.message}`);
    if (state.attempt < maxRetries) {
      pushLog(`[updater] retrying in ${Math.round(retryDelayMs / 1000)}s...`);
      setTimeout(() => runInstall().catch((e) => finalize(false, null, e.message)), retryDelayMs);
    } else {
      finalize(false, null, `GitHub Release update failed after ${maxRetries} attempts: ${error.message}`);
    }
  }
}
function openBrowser(url) {
  const platform = process.platform;
  const cmd = platform === "darwin" ? `open "${url}"`
    : platform === "win32" ? `start "" "${url}"`
      : `xdg-open "${url}"`;
  try { spawn(cmd, { shell: true, detached: true, stdio: "ignore" }).unref(); } catch { /* ignore */ }
}

// Wait until app port is listening (server alive again), then open dashboard
async function waitForAppAndOpenBrowser() {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    const busy = await isAppPortBusy();
    if (busy) {
      openBrowser(`http://localhost:${appPort}/dashboard`);
      pushLog(`[updater] app ready, opened dashboard`);
      return;
    }
    await sleep(1000);
  }
  pushLog(`[updater] app not responding within 30s, skip browser open`);
}

function relaunchApp() {
  if (process.env.UPDATER_RELAUNCH !== "1") return;
  const cmd = process.env.UPDATER_RELAUNCH_CMD;
  if (!cmd) return;
  let args = [];
  try { args = JSON.parse(process.env.UPDATER_RELAUNCH_ARGS || "[]"); } catch { /* noop */ }
  const isWin = process.platform === "win32";
  try {
    const child = spawn(cmd, args, {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      shell: isWin,
      env: { ...process.env, UPDATER_RELAUNCH: "", UPDATER_RELAUNCH_CMD: "", UPDATER_RELAUNCH_ARGS: "" },
    });
    child.unref();
    pushLog(`[updater] relaunched: ${cmd} ${args.join(" ")} (pid=${child.pid})`);
    // Wait for new app to come up, then auto-open browser so user sees the result
    waitForAppAndOpenBrowser();
  } catch (e) {
    pushLog(`[updater] relaunch failed: ${e.message}`);
  }
}

function finalize(success, exitCode, error) {
  state.done = true;
  state.success = success;
  state.exitCode = exitCode;
  state.error = error;
  state.finishedAt = Date.now();
  setPhase(success ? "done" : "error");
  if (success) relaunchApp();
  // Linger so browser can poll final status, then exit & close the port
  setTimeout(() => {
    try { server.close(); } catch { /* ignore */ }
    process.exit(success ? 0 : 1);
  }, lingerMs);
}
