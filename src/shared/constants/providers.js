// Provider definitions
import REGISTRY from "open-sse/providers/registry/index.js";
import { RISK_NOTICE } from "@/shared/constants/providersDisplay";

const MEDIA_ENTRY_KEYS = [
  "serviceKinds", "ttsConfig", "sttConfig", "embeddingConfig",
  "imageConfig", "imageToTextConfig", "videoConfig", "musicConfig",
  "searchViaChat", "searchConfig", "fetchConfig", "credentialFallback", "systemoneConfig",
  "modelsFetcher", "mediaPriority", "hiddenKinds",
];

// Build provider UI object from registry entry
function buildProviderEntry(r) {
  const mediaFields = {};
  if (r.media) Object.assign(mediaFields, r.media);
  for (const k of MEDIA_ENTRY_KEYS) {
    if (r[k] !== undefined) mediaFields[k] = r[k];
  }
  const display = { ...(r.display || {}) };
  if (display.deprecationNotice === "RISK_NOTICE") display.deprecationNotice = RISK_NOTICE;
  return {
    ...display,
    id: r.id,
    alias: r.uiAlias || r.alias,
    ...(r.hidden ? { hidden: true } : {}),
    ...mediaFields,
    ...(r.priority !== undefined ? { priority: r.priority } : {}),
    ...(r.hasFree ? { hasFree: true } : {}),
    ...(r.thinkingConfig ? { thinkingConfig: r.thinkingConfig } : {}),
    ...(r.regions ? { regions: r.regions, defaultRegion: r.defaultRegion } : {}),
    ...(r.hasProviderSpecificData ? { hasProviderSpecificData: true } : {}),
    ...(r.noAuth ? { noAuth: true } : {}),
    ...(r.passthroughModels ? { passthroughModels: true } : {}),
    ...(r.hasOAuth ? { hasOAuth: true } : {}),
    ...(r.authModes ? { authModes: r.authModes } : {}),
    ...(r.authType ? { authType: r.authType } : {}),
    ...(r.authHint ? { authHint: r.authHint } : {}),
    ...(r.category ? { category: r.category } : {}),
    ...(r.hasFree ? { hasFree: true } : {}),
  };
}

const byCategory = (cat) => Object.fromEntries(
  REGISTRY.filter(r => r.category === cat).map(r => [r.id, buildProviderEntry(r)])
);

export const FREE_PROVIDERS = byCategory("free");
export const FREE_TIER_PROVIDERS = byCategory("freeTier");

// Thinking config definitions
// options: list of selectable modes ("auto" = no override from server)
// defaultMode: fallback when user hasn't configured
// extended: claude-style thinking (thinking.type + budget_tokens) — used by most providers
// effort: openai-style reasoning_effort — only openai + codex
export const THINKING_CONFIG = {
  extended: {
    options: ["auto", "on", "off"],
    defaultMode: "auto",
    defaultBudgetTokens: 10000
  },
  effort: {
    options: ["auto", "none", "low", "medium", "high"],
    defaultMode: "auto"
  }
};

export const OAUTH_PROVIDERS = byCategory("oauth");
export const APIKEY_PROVIDERS = byCategory("apikey");

// Web Cookie Providers (use browser session cookie instead of API key)
export const WEB_COOKIE_PROVIDERS = byCategory("webCookie");

// Media provider kinds — each kind maps to a route and endpoint config
export const MEDIA_PROVIDER_KINDS = [
  { id: "embedding", label: "Embedding", icon: "data_array", endpoint: { method: "POST", path: "/v1/embeddings" } },
  { id: "image", label: "Text to Image", icon: "brush", endpoint: { method: "POST", path: "/v1/images/generations" } },
  { id: "imageToText", label: "Image to Text", icon: "image_search", endpoint: { method: "POST", path: "/v1/images/understanding" } },
  { id: "tts", label: "Text To Speech", icon: "record_voice_over", endpoint: { method: "POST", path: "/v1/audio/speech" } },
  { id: "stt", label: "Speech To Text", icon: "mic", endpoint: { method: "POST", path: "/v1/audio/transcriptions" } },
  { id: "webSearch", label: "Web Search", icon: "travel_explore", endpoint: { method: "POST", path: "/v1/search" } },
  { id: "webFetch", label: "Web Fetch", icon: "language", endpoint: { method: "POST", path: "/v1/web/fetch" } },
  { id: "video", label: "Video", icon: "movie", endpoint: { method: "POST", path: "/v1/videos/generations" } },
  { id: "music", label: "Music", icon: "music_note", endpoint: { method: "POST", path: "/v1/audio/music" } },
  { id: "systemone", label: "System One", icon: "psychology", endpoint: { method: "POST", path: "/v1/systemone" }, isNew: true },
];

