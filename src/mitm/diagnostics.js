// Kiro MITM diagnostics — real runtime checks, no boolean theater.
//
// Each check hits the actual subsystem (port, process, cert file, health endpoint,
// DNS hosts file, gateway /health) and reports PASS/WARN/FAIL with a human-readable
// reason. The dashboard shows the first failing check so the user knows WHAT is
// wrong, not just that something is wrong.

const fs = require("fs");
const path = require("path");
const net = require("net");
const http = require("http");
const https = require("https");

const { DATA_DIR, MITM_DIR } = require("./paths");
const { getMitmStatus } = require("./manager");
const { TOOL_HOSTS } = require("./dns/dnsConfig");

// Gateway port. src/mitm is CJS and standalone; parent sets MULTIVER_PORT from
// the SSOT (src/shared/constants/config.js NETWORK_CONFIG).
const GATEWAY_PORT = Number(process.env.MULTIVER_PORT || 20222);
const MITM_PORT = Number(process.env.MULTIVER_MITM_PORT || 443);

const RESULT = { PASS: "PASS", WARN: "WARN", FAIL: "FAIL" };

function check(name, category, status, reason, detail) {
  return { name, category, status, reason, detail: detail || null };
}

function isPortListening(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(true));   // in use
    tester.once("listening", () => { tester.close(() => resolve(false)); });
    tester.listen({ port, host, exclusive: true });
  });
}

function httpGet(url, { timeout = 4000 } = {}) {
  return new Promise((resolve) => {
    const lib = url.startsWith("https") ? https : http;
    const req = lib.get(url, { rejectUnauthorized: false, timeout }, (res) => {
      let body = "";
      res.on("data", (c) => { body += c; });
      res.on("end", () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode, body }));
    });
    req.on("error", (e) => resolve({ ok: false, error: e.message }));
    req.on("timeout", () => { req.destroy(); resolve({ ok: false, error: "timeout" }); });
  });
}

async function checkGatewayPort() {
  const inUse = await isPortListening(GATEWAY_PORT);
  if (inUse) return check("Gateway port", "GATEWAY", RESULT.PASS, `Port ${GATEWAY_PORT} listening`);
  return check("Gateway port", "GATEWAY", RESULT.FAIL,
    `Port ${GATEWAY_PORT} tidak listening. Mulai Multiver: multiver (dev: npm run dev)`);
}

async function checkGatewayHealth() {
  const res = await httpGet(`http://127.0.0.1:${GATEWAY_PORT}/health`);
  if (res.ok) return check("Gateway /health", "GATEWAY", RESULT.PASS, `Gateway merespon 200`);
  return check("Gateway /health", "GATEWAY", RESULT.FAIL,
    `Gateway tidak merespon: ${res.error || res.status}`);
}

async function checkGatewayV1Models() {
  const res = await httpGet(`http://127.0.0.1:${GATEWAY_PORT}/v1/models`);
  if (!res.ok) return check("Gateway /v1/models", "GATEWAY", RESULT.WARN, `Endpoint /v1/models gagal: ${res.error || res.status}`);
  let count = 0;
  try { count = JSON.parse(res.body)?.data?.length || 0; } catch { /* ignore */ }
  if (count === 0) return check("Gateway /v1/models", "GATEWAY", RESULT.WARN, "Endpoint hidup tapi 0 model — cek provider connection");
  return check("Gateway /v1/models", "GATEWAY", RESULT.PASS, `${count} model tersedia`);
}

async function checkMitmProcess(status) {
  if (status.running) return check("MITM process", "MITM", RESULT.PASS, `MITM berjalan (PID ${status.pid || "?"})`);
  return check("MITM process", "MITM", RESULT.FAIL, "MITM tidak berjalan. Tekan Start di halaman Kiro MITM.");
}

async function checkMitmPort(status) {
  if (!status.running) return check("MITM port " + MITM_PORT, "MITM", RESULT.WARN, "MITM berhenti — port tidak dicek");
  const res = await httpGet(`https://127.0.0.1:${MITM_PORT}/_mitm_health`);
  if (res.ok) return check("MITM health endpoint", "MITM", RESULT.PASS, "MITM engine merespon /_mitm_health");
  return check("MITM health endpoint", "MITM", RESULT.FAIL,
    `MITM berjalan tapi health endpoint gagal: ${res.error || res.status}`);
}

async function checkCert(status) {
  const crtPath = path.join(MITM_DIR, "rootCA.crt");
  if (!status.certExists) return check("CA certificate", "SECURITY", RESULT.FAIL, `Sertifikat CA tidak ada: ${crtPath}. Start MITM untuk generate.`);
  if (!status.certTrusted) {
    return check("CA certificate", "SECURITY", RESULT.WARN,
      "CA ada tapi BELUM dipercaya sistem. Klik \"Install Certificate\" — Kiro IDE akan menolak koneksi TLS tanpa trust.");
  }
  return check("CA certificate", "SECURITY", RESULT.PASS, "CA terpasang dan dipercaya sistem");
}

