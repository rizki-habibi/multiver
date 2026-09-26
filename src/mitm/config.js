// All intercepted domains + URL patterns per tool

const fs = require("fs");

const IS_DEV = process.env.NODE_ENV === "development";

// Resolve lsof absolute path — packaged apps / sudo secure_path may strip /usr/sbin from PATH
const LSOF_BIN = (() => {
  if (process.platform === "win32") return null;
  for (const p of ["/usr/sbin/lsof", "/usr/bin/lsof", "/sbin/lsof"]) {
    try { fs.accessSync(p, fs.constants.X_OK); return p; } catch { /* try next */ }
  }
  return "lsof"; // last-resort fallback (depends on PATH)
})();

// Intercepted domains — Kiro is the single supported IDE target (see getToolForHost).
// Antigravity / Copilot / Cursor interception was removed; keeping a host here
// requires the same host in TOOL_HOSTS (dnsConfig) or DNS toggle silently no-ops.
const TARGET_HOSTS = [
  "q.us-east-1.amazonaws.com",
  "codewhisperer.us-east-1.amazonaws.com",
  "runtime.us-east-1.kiro.dev",
];

const URL_PATTERNS = {
  // Legacy path form. Kiro IDE 1.0.228+ posts to `/` with x-amz-target instead —
  // see isChatRequest() for the header-based match.
  kiro: ["/generateAssistantResponse"],
};

/**
 * Whether this request is a chat turn we should intercept (vs passthrough).
 * Kiro Runtime moved GenerateAssistantResponse from path `/generateAssistantResponse`
 * to `POST /` + `x-amz-target: KiroRuntimeService.GenerateAssistantResponse`
 * (verified via live mitmproxy capture of Kiro IDE 1.0.228).
 */
function isChatRequest(tool, req) {
  const patterns = URL_PATTERNS[tool] || [];
  if (patterns.some((p) => (req.url || "").includes(p))) return true;
  if (tool === "kiro") {
    const target = String(req.headers?.["x-amz-target"] || "");
    return target.includes("GenerateAssistantResponse");
  }
  return false;
}

// Synonym map: rawModel from request → canonical alias key in mitmAlias DB
const MODEL_SYNONYMS = {};

// Pattern fallback: rawModel regex → canonical alias key (when exact + prefix match fail)
const MODEL_PATTERNS = {};

// Models that must NEVER be re-routed — always passthrough to the real upstream.
const MODEL_NO_MAP = {};

// URL substrings whose request/response should NOT be dumped to file (telemetry, polling, empty)
const LOG_BLACKLIST_URL_PARTS = [
  "recordCodeAssistMetrics",
  "recordTrajectoryAnalytics",
  "fetchAdminControls",
  "listExperiments",
  "fetchUserInfo",
];

function getToolForHost(host) {
  const h = (host || "").split(":")[0];
  if (h === "q.us-east-1.amazonaws.com" || h === "codewhisperer.us-east-1.amazonaws.com" || h === "runtime.us-east-1.kiro.dev") return "kiro";
  return null;
}

function isBinaryData(buffer) {
  if (!buffer || buffer.length === 0) return false;
  const sample = buffer.slice(0, Math.min(100, buffer.length));
  let nonPrintable = 0;
  for (let i = 0; i < sample.length; i++) {
    const byte = sample[i];
    if (byte < 0x20 && byte !== 0x09 && byte !== 0x0A && byte !== 0x0D) {
      nonPrintable++;
    }
    if (byte > 0x7E) nonPrintable++;
  }
  return (nonPrintable / sample.length) > 0.3;
}

// Extract model from URL path (Gemini), body (OpenAI/Anthropic), or Kiro conversationState.
function extractModel(url, body) {
  const urlMatch = url.match(/\/models\/([^/:]+)/);
  const urlModel = urlMatch?.[1] || null;

  if (isBinaryData(body)) return urlModel;

  try {
    const parsed = JSON.parse(body.toString());
    if (parsed.conversationState) {
      return parsed.conversationState.currentMessage?.userInputMessage?.modelId || null;
    }
    const model = urlModel || parsed.model || null;
    const cleanModelName = String(model).replace(/^models\//, "");
    if (cleanModelName === "gemini-3.6-flash-tiered" || cleanModelName === "gemini-3.7-flash-tiered" || cleanModelName === "gemini-3.8-flash-tiered") {
      const ver = cleanModelName.includes("3.8") ? "3.8" : cleanModelName.includes("3.7") ? "3.7" : "3.6";
      const rawLevel = parsed.request?.generationConfig?.thinkingConfig?.thinkingLevel
        || parsed.generationConfig?.thinkingConfig?.thinkingLevel;
      const level = ["high", "medium", "low"].includes(String(rawLevel).toLowerCase())
        ? String(rawLevel).toLowerCase()
        : "medium";
      return `gemini-${ver}-flash-${level}`;
    }
    return model;
  } catch {
    return urlModel;
  }
}

module.exports = { IS_DEV, LSOF_BIN, TARGET_HOSTS, URL_PATTERNS, MODEL_SYNONYMS, MODEL_PATTERNS, MODEL_NO_MAP, LOG_BLACKLIST_URL_PARTS, getToolForHost, isChatRequest, extractModel };