export const OPENAI_COMPATIBLE_PREFIX = "openai-compatible-";
export const ANTHROPIC_COMPATIBLE_PREFIX = "anthropic-compatible-";
export const CUSTOM_EMBEDDING_PREFIX = "custom-embedding-";

export function isOpenAICompatibleProvider(providerId) {
  return typeof providerId === "string" && providerId.startsWith(OPENAI_COMPATIBLE_PREFIX);
}

export function isAnthropicCompatibleProvider(providerId) {
  return typeof providerId === "string" && providerId.startsWith(ANTHROPIC_COMPATIBLE_PREFIX);
}

export function isCustomEmbeddingProvider(providerId) {
  return typeof providerId === "string" && providerId.startsWith(CUSTOM_EMBEDDING_PREFIX);
}

// All providers (combined)
export const AI_PROVIDERS = { ...FREE_PROVIDERS, ...FREE_TIER_PROVIDERS, ...OAUTH_PROVIDERS, ...APIKEY_PROVIDERS, ...WEB_COOKIE_PROVIDERS };

// Auth methods
export const AUTH_METHODS = {
  oauth: { id: "oauth" },
  apikey: { id: "apikey" },
  cookie: { id: "cookie" },
};

// Helper: Get provider by alias
export function getProviderPriceLabel(provider) {
  if (!provider) return null;
  const { category, hasFree, noAuth } = provider;
  if (category === "free") return { text: "Free", variant: "success" };
  if (category === "freeTier") return { text: "Free Tier", variant: "success" };
  if (noAuth) return { text: "Free", variant: "success" };
  if (hasFree) return { text: "Paid · Free models", variant: "default" };
  if (category) return { text: "Paid", variant: "default" };
  return null;
}

// Modality support for graceful rejection. `serviceKinds` is the registry
// source of truth; LLM providers that omit it default to chat-only.
export function getProviderModalities(provider) {
  if (!provider) return [];
  const kinds = provider.serviceKinds || [];
  const out = new Set();
  for (const k of kinds) {
    if (k === "llm") out.add("text");
    else out.add(k);
  }
  if (!out.has("text") && (!kinds.length || kinds.includes("llm"))) out.add("text");
  return [...out];
}

export function providerSupportsModality(provider, kind) {
  if (!provider || !kind) return true;
  const kinds = provider.serviceKinds;
  if (!kinds || kinds.includes("llm")) return kind === "text";
  return kinds.includes(kind);
}


// Helper: Get provider by alias
export function getProviderByAlias(alias) {
  

for (const provider of Object.values(AI_PROVIDERS)) {
  if (provider.alias === alias || provider.id === alias) {
    return provider;
  }
}
return null;
}

// Helper: Get provider ID from alias
export function resolveProviderId(aliasOrId) {
  const provider = getProviderByAlias(aliasOrId);
  return provider?.id || aliasOrId;
}

// Helper: Get alias from provider ID
export function getProviderAlias(providerId) {
  const provider = AI_PROVIDERS[providerId];
  return provider?.alias || providerId;
}

// Alias to ID mapping (for quick lookup)
export const ALIAS_TO_ID = Object.values(AI_PROVIDERS).reduce((acc, p) => {
  acc[p.alias] = p.id;
  return acc;
}, {});

// ID to Alias mapping
export const ID_TO_ALIAS = Object.values(AI_PROVIDERS).reduce((acc, p) => {
  acc[p.id] = p.alias;
  return acc;
}, {});

// Helper: Get providers by service kind (e.g. "tts", "embedding", "image")
// Providers without serviceKinds default to ["llm"]
export function getProvidersByKind(kind) {
  return Object.values(AI_PROVIDERS)
    .filter((p) => {
      const kinds = p.serviceKinds ?? ["llm"];
      if (!kinds.includes(kind)) return false;
      if (p.hidden) return false;
      if (p.hiddenKinds?.includes(kind)) return false;
      return true;
    })
    .sort((a, b) => (a.priority ?? a.mediaPriority ?? 999) - (b.priority ?? b.mediaPriority ?? 999));
}

// Derive từ registry features flags
export const USAGE_SUPPORTED_PROVIDERS = REGISTRY
  .filter(r => r.features?.usage)
  .map(r => r.id);

export const USAGE_APIKEY_PROVIDERS = REGISTRY
  .filter(r => r.features?.usageApikey)
  .map(r => r.id);
