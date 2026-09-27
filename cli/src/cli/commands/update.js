/**
 * `multiver update` — auto-update tanpa salin-tempel manual.
 *
 * Multiver tidak dipublikasikan ke npm registry, jadi update memakai git
 * bila dijalankan dari dalam repo clone (install via `node cli/link-global.js`).
 * Fallback: `npm i -g multiver@latest` bila terinstal dari registry.
 *
 * Flow (mode git):
 *   1. git fetch + cek tag/HEAD asal
 *   2. Hentikan semua proses Multiver (termasuk MITM via PID file)
 *   3. git pull --ff-only && npm install && npm run build
 *   4. Relaunch `multiver` (detached) di port yang sama
 *
 * Flags:
 *   --force         Update walau HEAD sudah di commit terbaru
 *   --no-relaunch   Jangan jalankan ulang setelah update
 */

const { execSync, spawn } = require("child_process");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const IS_WIN = process.platform === "win32";
const APP_ROOT = path.resolve(__dirname, "..", "..", "..");
const PKG = require(path.join(APP_ROOT, "package.json"));

function log(msg) { console.log(`[update] ${msg}`); }

// ─── Versi ─────────────────────────────────────────────────────────────────
function fetchLatestNpmVersion(pkgName, { timeout = 6000 } = {}) {
  return new Promise((resolve) => {
    const req = https.get(`https://registry.npmjs.org/${pkgName}/latest`, { timeout }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(res.statusCode === 200 ? (JSON.parse(data).version || null) : null); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

function compareVersions(a, b) {
  const pa = String(a).split(".").map(Number);
  const pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

// ─── Git ───────────────────────────────────────────────────────────────────
function runGit(args, opts = {}) {
  return execSync(`git ${args.join(" ")}`, {
    cwd: APP_ROOT,
    encoding: "utf8",
    windowsHide: true,
    timeout: opts.timeout || 20000,
    stdio: opts.stdio || ["ignore", "pipe", "pipe"],
  }).trim();
}

function inGitRepo() {
  try { runGit(["rev-parse", "--is-inside-work-tree"]); return true; } catch { return false; }
}

// Commit baru tersedia bila origin/HEAD lebih maju dari HEAD lokal.
function hasUpstreamCommits() {
  try {
    runGit(["fetch", "--quiet", "--depth=1", "origin"], { timeout: 30000 });
    const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
    if (!branch || branch === "HEAD") return { behind: true, ref: null };
    const local = runGit(["rev-parse", "HEAD"]);
    const remote = runGit(["rev-parse", `origin/${branch}`]).trim();
    if (!remote) return { behind: false, ref: null };
    // behind = local bukan ancestor dari remote
    let behind = true;
    try { runGit(["merge-base", "--is-ancestor", local, remote]); } catch { behind = false; }
    return { behind, ref: remote };
  } catch { return { behind: false, ref: null }; }
}

// ─── Stop proses ───────────────────────────────────────────────────────────
function stopRunningInstances() {
  log("Stopping running Multiver processes...");

  const dataDir = IS_WIN
    ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Multiver")
    : path.join(os.homedir(), ".Multiver");
  const mitmPidFile = path.join(dataDir, "mitm", ".mitm.pid");
  try {
    if (fs.existsSync(mitmPidFile)) {
      const pid = parseInt(fs.readFileSync(mitmPidFile, "utf8").trim(), 10);
      if (pid) {
        try { execSync(IS_WIN ? `taskkill /F /T /PID ${pid}` : `kill -9 ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 5000 }); } catch { /* best effort */ }
        try { fs.unlinkSync(mitmPidFile); } catch { /* ignore */ }
        log(`  MITM (PID ${pid}) stopped`);
      }
    }
  } catch { /* ignore */ }

  // Bunuh node proses yang match Multiver/next-server (kecuali diri sendiri)
  try {
    if (IS_WIN) {
      const out = execSync(
        `powershell -NonInteractive -WindowStyle Hidden -Command "Get-WmiObject Win32_Process -Filter 'Name=\\"node.exe\\"' | Select-Object ProcessId,CommandLine | ConvertTo-Csv -NoTypeInformation"`,
        { encoding: "utf8", windowsHide: true, timeout: 8000 }
      );
      for (const line of out.split("\n").slice(1).filter((l) => l.trim())) {
        const lower = line.toLowerCase();
        const isApp = lower.includes("multiver") || lower.includes("next-server") || lower.includes("cli.js");
        const m = line.match(/^"(\d+)"/);
        if (isApp && m && Number(m[1]) !== process.pid) {
          try { execSync(`taskkill /F /T /PID ${m[1]}`, { stdio: "ignore", windowsHide: true, timeout: 5000 }); } catch { /* ignore */ }
          log(`  Multiver process (PID ${m[1]}) stopped`);
        }
      }
    } else {
      execSync(`pkill -9 -f "next-server" 2>/dev/null; pkill -9 -f "multiver/cli.js" 2>/dev/null; true`, { stdio: "ignore", timeout: 5000 });
    }
  } catch { /* best effort */ }

  // Lepaskan port gateway
  try {
    const port = Number(process.env.MULTIVER_PORT || 20222);
    if (IS_WIN) {
      const pidOut = execSync(
        `powershell -NonInteractive -WindowStyle Hidden -Command "$c = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1; if ($c) { $c.OwningProcess }"`,
        { encoding: "utf8", windowsHide: true, timeout: 5000 }
      ).trim();
      const pid = parseInt(pidOut, 10);
      if (pid && pid > 4) {
        try { execSync(`taskkill /F /T /PID ${pid}`, { stdio: "ignore", windowsHide: true, timeout: 5000 }); } catch { /* ignore */ }
        log(`  Port ${port} freed (PID ${pid})`);
      }
    } else {
      execSync(`lsof -nP -iTCP:${port} -sTCP:LISTEN -t | xargs -r kill -9`, { stdio: "ignore", timeout: 5000 });
    }
  } catch { /* port bebas atau tidak ada akses */ }

  log("  done");
}

// ─── Update via git (clone lokal) ───────────────────────────────────────────
function gitUpdate({ force }) {
  log("Mode: git (install dari clone repo)");
  const { behind } = hasUpstreamCommits();

  if (!force && !behind) {
    log("Sudah di commit terbaru. Tidak perlu update.");
    log("   Paksa update dengan: multiver update --force");
    return false;
  }

  log("Update tersedia — pulling...");
  // Stash perubahan lokal (mis. runtime) agar pull --ff-only tidak konflik
  try { runGit(["stash", "--quiet", "--include-untracked", "--", ":!.next", ":!node_modules"]); } catch { /* nothing to stash */ }
  try {
    runGit(["pull", "--quiet", "--ff-only"], { timeout: 120000 });
  } catch (e) {
    // FF gagal (divergen) → hard reset ke origin. Aman untuk app read-only.
    try {
      const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
      runGit(["reset", "--hard", `origin/${branch}`], { timeout: 60000 });
      log("  (hard reset ke origin — perubahan lokal dibuang)");
    } catch {
      console.error(`\n❌ git pull gagal: ${e.message.split("\n")[0]}`);
      console.error("   Resolve manual: cd repo && git pull, lalu multiver update --force");
      process.exit(1);
    }
  }
  try { runGit(["stash", "pop", "--quiet"]); } catch { /* stash kosong */ }

  // Install deps + build
  log("Installing dependencies...");
  const npmCmd = IS_WIN ? "npm.cmd" : "npm";
  execSync(`"${npmCmd}" install --no-audit --no-fund`, { cwd: APP_ROOT, stdio: "inherit", windowsHide: false });

  log("Building...");
  execSync(`"${npmCmd}" run build`, { cwd: APP_ROOT, stdio: "inherit", windowsHide: false });

  return true;
}

// ─── Update via npm registry (fallback) ─────────────────────────────────────
async function npmUpdate({ force, pkgName }) {
  log("Mode: npm registry");
  const current = PKG.version;
  const latest = await fetchLatestNpmVersion(pkgName);
  if (!latest) {
    console.error("\n❌ Tidak dapat mengecek versi terbaru (npm registry 404 / tidak terjangkau).");
    console.error("   Multiver tidak dipublikasikan ke npm. Update via git: cd repo && git pull && npm run build");
    console.error("   Atau paksa: multiver update --force");
    process.exit(1);
  }
  if (!force && compareVersions(latest, current) <= 0) {
    log(`Sudah versi terbaru (v${latest}). Tidak perlu update.`);
    return false;
  }
  log(`Update tersedia: v${current} → v${latest}`);
  const target = force ? `${pkgName}@latest` : `${pkgName}@${latest}`;
  const npmCmd = IS_WIN ? "npm.cmd" : "npm";
  execSync(`"${npmCmd}" i -g ${target} --prefer-online`, { stdio: "inherit", windowsHide: false });
  return true;
}

// ─── Relaunch ───────────────────────────────────────────────────────────────
function relaunch(args = []) {
  const isTray = !process.stdin.isTTY;
  const finalArgs = isTray ? ["--tray", "--skip-update", ...args] : args;
  const cmd = IS_WIN ? "npx.cmd" : "npx";
  log(`Relaunching: ${cmd} multiver ${finalArgs.join(" ")}`);
  const child = spawn(cmd, ["multiver", ...finalArgs], {
    detached: true,
    stdio: "ignore",
    shell: false,
    cwd: os.homedir(),
    windowsHide: false,
  });
  child.unref();
}

async function run(args = []) {
  const force = args.includes("--force");
  const noRelaunch = args.includes("--no-relaunch");
  const port = Number(process.env.MULTIVER_PORT || 20222);
  const pkgName = PKG.name;

  log(`Current version: v${PKG.version}`);

  // Repo clone → git update; Otherwise → npm fallback.
  const useGit = inGitRepo();

  // Untuk git mode: hentikan dulu semua proses yang memakai file repo,
  // agar git pull / npm install / build tidak kena EBUSY (Windows).
  if (useGit) stopRunningInstances();

  const updated = useGit
    ? gitUpdate({ force })
    : await npmUpdate({ force, pkgName });

  if (!updated) { process.exit(0); return; }

  log("\n✅ Update selesai.");

  if (!noRelaunch) {
    relaunch(["-p", String(port)]);
    log("Multiver dijalankan ulang. Tunggu beberapa detik lalu refresh browser.");
  } else {
    log("--no-relaunch: mulai manual dengan `multiver`");
  }
  process.exit(0);
}

module.exports = { run, fetchLatestNpmVersion, compareVersions };
