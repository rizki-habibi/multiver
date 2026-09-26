import fs from "fs";
import path from "path";
import os from "os";

const DATA_DIR = process.env.DATA_DIR
  || (process.platform === "win32"
    ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Multiver")
    : path.join(os.homedir(), ".Multiver"));

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

function readAll() {
  try {
    if (!fs.existsSync(LOG_FILE)) return [];
    const parsed = JSON.parse(fs.readFileSync(LOG_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(logs) {
  ensureDir();
  const bounded = logs.slice(-MAX_EVENTS);
  const tmp = `${LOG_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(bounded, null, 2), "utf8");
  fs.renameSync(tmp, LOG_FILE);
}

export function appendMitmConsoleLog(input = {}) {
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
  const logs = readAll();
  logs.push(entry);
  writeAll(logs);
  return entry;
}

export function clearMitmConsoleLogs() {
  writeAll([]);
}

export function getMitmConsoleLogs({ level, source, tool, search, limit = 100 } = {}) {
  let logs = readAll();
  if (level && String(level).toLowerCase() !== "all") {
    const lv = String(level).toLowerCase();
    logs = logs.filter((l) => String(l.level || "").toLowerCase() === lv);
  }
  if (source && String(source).toLowerCase() !== "all") {
    const sv = String(source).toUpperCase();
    logs = logs.filter((l) => String(l.source || "").toUpperCase() === sv);
  }
  if (tool && String(tool).toLowerCase() !== "all") {
    const tv = String(tool).toLowerCase();
    logs = logs.filter((l) => String(l.tool || "").toLowerCase() === tv);
  }
  if (search) {
    const q = String(search).toLowerCase();
    logs = logs.filter((l) => JSON.stringify(l).toLowerCase().includes(q));
  }
  const n = Math.max(1, Math.min(Number(limit) || 100, MAX_EVENTS));
  return logs.slice(-n);
}

export { LOG_FILE };
