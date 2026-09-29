import pkg from "../../../package.json" with { type: "json" };

// App configuration
export const APP_CONFIG = {
  name: "Multiver",
  description: "Advanced Multi-AI Fusion Router",
  version: pkg.version,
};

// GitHub configuration
export const GITHUB_CONFIG = {
  changelogUrl: "https://raw.githubusercontent.com/rizki/multiver/refs/heads/main/CHANGELOG.md",
};

// ─── Network configuration (single source of truth) ────────────────────────
// Every component (gateway, MITM router, updater, tunnels, CLI, tests, UI)
// reads this. Change here and it propagates everywhere.
//
// ponytail: MITM listens on its own privileged port (443, see src/mitm/manager.js
// MITM_PORT); MULTIVER_PORT is the gateway port MITM forwards intercepted traffic
// to (MITM_ROUTER_BASE) and the dashboard's public endpoint.
export const NETWORK_CONFIG = {
  host: process.env.MULTIVER_HOST || "127.0.0.1",
  port: Number(process.env.MULTIVER_PORT || 20222),
  mitmPort: Number(process.env.MULTIVER_MITM_PORT || 443),
  statusPort: Number(process.env.MULTIVER_STATUS_PORT || 20223),
};

export function getMultiverPort() {
  return NETWORK_CONFIG.port;
}

// Canonical user-facing endpoint, e.g. http://localhost:20222
export function getMultiverBaseUrl(host) {
  const h = host || NETWORK_CONFIG.host;
  return `http://${h}:${NETWORK_CONFIG.port}`;
}

// Updater configuration
export const UPDATER_CONFIG = {
  npmPackageName: "multiver",
  installCmd: "npm i -g multiver",
  installCmdLatest: "npm i -g multiver@latest --prefer-online",
  shutdownCountdownSec: 3,
  exitDelayMs: 500,
  statusPort: NETWORK_CONFIG.statusPort, // Incremented to avoid conflict with main port
  statusPollIntervalMs: 1000,
  statusLogTailLines: 8,
  installRetries: 3,
  installRetryDelayMs: 5000,
  lingerAfterDoneMs: 30000,
  waitForExitMinMs: 5000,
  waitForExitMaxMs: 20000,
  waitForExitCheckMs: 500,
  appPort: NETWORK_CONFIG.port, // canonical Multiver gateway port
};

// Theme configuration
export const THEME_CONFIG = {
  storageKey: "theme",
  defaultTheme: "system", // "light" | "dark" | "system"
};

// Subscription
export const SUBSCRIPTION_CONFIG = {
  price: 1.0,
  currency: "USD",
  interval: "month",
  planName: "Pro Plan",
};

// API endpoints
export const API_ENDPOINTS = {
  users: "/api/users",
  providers: "/api/providers",
  payments: "/api/payments",
  auth: "/api/auth",
};

export const CONSOLE_LOG_CONFIG = {
  maxLines: 200,
  pollIntervalMs: 1000,
};

// Client-side store TTL: how long fetched data stays fresh before re-fetching
export const CLIENT_STORE_TTL_MS = 60000;

// Re-export from providers.js for backward compatibility
export {
  FREE_PROVIDERS,
  OAUTH_PROVIDERS,
  APIKEY_PROVIDERS,
  WEB_COOKIE_PROVIDERS,
  AI_PROVIDERS,
  AUTH_METHODS,
} from "./providers.js";

// Re-export from models.js for backward compatibility
export {
  PROVIDER_MODELS,
  AI_MODELS,
} from "./models.js";

