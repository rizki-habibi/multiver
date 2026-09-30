import {
  getProviderConnections,
  getProviderNodes,
  getModelAliases,
  getCustomModels,
  updateProviderConnection,
  deleteProviderConnection,
  deleteProviderNode,
} from "@/models";
import { getModelsByProviderId } from "open-sse/config/providerModels.js";
import { getProviderAlias, isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers.js";
import { getAntigravityUsage } from "open-sse/services/usage/google.js";

const TIMEOUT_MS = 7000;

function normalizeBaseUrl(value) {
  if (!value || typeof value !== "string") return "";
  return value.trim()
    .replace(/\/(chat\/completions|responses|messages)\/?$/i, "")
    .replace(/\/$/, "");
}

function credentials(connection) {
  const psd = connection.providerSpecificData || {};
  return {
    apiKey: connection.apiKey || psd.apiKey || null,
    accessToken: connection.accessToken || psd.accessToken || null,
    refreshToken: connection.refreshToken || psd.refreshToken || null,
  };
}

function classifyError(text = "", status = null) {
  const value = String(text).toLowerCase();
  if (status === 401 || /invalid[_ ]api[_ ]key|authentication[_ ]error|unauthorized|invalid token|revoked token/.test(value)) return "INVALID_CREDENTIAL";
  if (status === 429 || /rate.?limit|too many requests|quota exceeded|usage limit|monthly request/.test(value)) return "QUOTA_OR_RATE_LIMIT";
  if (status === 402 || /payment required|insufficient balance|credits? required|wallet|deposit required|billing/.test(value)) return "BILLING";
  if (/suspend|suspended|disabled|deactivated|banned/.test(value)) return "SUSPENDED";
  if (status === 404 || /model.*not found|unknown model|model.*unsupported/.test(value)) return "MODEL_NOT_FOUND";
  if (status === 405 || /method not allowed/.test(value)) return "ENDPOINT";
  if (status >= 500 || /bad gateway|service unavailable|upstream/.test(value)) return "UPSTREAM";
  return value ? "ERROR" : "UNKNOWN";
}

function authHeaders(connection, protocol) {
  const c = credentials(connection);
  const token = c.apiKey || c.accessToken;
  const headers = { Accept: "application/json" };
  if (!token) return headers;
  headers.Authorization = `Bearer ${token}`;
  if (protocol === "anthropic-compatible") {
    headers["x-api-key"] = token;
    headers["anthropic-version"] = "2023-06-01";
  }
  return headers;
}

async function fetchModels(connection, baseUrl, protocol) {
  if (!baseUrl) return { checked: false, status: null, models: [], error: null, rateLimits: null };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: authHeaders(connection, protocol),
      signal: controller.signal,
    });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch {}
    const models = (Array.isArray(data) ? data : data?.data || data?.models || data?.results || [])
      .map(item => item?.id || item?.model || item?.name)
      .filter(Boolean)
      .filter(id => !/embedding|moderation|rerank|tts|transcrib|image|video/i.test(String(id)));

    const numberHeader = (names) => {
      for (const name of names) {
        const raw = response.headers.get(name);
        if (raw == null || raw === "") continue;
        const n = Number(raw);
        if (Number.isFinite(n)) return n;
      }
      return null;
    };
    const remainingRequests = numberHeader(["x-ratelimit-remaining-requests", "ratelimit-remaining-requests"]);
    const limitRequests = numberHeader(["x-ratelimit-limit-requests", "ratelimit-limit-requests"]);
    const remainingTokens = numberHeader(["x-ratelimit-remaining-tokens", "ratelimit-remaining-tokens"]);
    const limitTokens = numberHeader(["x-ratelimit-limit-tokens", "ratelimit-limit-tokens"]);

    return {
      checked: true,
      status: response.status,
      models,
      error: response.ok ? null : text.slice(0, 300),
      rateLimits: (remainingRequests !== null || limitRequests !== null || remainingTokens !== null || limitTokens !== null)
        ? { requests: { remaining: remainingRequests, limit: limitRequests }, tokens: { remaining: remainingTokens, limit: limitTokens }, exact: true, source: "response-headers" }
        : null,
    };
  } catch (error) {
    return { checked: true, status: null, models: [], error: error?.name === "AbortError" ? "Timeout" : error?.message || String(error), rateLimits: null };
  } finally {
    clearTimeout(timer);
  }
}

