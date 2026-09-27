// CJS reader for MITM standalone process. Reads mitmAlias from JSON cache
// at $DATA_DIR/mitm/aliases.json (synced by app from SQLite on startup + writes).
// JSON-only: no SQLite native binding required in MITM bundle.
const fs = require("fs");
const path = require("path");
const { DATA_DIR } = require("./paths");
const { log } = require("./logger");
const { emitMitmLog } = require("./consoleLog");

const CACHE_FILE = path.join(DATA_DIR, "mitm", "aliases.json");

function readCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) {
      emitMitmLog({
        level: "warning",
        source: "MITM",
        tool: "kiro",
        event: "mitm.alias.cache",
        message: "aliases.json tidak ditemukan",
        reason: "ALIASES_CACHE_NOT_FOUND",
      });
      return null;
    }
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf-8"));
  } catch (error) {
    log(`[MITM][kiro] gagal membaca aliases cache: ${error.message}`);
    emitMitmLog({
      level: "error",
      source: "MITM",
      tool: "kiro",
      event: "mitm.alias.cache",
      message: "Gagal membaca aliases.json",
      error: error.message,
      reason: "ALIASES_CACHE_READ_FAILED",
    });
    return null;
  }
}

function getMitmAlias(toolName) {
  const all = readCache();
  return all?.[toolName] || null;
}

module.exports = { getMitmAlias };