async function checkKiroDns(status) {
  const hosts = TOOL_HOSTS.kiro || [];
  if (!hosts.length) return check("Kiro target DNS", "MITM", RESULT.FAIL, "TOOL_HOSTS.kiro kosong");
  const dnsOk = !!status.dnsStatus?.kiro;
  if (dnsOk) return check("Kiro target DNS", "MITM", RESULT.PASS, `${hosts.length} host Kiro diarahkan ke 127.0.0.1 (hosts file)`);
  return check("Kiro target DNS", "MITM", RESULT.WARN,
    `Host Kiro belum ditulis ke hosts file. Aktifkan toggle DNS di halaman Kiro MITM — tanpa ini, Kiro IDE tidak pernah lewat MITM.`);
}

// Traffic detection: the proof that interception works. A request through MITM
// leaves a dump file (dev only) or increments the runtime counter we expose here.
// When no traffic has been seen we say so explicitly instead of claiming RUNNING.
async function checkKiroTraffic(runtimeStats) {
  const intercepted = runtimeStats?.intercepted || 0;
  if (intercepted > 0) {
    return check("Kiro traffic", "KIRO", RESULT.PASS, `${intercepted} request Kiro berhasil diintercept`);
  }
  return check("Kiro traffic", "KIRO", RESULT.WARN,
    "MITM aktif tapi belum mendeteksi traffic Kiro. Buka Kiro IDE dan kirim satu prompt.");
}

async function checkForwarding(status) {
  if (!status.running) return check("Forwarding", "MITM", RESULT.WARN, "MITM berhenti — forwarding tidak dicek");
  const res = await httpGet(`http://127.0.0.1:${GATEWAY_PORT}/health`);
  if (res.ok) {
    return check("Forwarding", "MITM", RESULT.PASS,
      `MITM → gateway http://localhost:${GATEWAY_PORT} terjangkau`);
  }
  return check("Forwarding", "MITM", RESULT.FAIL,
    `Gateway http://localhost:${GATEWAY_PORT} tidak terjangkau dari MITM. Intercept akan 502.`);
}

async function checkLogging() {
  const logsDir = path.join(DATA_DIR, "logs", "mitm");
  try {
    if (!fs.existsSync(logsDir)) return check("Logging", "SYSTEM", RESULT.WARN, "Direktori log MITM belum dibuat (dibuat saat traffic pertama)");
    return check("Logging", "SYSTEM", RESULT.PASS, "Direktori log MITM siap");
  } catch (e) {
    return check("Logging", "SYSTEM", RESULT.WARN, `Cek logging gagal: ${e.message}`);
  }
}

async function checkProvider() {
  const res = await httpGet(`http://127.0.0.1:${GATEWAY_PORT}/api/registry/providers`);
  if (!res.ok) {
    // Registry endpoint is optional in older builds — /v1/models is the real test
    const m = await httpGet(`http://127.0.0.1:${GATEWAY_PORT}/v1/models`);
    if (m.ok) return check("Provider", "PROVIDER", RESULT.PASS, "Gateway punya model terdaftar");
    return check("Provider", "PROVIDER", RESULT.FAIL, "Tidak ada provider/model terdaftar di gateway");
  }
  let count = 0;
  try { count = JSON.parse(res.body)?.providers?.length || 0; } catch { /* ignore */ }
  if (count === 0) return check("Provider", "PROVIDER", RESULT.WARN, "0 provider terdaftar");
  return check("Provider", "PROVIDER", RESULT.PASS, `${count} provider terdaftar`);
}

/**
 * Run the full diagnostic battery.
 * @param {Object} runtimeStats - { intercepted: number } from the running MITM
 * @returns {Promise<{checks: Array, overall: string, summary: string}>}
 */
async function runMitmDiagnostics(runtimeStats = {}) {
  const status = await getMitmStatus().catch(() => ({
    running: false, pid: null, certExists: false, certTrusted: false, dnsStatus: {},
  }));

  const checks = [];
  checks.push(await checkGatewayPort());
  checks.push(await checkGatewayHealth());
  checks.push(await checkGatewayV1Models());
  checks.push(await checkMitmProcess(status));
  checks.push(await checkMitmPort(status));
  checks.push(await checkCert(status));
  checks.push(await checkKiroDns(status));
  checks.push(await checkForwarding(status));
  checks.push(await checkKiroTraffic(runtimeStats));
  checks.push(await checkLogging());
  checks.push(await checkProvider());

  const fails = checks.filter((c) => c.status === RESULT.FAIL);
  const warns = checks.filter((c) => c.status === RESULT.WARN);
  const overall = fails.length ? RESULT.FAIL : warns.length ? RESULT.WARN : RESULT.PASS;

  // Summary points at the FIRST blocker so the dashboard explains the cause.
  const firstFail = fails[0];
  const summary = firstFail
    ? firstFail.reason
    : warns.length ? `${warns.length} peringatan: ${warns[0].reason}` : "Semua cek lulus";

  return { checks, overall, summary };
}

module.exports = { runMitmDiagnostics, RESULT };