function addModel(rows, seen, id, source, confidence, verified = false) {
  if (!id) return;
  const value = String(id).replace(/^[^/]+\//, "");
  const key = value.toLowerCase();
  if (seen.has(key)) return;
  seen.add(key);
  rows.push({ id: value, source, confidence, verified });
}

function configuredModels(provider, connection, aliases, customModels) {
  const rows = [];
  const seen = new Set();
  addModel(rows, seen, connection.defaultModel, "CONFIGURED", 80);
  for (const [alias, target] of Object.entries(aliases || {})) {
    if (typeof target === "string" && target.startsWith(`${provider}/`)) {
      addModel(rows, seen, target, "ALIAS", 70);
    }
  }
  for (const model of customModels || []) {
    if (model?.providerAlias === provider) addModel(rows, seen, model.id, "CUSTOM", 85);
  }
  for (const model of getModelsByProviderId(provider) || []) {
    addModel(rows, seen, model?.id, "REGISTRY", 40);
  }
  return rows;
}

function applyLiveModels(rows, liveModels) {
  const live = new Set(liveModels.map(String).map(v => v.toLowerCase()));
  for (const row of rows) {
    if (live.has(row.id.toLowerCase())) {
      row.source = "LIVE";
      row.confidence = 100;
      row.verified = true;
    }
  }
  for (const id of liveModels) {
    if (!rows.some(row => row.id.toLowerCase() === String(id).toLowerCase())) {
      rows.push({ id: String(id), source: "LIVE", confidence: 100, verified: true });
    }
  }
}

async function getExactQuota(connection) {
  const token = credentials(connection).accessToken;
  if (!token) return null;
  if (connection.provider === "antigravity") {
    try {
      const result = await getAntigravityUsage(token, connection.providerSpecificData || {});
      if (result?.quotas && Object.keys(result.quotas).length) {
        return { exact: true, source: "provider-api", plan: result.plan || null, quotas: result.quotas };
      }
    } catch {}
  }
  return null;
}

async function mapConcurrent(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  async function run() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

export async function scanProviderIntelligence({ deep = true } = {}) {
  const [connections, nodes, aliases, customModels] = await Promise.all([
    getProviderConnections(),
    getProviderNodes(),
    getModelAliases(),
    getCustomModels(),
  ]);
  const nodeMap = new Map(nodes.map(node => [node.id, node]));
  const providers = [];

  return mapConcurrent(connections, 8, async (connection) => {
    const psd = connection.providerSpecificData || {};
    const node = nodeMap.get(connection.provider);
    const compatible = isOpenAICompatibleProvider(connection.provider) || isAnthropicCompatibleProvider(connection.provider);
    const protocol = node?.apiType || (isAnthropicCompatibleProvider(connection.provider) ? "anthropic-compatible" : compatible ? "openai-compatible" : "native");
    const baseUrl = normalizeBaseUrl(node?.baseUrl || psd.baseUrl || psd.baseURL || "");
    const creds = credentials(connection);
    const models = configuredModels(connection.provider, connection, aliases, customModels);
    const live = deep && (compatible || Boolean(baseUrl)) ? await fetchModels(connection, baseUrl, protocol) : { checked: false, status: null, models: [], error: null, rateLimits: null };
    applyLiveModels(models, live.models);
    const quota = deep ? await getExactQuota(connection) : null;

    const lastError = String(connection.lastError || "");
    const errorType = classifyError(lastError, Number(connection.errorCode) || null);
    const hasCredential = Boolean(creds.apiKey || creds.accessToken || creds.refreshToken);
    let classification = "UNKNOWN";
    if (!hasCredential) classification = "NO_CREDENTIAL";
    else if (errorType === "SUSPENDED") classification = "SUSPENDED";
    else if (errorType === "INVALID_CREDENTIAL" && !creds.refreshToken) classification = "INVALID_CREDENTIAL";
    else if (live.checked && live.status === 401) classification = "INVALID_CREDENTIAL";
    else if (live.checked && live.status === 200) classification = "VERIFIED";
    else if (models.some(model => model.source === "CONFIGURED" || model.source === "CUSTOM" || model.source === "LIVE")) classification = "CONFIGURED";
    else if (models.length) classification = "CATALOG_ONLY";
    else classification = "NO_MODEL";

    if (compatible && !node) classification = "ORPHAN";

    const autoDisable = ["INVALID_CREDENTIAL", "SUSPENDED", "ORPHAN"].includes(classification);

    providers.push({
      connectionId: connection.id,
      provider: connection.provider,
      providerName: node?.name || connection.name || getProviderAlias(connection.provider) || connection.provider,
      connectionName: connection.name || connection.email || connection.id,
      active: connection.isActive !== false,
      protocol,
      baseUrl: baseUrl || null,
      baseHost: baseUrl ? (() => { try { return new URL(baseUrl).host; } catch { return null; } })() : null,
      nodeId: node?.id || null,
      credential: {
        hasApiKey: Boolean(creds.apiKey),
        hasAccessToken: Boolean(creds.accessToken),
        hasRefreshToken: Boolean(creds.refreshToken),
        source: creds.apiKey ? "API Key" : creds.accessToken ? "Access Token" : creds.refreshToken ? "Refresh Token" : "Tidak ada",
      },
      models: models.slice(0, 150),
      liveModels: live.models.slice(0, 150),
      modelDiscovery: live.checked ? (live.status === 200 ? "LIVE" : "ERROR") : "TIDAK DIPERIKSA",
      rateLimits: live.rateLimits,
      quota,
      classification,
      autoDisable,
      lastError: lastError.slice(0, 400) || null,
      lastErrorType: errorType,
      checkedAt: new Date().toISOString(),
    });
  });

  return {
    updatedAt: new Date().toISOString(),
    providers,
    summary: {
      total: providers.length,
      active: providers.filter(p => p.active).length,
      verified: providers.filter(p => p.classification === "VERIFIED").length,
      quotaKnown: providers.filter(p => p.quota?.exact || p.rateLimits?.exact).length,
      invalid: providers.filter(p => ["INVALID_CREDENTIAL", "NO_CREDENTIAL"].includes(p.classification)).length,
      orphan: providers.filter(p => p.classification === "ORPHAN").length,
      suspended: providers.filter(p => p.classification === "SUSPENDED").length,
      noModel: providers.filter(p => p.classification === "NO_MODEL").length,
    },
  };
}

export async function disableProviderConnections(ids = []) {
  const wanted = new Set(ids);
  const connections = await getProviderConnections();
  const changed = [];
  for (const connection of connections) {
    if (!wanted.has(connection.id)) continue;
    await updateProviderConnection(connection.id, {
      isActive: false,
      testStatus: "auto-disabled",
      lastError: connection.lastError || "Dinonaktifkan oleh pemeriksaan Provider Intelligence.",
      lastErrorAt: new Date().toISOString(),
    });
    changed.push(connection.id);
  }
  return changed;
}

export async function deleteZedData() {
  const [connections, nodes] = await Promise.all([getProviderConnections(), getProviderNodes()]);
  let deletedConnections = 0;
  let deletedNodes = 0;
  for (const connection of connections.filter(c => c.provider === "zed")) {
    if (await deleteProviderConnection(connection.id)) deletedConnections++;
  }
  for (const node of nodes.filter(n => n.id === "zed" || /zed/i.test(n.name || "") || /zed/i.test(n.type || ""))) {
    if (await deleteProviderNode(node.id)) deletedNodes++;
  }
  return { deletedConnections, deletedNodes };
}

export async function deleteInvalidOrSuspendedConnections(ids = []) {
  const wanted = new Set(Array.isArray(ids) ? ids.filter(Boolean) : []);
  // Re-scan before deleting so stale UI data cannot delete a connection that has
  // recovered since the last scan. Only strong classifications are removable:
  // 401/invalid credentials and explicit suspended/disabled accounts.
  const scan = await scanProviderIntelligence({ deep: true });
  const candidates = scan.providers.filter((provider) => {
    if (wanted.size > 0 && !wanted.has(provider.connectionId)) return false;
    return provider.classification === "INVALID_CREDENTIAL" || provider.classification === "SUSPENDED";
  });
  let deleted = 0;
  for (const provider of candidates) {
    if (await deleteProviderConnection(provider.connectionId)) deleted++;
  }
  return {
    deleted,
    candidates: candidates.map((provider) => ({
      connectionId: provider.connectionId,
      provider: provider.provider,
      classification: provider.classification,
    })),
  };
}

export async function deleteOrphanConnections(ids = []) {
  const wanted = new Set(ids);
  const [connections, nodes] = await Promise.all([getProviderConnections(), getProviderNodes()]);
  const nodeIds = new Set(nodes.map(node => node.id));
  let deleted = 0;
  for (const connection of connections) {
    if (!wanted.has(connection.id)) continue;
    if (!nodeIds.has(connection.provider) && (isOpenAICompatibleProvider(connection.provider) || isAnthropicCompatibleProvider(connection.provider))) {
      if (await deleteProviderConnection(connection.id)) deleted++;
    }
  }
  return deleted;
}
