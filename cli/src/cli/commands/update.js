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

const { execSync, spawnSync, spawn } = require("child_process");
const https = require("https");
const fs = require("fs");
const path = require("path");
const os = require("os");

const IS_WIN = process.platform === "win32";
const APP_ROOT = path.resolve(__dirname, "..", "..", "..");
const PKG = require(path.join(APP_ROOT, "package.json"));

function log(msg) { console.log(`[update] ${msg}`); }

// Root repo git (bisa beda dari APP_ROOT: update.js ada di <repo>/cli/src/cli/commands,
// APP_ROOT = <repo>/cli, tapi .git di <repo>). Fallback ke APP_ROOT bila bukan repo git.
function getRepoRoot() {
  try {
    const out = execSync("git rev-parse --show-toplevel", {
      cwd: APP_ROOT,
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const root = out.trim();
    if (root && fs.existsSync(path.join(root, "package.json"))) return root;
  } catch { /* bukan repo git / git tidak ada */ }
  return APP_ROOT;
}

// File npm-cli.js; di npm 10 lokasinya bin/npm-cli.js, di npm <10 bin/npm-cli.js juga,
// tapi beberapa distro linux menempatkannya di bin/npm-cli.js vs lib/node_modules.
const NPM_CLI_RELS = [
  ["node_modules", "npm", "bin", "npm-cli.js"],
  ["node_modules", "npm", "lib", "node_modules", "npm", "bin", "npm-cli.js"],
  ["lib", "node_modules", "npm", "bin", "npm-cli.js"],
  ["npm", "node_modules", "npm", "bin", "npm-cli.js"],
];

function findNpmCliIn(dir) {
  for (const rel of NPM_CLI_RELS) {
    const cli = path.join(dir, ...rel);
    if (fs.existsSync(cli)) return cli;
  }
  return null;
}

/**
 * Resolve npm CLI yang andal, LEBIH PHPA npm.cmd shim.
 *
 * Kenapa tidak pakai npm.cmd: shim itu menghitung ulang prefix lewat
 * `%~dp0\node_modules\npm\bin\npm-prefix.js`. Saat di-spawn dari folder lain,
 * resolusi npm-prefix gagal / kembali ke cwd → npm mencari
 * `<cwd>/node_modules/npm/bin/npm-cli.js` yang tidak ada (npm 11+ memindahkan
 * berkas itu). Gejala: "Cannot find module ...\npm\bin\npm-prefix.js".
 * Jalan pintas: jalankan node.exe langsung dengan npm-cli.js absolut.
 *
 * Urutan: (1) npm bundled di samping node (install default), (2) prefix global,
 * (3) PATH scan untuk node/npx shim lalu relatif dari sana, (4) npm prefix.
 */
function resolveNpmCli() {
  // 1) npm bundled di samping node executable (install default Windows/mac/Linux).
  const nodeDir = path.dirname(process.execPath);
  const bundledCli = findNpmCliIn(nodeDir);
  if (bundledCli) return { node: process.execPath, cli: bundledCli };

  // 2) npm global terinstal (prefix global user).
  for (const prefix of [
    process.env.npm_config_prefix,
    IS_WIN ? path.join(process.env.APPDATA || "", "npm") : null,
    IS_WIN ? path.join(process.env.LOCALAPPDATA || "", "npm") : null,
    "/usr/local",
    "/usr",
  ]) {
    if (!prefix) continue;
    const cli = findNpmCliIn(prefix);
    if (cli) return { node: process.execPath, cli };
  }

  // 3) Cari node/npx di PATH; npm terinstal di direktori yang sama (nvm/fnm/volta).
  for (const binName of IS_WIN ? ["node.exe", "npx.cmd", "npm.cmd"] : ["node", "npx", "npm"]) {
    const shim = which(binName);
    if (!shim) continue;
    const cli = findNpmCliIn(path.dirname(fs.realpathSync(shim)));
    if (cli) return { node: fs.realpathSync(shim), cli };
  }

  // 4) Terakhir: resolve lewat `npm prefix` (best-effort).
  try {
    const prefix = execSync('npm prefix', { encoding: "utf8", windowsHide: true, timeout: 8000 }).trim();
    const cli = findNpmCliIn(prefix);
    if (cli) return { node: process.execPath, cli };
  } catch { /* ignore */ }

  return null;
}

function which(bin) {
  // PATHEXT sudah memuat titik (".EXE;.CMD"); jangan tambah titik lagi, atau
  // filename menjadi "node.exe.EXE" yang tidak pernah ada.
  const raw = (process.env.PATHEXT || "").split(IS_WIN ? ";" : ":").filter(Boolean);
  const exts = IS_WIN
    ? raw.map((e) => (e.startsWith(".") ? e : `.${e}`))
    : [""];
  for (const dir of (process.env.PATH || "").split(IS_WIN ? ";" : ":")) {
    if (!dir) continue;
    for (const ext of exts) {
      const full = path.join(dir, bin + ext);
      try {
        if (fs.statSync(full).isFile()) return full;
      } catch { /* not here */ }
    }
  }
  return null;
}

// Jalankan npm via node + npm-cli.js (lewati npm.cmd/npx shim).
// args = array argumen npm (mis. ["install","--no-audit","--no-fund"]).
// Pakai spawnSync tanpa shell: argumen tidak dapat di-inject/pecah oleh
// karakter spasi di path maupun flags seperti --no-audit.
function npmExec(args, opts = {}) {
  if (!Array.isArray(args)) args = String(args).split(/\s+/).filter(Boolean);
  const npm = resolveNpmCli();
  if (npm) {
    return spawnSync(npm.node, [npm.cli, ...args], {
      ...opts,
      cwd: opts.cwd || REPO_ROOT,
      windowsHide: opts.windowsHide ?? false,
      shell: false,
    });
  }
  // Fallback: npm biasa (path di-quote untuk spasi seperti "Program Files").
  const npmCmd = IS_WIN ? "npm.cmd" : "npm";
  return spawnSync(npmCmd, args, {
    ...opts,
    cwd: opts.cwd || REPO_ROOT,
    windowsHide: opts.windowsHide ?? false,
    shell: false,
  });
}

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
const REPO_ROOT = getRepoRoot();

function runGit(args, opts = {}) {
  return execSync(`git ${args.join(" ")}`, {
    cwd: REPO_ROOT,
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
    // runGit melempar pada exit != 0; merge-base --is-ancestor exit 1 artinya
    // lokal BUKAN ancestor → ada commit baru di remote. Karena itu tangkap
    // exit code secara eksplisit, bukan lewat exception.
    let isAncestor = false;
    try {
      execSync(`git merge-base --is-ancestor ${local} ${remote}`, {
        cwd: REPO_ROOT,
        encoding: "utf8",
        windowsHide: true,
        timeout: 20000,
        stdio: ["ignore", "ignore", "ignore"],
      });
      isAncestor = true; // exit 0: lokal adalah ancestor → bisa di-FF
    } catch (e) {
      isAncestor = false; // exit 1/lain: divergen atau lokal lebih maju
    }
    // behind hanya bila remote berbeda DAN lokal bukan ancestor remote.
    // (local === remote dengan ancestor=true → behind harus false.)
    return { behind: local !== remote && !isAncestor, ref: remote };
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
  // Stash perubahan lokal (mis. runtime) agar pull --ff-only tidak konflik.
  // Stash DIPOP kembali setelah pull berhasil; hanya pada divergen berat
  // perubahan itu terpaksa dibuang — dan tetap ditinggalkan tercatat supaya
  // bisa dikembalikan manual (update tidak boleh memakan perbaikan sendiri).
  let stashed = false;
  let stashRef = null;
  try {
    runGit(["stash", "--quiet", "--include-untracked", "--", ":!.next", ":!node_modules"]);
    stashed = true;
    stashRef = runGit(["rev-parse", "-q", "--verify", "refs/stash"]).trim();
  } catch { /* nothing to stash */ }
  try {
    runGit(["pull", "--quiet", "--ff-only"], { timeout: 120000 });
  } catch (e) {
    // FF gagal (divergen). Jangan langsung hard-reset — itu membuang SEMUA
    // perubahan lokal yang belum ter-commit, termasuk perbaikan yang sedang
    // membuat update ini bisa jalan. Simpan dulu stash ke branch cadangan.
    try {
      const branch = runGit(["rev-parse", "--abbrev-ref", "HEAD"]);
      if (stashRef) {
        // Pindahkan stash ke branch bernama agar mudah dikembalikan:
        // `git checkout multiver-backup-<ts>` atau `git stash apply <ref>`.
        const backup = `multiver-backup-${new Date().toISOString().replace(/[:.]/g, "-")}`;
        try {
          runGit(["branch", backup, stashRef]);
          runGit(["stash", "drop", "--quiet", stashRef]);
          log(`  (perubahan lokal dipindahkan ke branch ${backup})`);
        } catch { /* biarkan stash tetap ada */ }
      }
      runGit(["reset", "--hard", `origin/${branch}`], { timeout: 60000 });
      log("  (hard reset ke origin)");
    } catch {
      console.error(`\n❌ git pull gagal: ${e.message.split("\n")[0]}`);
      console.error("   Resolve manual: cd repo && git pull, lalu multiver update --force");
      process.exit(1);
    }
  }
  try { if (stashed) runGit(["stash", "pop", "--quiet"]); } catch { /* stash kosong */ }

  // Install deps + build
  log("Installing dependencies...");
  const installRes = npmExec(["install", "--no-audit", "--no-fund"], { cwd: REPO_ROOT, stdio: "inherit" });
  if (installRes.status !== 0) {
    console.error(`\n❌ npm install gagal (exit ${installRes.status})`);
    console.error("   Selesaikan manual: cd repo && npm install, lalu multiver update --no-relaunch");
    process.exit(1);
  }

  log("Building...");
  const buildRes = npmExec(["run", "build"], { cwd: REPO_ROOT, stdio: "inherit" });
  if (buildRes.status !== 0) {
    console.error(`\n❌ npm run build gagal (exit ${buildRes.status})`);
    console.error("   Repo sudah ter-update; selesaikan build manual: npm run build");
    process.exit(1);
  }

  return true;
}

// ─── Update via npm registry / official GitHub Release fallback ───────────────
function fetchLatestGitHubReleaseVersion() {
  return new Promise((resolve) => {
    const req = https.get(
      "https://api.github.com/repos/rizki-habibi/multiver/releases/latest",
      { timeout: 8000, headers: { "User-Agent": "Multiver-Updater", Accept: "application/vnd.github+json" } },
      (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          try {
            if (res.statusCode !== 200) return resolve(null);
            const release = JSON.parse(data);
            const version = String(release.tag_name || "").replace(/^v/i, "");
            resolve(/^\d+\.\d+\.\d+$/.test(version) ? version : null);
          } catch { resolve(null); }
        });
      }
    );
    req.on("error", () => resolve(null));
    req.on("timeout", () => { req.destroy(); resolve(null); });
  });
}

async function npmUpdate({ force, pkgName }) {
  log("Mode: npm registry / GitHub Release");
  const current = PKG.version;
  const npmLatest = await fetchLatestNpmVersion(pkgName);
  const githubLatest = await fetchLatestGitHubReleaseVersion();
  const latest = [githubLatest, npmLatest].filter(Boolean).sort((a, b) => compareVersions(b, a))[0];
  if (!latest) {
    console.error("\n❌ Tidak dapat mengecek versi terbaru dari GitHub Release maupun npm registry.");
    console.error("   Cek koneksi internet lalu jalankan lagi: multiver update --force");
    process.exit(1);
  }
  if (!force && compareVersions(latest, current) <= 0) {
    log(`Sudah versi terbaru (v${current}). Tidak perlu update.`);
    return false;
  }
  log(`Update tersedia: v${current} → v${latest}`);
  const releaseUrl = "https://github.com/rizki-habibi/multiver/releases/latest/download/multiver-latest.tgz";
  try {
    log("Menginstal asset resmi GitHub Release...");
    const result = npmExec(["i", "-g", releaseUrl, "--no-audit", "--no-fund", "--prefer-online", "--allow-remote"], { stdio: "inherit" });
    if (result.status === 0) return true;
    throw new Error(`npm install release gagal (exit ${result.status})`);
  } catch (githubError) {
    if (npmLatest && compareVersions(npmLatest, current) > 0) {
      log("GitHub Release gagal; mencoba npm registry...");
      const result = npmExec(["i", "-g", `${pkgName}@${npmLatest}`, "--prefer-online", "--no-audit", "--no-fund"], { stdio: "inherit" });
      if (result.status === 0) return true;
    }
    throw githubError;
  }
}
// ─── Relaunch ───────────────────────────────────────────────────────────────
/**
 * Resolve node executable untuk relaunch. Hindari npx.cmd (shim npm-prefix
 * yang sama yang menyebabkan bug update); jalankan router script langsung.
 */
function relaunch(args = []) {
  const isTray = !process.stdin.isTTY;
  const finalArgs = isTray ? ["--tray", "--skip-update", ...args] : args;

  // Router script global (multiver) — sebenarnya junction ke repo cli.js,
  // jadi jalankan node + cli.js langsung lebih andal dari npx.
  const globalEntry = path.join(npmGlobalPrefix(), "node_modules", "multiver", "cli.js");
  if (fs.existsSync(globalEntry)) {
    log(`Relaunching: node "${globalEntry}" ${finalArgs.join(" ")}`);
    const child = spawn(process.execPath, [globalEntry, ...finalArgs], {
      detached: true,
      stdio: "ignore",
      shell: false,
      cwd: os.homedir(),
      windowsHide: false,
    });
    child.unref();
    return;
  }

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

function npmGlobalPrefix() {
  try {
    return execSync('npm prefix -g', { encoding: "utf8", windowsHide: true, timeout: 8000 }).trim();
  } catch {
    return IS_WIN ? path.join(process.env.APPDATA || "", "npm") : "/usr/local";
  }
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
