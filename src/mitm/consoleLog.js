const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./paths");

const LOG_FILE = path.join(DATA_DIR, "logs", "mitm", "console-log.json");
const MAX_EVENTS = Math.max(1000, Math.min(Number(process.env.MITM_CONSOLE_LOG_MAX || 5000), 5000));

const SENSITIVE_KEYS = new Set([
  "authorization",
  "api_key",
  "apikey",
  "token",
  "access_token",
  "refresh_token",
  "cookie",
  "set-cookie",
  "x-api-key",
  "aws_access_key",
  "aws_secret_key",
  "password",
]);

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._\-+/=]+/gi,
  /(?:access_?token|refresh_?token|api_?key|authorization|cookie|password)\s*[:=]\s*["']?[^"',\s}]+/gi,
];

function ensureDir() {
  fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
}

function redactText(text) {
  if (typeof text !== "string") return text;
  let out = text;
  for (const re of SECRET_PATTERNS) out = out.replace(re, "[REDACTED]");
  return out;
}

function sanitize(value, key = "") {
  if (value == null) return value;
  if (SENSITIVE_KEYS.has(String(key).toLowerCase())) return "[REDACTED]";
  if (typeof value === "string") return redactText(value);
  if (Array.isArray(value)) return value.map((v) => sanitize(v, key));
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = sanitize(v, k);
    return out;
  }
  return value;
}

function readLogs() {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLogs(logs) {
  ensureDir();
  const bounded = logs.slice(-MAX_EVENTS);
  const tmp = `${LOG_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(bounded, null, 2), "utf8");
  fs.renameSync(tmp, LOG_FILE);
}

function emitMitmLog(input = {}) {
  try {
    const entry = sanitize({
      timestamp: new Date().toISOString(),
      level: String(input.level || "info").toLowerCase(),
      source: String(input.source || "MITM").toUpperCase(),
      tool: input.tool || null,
      event: input.event || "log",
      message: input.message || "",
      requestId: input.requestId || null,
      host: input.host || null,
      target: input.target || null,
      model: input.model || null,
      alias: input.alias || null,
      mappedModel: input.mappedModel || null,
      route: input.route || null,
      gateway: input.gateway || null,
      status: input.status || null,
      durationMs: Number.isFinite(input.durationMs) ? Number(input.durationMs) : null,
      reason: input.reason || null,
      error: input.error || null,
      meta: input.meta && typeof input.meta === "object" ? input.meta : null,
    });

    const logs = readLogs();
    logs.push(entry);
    writeLogs(logs);
    return { ok: true, entry };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

module.exports = { emitMitmLog, readMitmConsoleLogs: readLogs, clearMitmConsoleLogs: () => writeLogs([]), LOG_FILE };
