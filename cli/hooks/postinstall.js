#!/usr/bin/env node
// Postinstall: warm-up SQLite deps into ~/.multiver/runtime so the first
// `multiver` start doesn't need network. Failure here is non-fatal —
// cli.js will retry at runtime if anything is missing.
const { ensureSqliteRuntime } = require("./sqliteRuntime");
const { ensureTrayRuntime } = require("./trayRuntime");
try {
  ensureSqliteRuntime({ silent: false });
  console.log("[multiver] runtime SQLite deps ready");
} catch (e) {
  console.warn(`[multiver] runtime warm-up skipped: ${e.message}`);
}
try {
  ensureTrayRuntime({ silent: false });
} catch (e) {
  console.warn(`[multiver] tray runtime skipped: ${e.message}`);
}
process.exit(0);
