// Central structured logger for the Multiver gateway.
//
// One ring buffer + EventEmitter, surfaced to the dashboard by /api/logs and
// /api/logs/stream (SSE). Every log line carries a level, a category, and an
// optional requestId so a single request can be traced across gateway hops.
//
// Secrets: log() never accepts raw credentials. headerRedaction() exists for
// callers that must log header maps (MITM dumps, request details).

import { EventEmitter } from "events";
import { randomUUID } from "crypto";

export const LOG_LEVELS = { TRACE: 0, DEBUG: 1, INFO: 2, NOTICE: 3, WARN: 4, ERROR: 5, FATAL: 6 };
export const LOG_CATEGORIES = [
  "SYSTEM", "GATEWAY", "MITM", "KIRO", "PROVIDER", "MODEL", "ACCOUNT", "QUOTA",
  "REQUEST", "RESPONSE", "AUTH", "NETWORK", "PROXY", "DATABASE", "CACHE",
  "SECURITY", "PERFORMANCE", "ERROR",
];

const LEVEL_NAMES = Object.keys(LOG_LEVELS);
const DEFAULT_LEVEL = LOG_LEVELS.INFO;
const RING_CAP = 1000;

const SENSITIVE_HEADER_NAMES = new Set([
  "authorization", "x-api-key", "cookie", "token", "api-key", "set-cookie",
  "x-mv-peer-token", "x-mv-cli-token", "x-9r-peer-token", "x-9r-cli-token",
  "proxy-authorization", "x-amz-security-token",
]);

const SECRET_VALUE_PATTERNS = [
  /(?:bearer|sk-|sk_|xoxb-|xoxp-|gh[pu]_|aiza|ya29\.)[A-Za-z0-9_\-]+/gi,
  /(?:access_?token|refresh_?token|api_?key|client_?secret|password)["'\s:=]+[A-Za-z0-9_\-\.]+/gi,
];

function currentLevel() {
  const env = (process.env.LOG_LEVEL || "").toUpperCase();
  return LOG_LEVELS[env] ?? DEFAULT_LEVEL;
}

// Module-level state. Next.js dev hot-reload resets module state; the global keeps
// the buffer + listeners alive across reloads (same pattern as usageRepo statsEmitter).
if (!global._multiverLogger) {
  global._multiverLogger = {
    ring: [],
    emitter: new EventEmitter(),
    seq: 0,
  };
  global._multiverLogger.emitter.setMaxListeners(100);
}

const state = global._multiverLogger;
export const logEmitter = state.emitter;

function pad(n) { return String(n).padStart(2, "0"); }

function ts() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function levelName(n) { return LEVEL_NAMES[n] || "INFO"; }

/**
 * Mask a secret in place for display. Never returns the raw value.
 */
export function maskSecret(value, visible = 4) {
  if (!value || typeof value !== "string") return "";
  if (value.length <= visible * 2) return "***";
  return `${value.slice(0, visible)}***${value.slice(-visible)}`;
}

/**
 * Redact sensitive headers before a header map is logged or persisted.
 * Returns a new object; the input is never mutated.
 */
export function redactHeaders(headers = {}) {
  const out = {};
  for (const [k, v] of Object.entries(headers)) {
    const lk = String(k).toLowerCase();
    out[k] = SENSITIVE_HEADER_NAMES.has(lk) ? "********" : v;
  }
  return out;
}

/**
 * Scrub secrets from an arbitrary string (body snippet, error text).
 */
export function redactSecrets(text) {
  if (!text || typeof text !== "string") return text;
  let out = text;
  for (const re of SECRET_VALUE_PATTERNS) {
    out = out.replace(re, (m) => maskSecret(m, 2));
  }
  return out;
}

/**
 * Create a request id for a new request. Prefer the client's correlation id when
 * the caller supplies one (never trusted for security decisions — trace only).
 */
export function createRequestId(prefix = "req") {
  const d = new Date();
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  const rand = randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase();
  return `${prefix}_${stamp}_${rand}`;
}

function push(level, category, message, meta) {
  if (level < currentLevel()) return;

  const entry = {
    ts: ts(),
    iso: new Date().toISOString(),
    seq: ++state.seq,
    level: levelName(level),
    category: LOG_CATEGORIES.includes(category) ? category : "SYSTEM",
    message: redactSecrets(String(message)),
    requestId: meta?.requestId || null,
    provider: meta?.provider || null,
    model: meta?.model || null,
    meta: meta ?? null,
  };

  state.ring.push(entry);
  if (state.ring.length > RING_CAP) state.ring.splice(0, state.ring.length - RING_CAP);

  // Mirror to console so `multiver --log` and process stdout still show everything.
  const fn = level >= LOG_LEVELS.ERROR ? console.error : console.log;
  fn(`[${entry.ts}] [${entry.category}] ${entry.level} ${entry.message}`);

  // Fail-open: a dead listener must never break the request path.
  try { state.emitter.emit("log", entry); } catch { /* ignore */ }
}

export const logger = {
  trace: (cat, msg, meta) => push(LOG_LEVELS.TRACE, cat, msg, meta),
  debug: (cat, msg, meta) => push(LOG_LEVELS.DEBUG, cat, msg, meta),
  info: (cat, msg, meta) => push(LOG_LEVELS.INFO, cat, msg, meta),
  notice: (cat, msg, meta) => push(LOG_LEVELS.NOTICE, cat, msg, meta),
  warn: (cat, msg, meta) => push(LOG_LEVELS.WARN, cat, msg, meta),
  error: (cat, msg, meta) => push(LOG_LEVELS.ERROR, cat, msg, meta),
  fatal: (cat, msg, meta) => push(LOG_LEVELS.FATAL, cat, msg, meta),
  // error() aliases keep parity with the previous gateway logger.
  err: (cat, msg, meta) => push(LOG_LEVELS.ERROR, cat, msg, meta),
};

export function getRecentLogs(limit = 200, filter = {}) {
  let items = state.ring;
  if (filter.level) {
    const min = LOG_LEVELS[String(filter.level).toUpperCase()] ?? 0;
    items = items.filter((e) => LOG_LEVELS[e.level] >= min);
  }
  if (filter.category) items = items.filter((e) => e.category === filter.category);
  if (filter.provider) items = items.filter((e) => e.provider === filter.provider);
  if (filter.model) items = items.filter((e) => e.model === filter.model);
  if (filter.requestId) items = items.filter((e) => e.requestId === filter.requestId);
  const n = Math.max(1, Math.min(Number(limit) || 200, RING_CAP));
  return items.slice(-n);
}

export default logger;
