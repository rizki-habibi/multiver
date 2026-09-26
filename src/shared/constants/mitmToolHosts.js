/**
 * Per-tool DNS hosts — written to hosts file as 127.0.0.1 when MITM DNS is enabled.
 * Kept in sync with MITM routing (src/mitm/config.js TARGET_HOSTS); shared by
 * Node (dnsConfig) and dashboard UI.
 *
 * Kiro is the only MITM target. Antigravity/Copilot/Cursor entries were removed.
 */
const TOOL_HOSTS = {
  kiro: ["runtime.us-east-1.kiro.dev", "q.us-east-1.amazonaws.com", "codewhisperer.us-east-1.amazonaws.com"],
};

module.exports = { TOOL_HOSTS };
