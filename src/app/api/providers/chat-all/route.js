import { NextResponse } from "next/server";
import { getProviderConnections, getProviderNodes, getModelAliases, getCustomModels } from "@/models";
import { FREE_PROVIDERS } from "@/shared/constants/providers";
import { getDefaultModel } from "open-sse/config/providerModels.js";
import { isOpenAICompatibleProvider, isAnthropicCompatibleProvider } from "@/shared/constants/providers";
import { resolveZedModels } from "open-sse/shared/zedAuth.js";
import { PROVIDERS } from "open-sse/config/providers.js";
import { handleChat } from "@/sse/handlers/chat.js";
import { initTranslators } from "open-sse/translator/index.js";
import { appendMitmConsoleLog } from "@/lib/mitmConsoleLog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHAT_ALL_CONCURRENCY = Math.max(
  1,
  Math.min(32, Number(process.env.MULTIVER_CHAT_ALL_CONCURRENCY) || 12),
);
const CHAT_ALL_PROVIDER_TIMEOUT_MS = Math.max(
  2500,
  Math.min(15000, Number(process.env.MULTIVER_CHAT_ALL_TIMEOUT_MS) || 7000),
);
const CHAT_ALL_MODEL_CONCURRENCY = Math.max(
  1,
  Math.min(4, Number(process.env.MULTIVER_CHAT_ALL_MODEL_CONCURRENCY) || 2),
);
const CHAT_ALL_MODEL_DISCOVERY_TIMEOUT_MS = Math.max(
  1200,
  Math.min(5000, Number(process.env.MULTIVER_CHAT_ALL_MODEL_DISCOVERY_TIMEOUT_MS) || 2500),
);

const HIDDEN_PROVIDER_IDS = new Set([
  "cline",
  "clinepass",
  "codebuddy-intl",
  "codebuddy-cn",
  "qoder-cn",
  "kimi",
  "grok-cli",
  "cloudflare-ai",
  "poolside",
  "byteplus",
  "kimchi",
  "kimchi-nope",
  "api-airforce",
  "bazaarlink",
  "kilo-gateway",
]);

let initialized = false;

async function ensureInitialized() {
  if (!initialized) {
    await initTranslators();
    initialized = true;
  }
}

function providerName(provider, displayNames = new Map()) {
  return (
    displayNames.get(provider) ||
    PROVIDERS[provider]?.display?.name ||
    PROVIDERS[provider]?.name ||
    provider
  );
}

function isChatProvider(provider) {
  const kinds = PROVIDERS[provider]?.serviceKinds;
  return !Array.isArray(kinds) || kinds.includes("llm");
}

function diagnose(status, rawError = "") {
  const text = String(rawError || "").trim();
  const lower = text.toLowerCase();

  if (/suspend|suspended|disabled|banned|deactivated|ditangguhkan|dinonaktifkan/.test(lower)) {
    return {
      code: "SUSPEND",
      message: "Akun atau layanan kemungkinan ditangguhkan/dinonaktifkan oleh penyedia. Periksa status akun dan sesi OAuth/kunci API.",
      suggestion: "Nonaktifkan atau hapus kredensial ini jika status suspend sudah terkonfirmasi, lalu gunakan akun/kunci lain.",
    };
  }
  // Quota/billing must win over generic 403 AUTH: many compatible gateways
  // return 403 for an empty wallet or exhausted subscription.
  if (
    status === 402 ||
    /payment required|paid model|billing|credit(?:s)?\b|insufficient(?:_user)?_quota|insufficient balance|saldo|wallet balance|quota(?: exceeded| exhausted)|usage_limit_exceeded|monthly_request_count|deposit required|recharge|top up/.test(lower)
  ) {
    return {
      code: "QUOTA",
      message: "Saldo, kredit, paket, atau kuota layanan sudah habis/tidak mencukupi. Pengujian dilanjutkan ke layanan berikutnya.",
      suggestion: "Periksa saldo/kuota di dashboard provider. Jangan hapus API key hanya karena 402/429.",
    };
  }
  if (status === 429 || /rate.?limit|too many requests|throttl|rate.?limit|quota.*(?:limit|exhaust|reset)/.test(lower)) {
    return {
      code: "429",
      message: "Layanan membatasi permintaan. Kemungkinan terkena batas laju atau kuota.",
      suggestion: "Tunggu reset rate limit, kurangi paralel, atau gunakan koneksi/model lain.",
    };
  }
  if (status === 405 || /method not allowed/.test(lower)) {
    return {
      code: "ENDPOINT_METHOD",
      message: "Alamat layanan aktif, tetapi metode/endpoint yang dipakai tidak cocok. Periksa Base URL dan jenis API (Chat/Responses/Anthropic).",
      suggestion: "Periksa Base URL sampai level /v1 yang benar dan pilih jenis API yang sesuai.",
    };
  }
  if (
    /unsupported_model_schema|model_not_supported|model.*not supported|unknown model|model .*not found|does not support the requested schema/.test(lower)
  ) {
    return {
      code: "MODEL_INCOMPATIBLE",
      message: "Model terdeteksi tetapi tidak cocok dengan skema API yang digunakan. Multiver akan mencoba model chat lain dari katalog layanan.",
      suggestion: "Gunakan model chat dari daftar model provider atau biarkan Multiver mencoba kandidat berikutnya.",
    };
  }
  if (status === 404 || /not found/.test(lower)) {
    return {
      code: "404",
      message: "Model atau titik akhir tidak ditemukan. Periksa model yang tersedia pada layanan.",
      suggestion: "Gunakan model yang benar-benar muncul dari endpoint /models atau katalog provider.",
    };
  }
  if (status === 408 || status === 504 || /timeout|timed out|time out/.test(lower)) {
    return {
      code: "TIMEOUT",
      message: "Layanan tidak menjawab dalam batas waktu pengujian.",
      suggestion: "Periksa jaringan/proksi, naikkan batas waktu jika perlu, atau coba model/provider lain.",
    };
  }
  if (/invalid json response|unexpected token|invalid json/.test(lower)) {
    return {
      code: "UPSTREAM_PROTOCOL",
      message: "Layanan merespons dengan format data yang tidak sesuai. Multiver mencatat error dan melanjutkan ke layanan berikutnya.",
      suggestion: "Periksa Base URL dan pastikan endpoint benar-benar API OpenAI/Anthropic, bukan halaman web.",
    };
  }
  if (status >= 500 || /bad gateway|service unavailable|upstream/.test(lower)) {
    return {
      code: status ? String(status) : "5XX",
      message: "Layanan tujuan mengalami gangguan atau mengembalikan kesalahan server. Pengujian dilanjutkan.",
      suggestion: "Coba ulang beberapa saat lagi dan gunakan fallback provider bila gangguan berlanjut.",
    };
  }
  if (/enotfound|econnrefused|econnreset|network|fetch failed|socket/.test(lower)) {
    return {
      code: "NET",
      message: "Tidak dapat terhubung ke layanan. Periksa jaringan, DNS, proksi, atau alamat layanan.",
      suggestion: "Periksa DNS, koneksi internet, VPN/proksi, firewall, dan Base URL.",
    };
  }
  return {
    code: status ? String(status) : "ERR",
    message: "Layanan gagal menjawab. Lihat rincian kesalahan untuk penyebab aslinya.",
    suggestion: "Buka rincian error, periksa kredensial/model/Base URL, lalu uji ulang koneksi tersebut.",
  };
}

function extractAssistantText(raw, contentType = "") {
  const source = String(raw || "");
  if (!source) return "";

  if (contentType.includes("application/json") || source.trim().startsWith("{")) {
    try {
      const data = JSON.parse(source);
      const content = data?.choices?.[0]?.message?.content ?? data?.choices?.[0]?.delta?.content;
      if (typeof content === "string") return content.trim();
      if (Array.isArray(content)) {
        return content.map((part) => part?.text || "").join("").trim();
      }
      return "";
    } catch {
      // Continue with SSE/plain-text parsing.
    }
  }

  const parts = [];
  for (const line of source.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const data = JSON.parse(payload);
      const content = data?.choices?.[0]?.delta?.content ?? data?.choices?.[0]?.message?.content;
      if (typeof content === "string") parts.push(content);
      else if (Array.isArray(content)) {
        parts.push(content.map((part) => part?.text || "").join(""));
      }
    } catch {
      // Ignore non-JSON SSE comments.
    }
  }
  return parts.join("").trim();
}

function extractUsage(raw, contentType = "") {
  if (!raw) return null;
  const pick = (usage) => {
    if (!usage || typeof usage !== "object") return null;
    const input = usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? usage.inputTokens;
    const output = usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? usage.outputTokens;
    const total = usage.total_tokens ?? usage.totalTokens ?? (Number(input || 0) + Number(output || 0));
    if (![input, output, total].some((value) => Number.isFinite(Number(value)))) return null;
    return {
      inputTokens: Number(input || 0),
      outputTokens: Number(output || 0),
      totalTokens: Number(total || 0),
    };
  };
  try {
    if (contentType.includes("application/json") || raw.trim().startsWith("{")) {
      const data = JSON.parse(raw);
      return pick(data?.usage);
    }
  } catch {}
  for (const line of String(raw).split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const data = JSON.parse(payload);
      const usage = pick(data?.usage);
      if (usage) return usage;
    } catch {}
  }
  return null;
}

async function readResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();
  const assistantText = extractAssistantText(raw, contentType);
  return {
    raw,
    contentType,
    assistantText,
    usage: extractUsage(raw, contentType),
  };
}

function normalizeModelId(model, provider) {
  if (!model) return null;
  const value = typeof model === "string" ? model : model.id || model.model || model.name;
  if (!value) return null;
  const prefix = provider + "/";
  return value.startsWith(prefix) ? value.slice(prefix.length) : value;
}

function firstChatModel(models = []) {
  return models.find((item) => {
    const kind = item?.kind || item?.type;
    const id = String(item?.id || item?.model || item?.name || "").toLowerCase();
    return id && (!kind || kind === "llm" || kind === "chat") && !/embed|embedding|tts|audio|image|video|stt|transcrib/.test(id);
  });
}

async function resolveCompatibleModels(provider, connections) {
  const active = connections.filter((item) => item.isActive !== false);
  const discovered = await Promise.all(active.map(async (connection) => {
    const defaults = [];
    if (connection.defaultModel) defaults.push(connection.defaultModel);

    const baseRaw = connection.providerSpecificData?.baseUrl;
    if (!baseRaw) return { defaults, live: [] };

    const baseUrl = String(baseRaw)
      .replace(/\/chat\/completions\/?$/i, "")
      .replace(/\/responses\/?$/i, "")
      .replace(/\/messages\/?$/i, "")
      .replace(/\/$/, "");
    const connectionApiKey = connection.apiKey || connection.providerSpecificData?.apiKey || null;
    const connectionAccessToken = connection.accessToken || connection.providerSpecificData?.accessToken || null;
    const headers = { "Content-Type": "application/json", Accept: "application/json" };
    if (connectionApiKey || connectionAccessToken) {
      const credential = connectionApiKey || connectionAccessToken;
      if (isAnthropicCompatibleProvider(provider)) {
        headers["x-api-key"] = credential;
        headers.Authorization = "Bearer " + credential;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        headers.Authorization = "Bearer " + credential;
      }
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CHAT_ALL_MODEL_DISCOVERY_TIMEOUT_MS);
      try {
        const response = await fetch(baseUrl + "/models", {
          headers: { ...headers, "Accept-Encoding": "gzip, deflate, br" },
          signal: controller.signal,
        });
        if (!response.ok) return { defaults, live: [] };
        const data = await response.json().catch(() => null);
        const rows = Array.isArray(data) ? data : (data?.data || data?.models || []);
        const live = rows
          .map((item) => item?.id || item?.model || item?.name)
          .filter(Boolean)
          .filter((id) => !/embed|embedding|tts|audio|image|video|stt|transcrib|moderation|rerank/i.test(String(id)))
          .map((id) => normalizeModelId(id, provider))
          .filter(Boolean);
        return { defaults, live };
      } finally {
        clearTimeout(timer);
      }
    } catch {
      return { defaults, live: [] };
    }
  }));

  const candidates = [];
  const liveCandidates = [];
  const seen = new Set();
  const add = (model, target = candidates) => {
    const normalized = normalizeModelId(model, provider);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    target.push(normalized);
  };

  for (const item of discovered) {
    for (const model of item.live) {
      const before = candidates.length;
      add(model, liveCandidates);
      if (candidates.length !== before) candidates.pop();
    }
  }
  // Rebuild the ordering without sharing mutable state between parallel probes.
  const orderedLive = [];
  const orderedSeen = new Set();
  for (const item of discovered) {
    for (const model of item.live) {
      const normalized = normalizeModelId(model, provider);
      const key = String(normalized || "").toLowerCase();
      if (!normalized || orderedSeen.has(key)) continue;
      orderedSeen.add(key);
      orderedLive.push(normalized);
    }
  }
  const fallback = [];
  for (const item of discovered) {
    for (const model of item.defaults) {
      const normalized = normalizeModelId(model, provider);
      const key = String(normalized || "").toLowerCase();
      if (!normalized || orderedSeen.has(key)) continue;
      orderedSeen.add(key);
      fallback.push(normalized);
    }
  }
  return [...orderedLive, ...fallback];
}

async function resolveDynamicModels(provider, connections, modelAliases, customModels) {
  const candidates = [];
  const seen = new Set();
  const add = (model) => {
    const normalized = normalizeModelId(model, provider);
    if (!normalized) return;
    const key = normalized.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push(normalized);
  };

  connections
    .filter((connection) => connection.isActive !== false)
    .forEach((connection) => add(connection.defaultModel));

  add(getDefaultModel(provider));

  const registryModel = firstChatModel(PROVIDERS[provider]?.models || []);
  if (registryModel) add(registryModel.id || registryModel.model || registryModel.name);

  for (const fullModel of Object.values(modelAliases || {})) {
    if (typeof fullModel === "string" && fullModel.startsWith(provider + "/")) add(fullModel);
  }

  for (const item of customModels || []) {
    if (item?.providerAlias === provider && (item?.kind || item?.type || "llm") === "llm") {
      add(item.id);
    }
  }

  if (isOpenAICompatibleProvider(provider) || isAnthropicCompatibleProvider(provider)) {
    for (const model of await resolveCompatibleModels(provider, connections)) add(model);
  }

  if (provider === "zed") {
    const connection = connections.find((item) => item.isActive !== false);
    if (connection?.accessToken) {
      try {
        const result = await resolveZedModels({
          accessToken: connection.accessToken,
          providerSpecificData: connection.providerSpecificData || {},
        }, { forceRefresh: true });
        for (const item of result?.models || []) {
          if (firstChatModel([item])) add(item.id || item.model || item.name);
        }
      } catch {}
    }
  }

  return candidates;
}

async function testProvider(provider, message, requestHeaders, displayNames, modelAliases, customModels) {
  const startedAt = Date.now();
  const connections = await getProviderConnections({ provider });

  if (!isChatProvider(provider)) {
    return {
      provider,
      name: providerName(provider, displayNames),
      status: "skipped",
      code: "NON_CHAT",
      message: "Layanan ini bukan layanan percakapan sehingga tidak diuji dengan pesan chat.",
      latencyMs: Date.now() - startedAt,
    };
  }

  const activeConnections = connections.filter((connection) => connection.isActive !== false);
  const hasNoAuth = FREE_PROVIDERS[provider]?.noAuth === true;
  const credentialInfo = activeConnections.map((connection) => ({
    id: connection.id,
    name: connection.displayName || connection.name || connection.email || connection.id,
    authType: connection.authType || null,
    hasApiKey: Boolean(connection.apiKey || connection.providerSpecificData?.apiKey),
    hasAccessToken: Boolean(connection.accessToken || connection.providerSpecificData?.accessToken),
    credentialSource: connection.apiKey || connection.accessToken
      ? "connection"
      : (connection.providerSpecificData?.apiKey || connection.providerSpecificData?.accessToken ? "providerSpecificData" : "none"),
    hasRefreshToken: Boolean(connection.refreshToken),
    hasProviderBaseUrl: Boolean(connection.providerSpecificData?.baseUrl),
    isActive: connection.isActive !== false,
  }));
  const hasUsableCredential = hasNoAuth || credentialInfo.some((item) => item.hasApiKey || item.hasAccessToken || item.hasRefreshToken);

  if (activeConnections.length === 0 && !hasNoAuth) {
    return {
      provider,
      name: providerName(provider, displayNames),
      status: "skipped",
      code: "NO_CONNECTION",
      message: connections.length > 0
        ? "Semua koneksi layanan sedang nonaktif."
        : "Belum ada koneksi atau kunci aktif untuk layanan ini.",
      connectionCount: connections.length,
      activeConnectionCount: 0,
      credentialInfo: [],
      latencyMs: Date.now() - startedAt,
    };
  }

  const models = await resolveDynamicModels(provider, connections, modelAliases, customModels);
  if (models.length === 0) {
    return {
      provider,
      name: providerName(provider, displayNames),
      status: "failed",
      code: "NO_MODEL",
      message: "Belum ada model chat yang bisa dipakai. Multiver sudah memeriksa model koneksi, alias, katalog, model kustom, dan /models pada layanan kompatibel.",
      connectionCount: connections.length,
      activeConnectionCount: activeConnections.length,
      hasUsableCredential,
      credentialInfo,
      discoveredModels: models.slice(0, 30),
      latencyMs: Date.now() - startedAt,
    };
  }

  if (!hasUsableCredential) {
    return {
      provider,
      name: providerName(provider, displayNames),
      model: null,
      status: "skipped",
      code: "NO_CREDENTIAL",
      message: "Model ditemukan, tetapi layanan belum memiliki kredensial yang bisa dipakai. Daftarkan API key, login OAuth, access token, atau refresh token pada koneksi layanan ini.",
      connectionCount: connections.length,
      activeConnectionCount: activeConnections.length,
      hasUsableCredential: false,
      credentialInfo,
      latencyMs: Date.now() - startedAt,
    };
  }

  // Every discovered chat model gets a real response probe. Models are tested
  // with bounded concurrency so a large provider catalog does not freeze the UI.
  // handleChat already performs ordered account fallback: key/account 1 -> 2 -> ...
  const modelTests = await runWithConcurrency(models, async (model) => {
    const startedModelAt = Date.now();
    const controller = new AbortController();
    let hardTimeout;

    try {
      const headers = new Headers({
        "content-type": "application/json",
        "user-agent": "Multiver-Layanan-Test/1.0",
        "x-multiver-service-test": "1",
      });
      const authorization = requestHeaders.get("authorization");
      const xApiKey = requestHeaders.get("x-api-key");
      if (authorization) headers.set("authorization", authorization);
      if (xApiKey) headers.set("x-api-key", xApiKey);

      const internalRequest = new Request("http://multiver.local/v1/chat/completions", {
        method: "POST",
        headers,
        signal: controller.signal,
        body: JSON.stringify({
          model: `${provider}/${model}`,
          messages: [{ role: "user", content: message }],
          stream: false,
        }),
      });

      const timeoutPromise = new Promise((_, reject) => {
        hardTimeout = setTimeout(() => {
          controller.abort();
          const error = new Error(`Provider test timeout after ${CHAT_ALL_PROVIDER_TIMEOUT_MS}ms`);
          error.name = "AbortError";
          reject(error);
        }, CHAT_ALL_PROVIDER_TIMEOUT_MS);
      });

      const resultPromise = (async () => {
        const response = await handleChat(internalRequest, null, { internal: true });
        const parsed = await readResponse(response);
        return { response, parsed };
      })();

      const { response, parsed } = await Promise.race([resultPromise, timeoutPromise]);
      const latencyMs = Date.now() - startedModelAt;
      const diagnosis = response.ok && parsed.assistantText
        ? null
        : diagnose(response.status, parsed.raw);
      const ok = response.ok && Boolean(parsed.assistantText);

      if (ok) {
        await appendMitmConsoleLog({
          level: "success",
          source: "LAYANAN-TEST",
          event: "provider.model_test.success",
          message: `Model menjawab — ${provider}/${model}`,
          model: `${provider}/${model}`,
          route: "LAYANAN-TEST",
          status: "SUCCESS",
        }).catch(() => {});
      } else {
        const detail = String(parsed.raw || diagnosis?.message || "Tidak ada respons").slice(0, 800);
        await appendMitmConsoleLog({
          level: "error",
          source: "LAYANAN-TEST",
          event: "provider.model_test.failed",
          message: `Model tidak menjawab — ${provider}/${model} HTTP ${response.status || 0}`,
          model: `${provider}/${model}`,
          route: "LAYANAN-TEST",
          status: diagnosis?.code || "ERR",
          error: detail,
          reason: diagnosis?.message || "Tidak ada respons valid",
        }).catch(() => {});
      }

      return {
        model,
        status: ok ? "ok" : "failed",
        code: ok ? "OK" : (diagnosis?.code || String(response.status || "ERR")),
        message: ok
          ? parsed.assistantText.slice(0, 600)
          : (diagnosis?.message || "Model tidak memberikan respons yang bisa dibaca."),
        error: ok ? null : String(parsed.raw || "").slice(0, 800),
        usage: parsed.usage || null,
        latencyMs,
        disabledForTest: !ok,
      };
    } catch (error) {
      const latencyMs = Date.now() - startedModelAt;
      const rawError = error?.name === "AbortError"
        ? `Timeout ${CHAT_ALL_PROVIDER_TIMEOUT_MS}ms`
        : error?.message || String(error);
      const diagnosis = diagnose(null, rawError);
      await appendMitmConsoleLog({
        level: "error",
        source: "LAYANAN-TEST",
        event: "provider.model_test.exception",
        message: `Model gagal — ${provider}/${model}`,
        model: `${provider}/${model}`,
        route: "LAYANAN-TEST",
        status: diagnosis.code,
        error: rawError.slice(0, 800),
        reason: diagnosis.message,
      }).catch(() => {});
      return {
        model,
        status: "failed",
        code: diagnosis.code,
        message: diagnosis.message,
        error: rawError.slice(0, 800),
        usage: null,
        latencyMs,
        disabledForTest: true,
      };
    } finally {
      clearTimeout(hardTimeout);
    }
  }, CHAT_ALL_MODEL_CONCURRENCY);

  const passedModels = modelTests.filter((item) => item.status === "ok");
  const failedModels = modelTests.filter((item) => item.status !== "ok");
  const firstSuccess = passedModels[0] || null;
  const firstFailure = failedModels[0] || null;
  const latencyMs = Date.now() - startedAt;

  if (firstSuccess) {
    return {
      provider,
      name: providerName(provider, displayNames),
      model: firstSuccess.model,
      status: "ok",
      code: failedModels.length > 0 ? "PARTIAL" : "OK",
      message: firstSuccess.message,
      connectionCount: connections.length,
      activeConnectionCount: activeConnections.length,
      hasUsableCredential,
      credentialInfo,
      discoveredModels: models,
      modelCandidates: models,
      modelTests,
      modelSummary: {
        total: modelTests.length,
        passed: passedModels.length,
        failed: failedModels.length,
      },
      attempts: modelTests.length,
      usage: firstSuccess.usage || null,
      latencyMs,
    };
  }

  const failure = firstFailure || {
    model: models[0],
    code: "ERR",
    message: "Tidak ada model yang memberikan respons.",
    error: "Tidak ada hasil pengujian model.",
  };
  return {
    provider,
    name: providerName(provider, displayNames),
    model: failure.model,
    status: "failed",
    code: failure.code,
    message: failure.message,
    error: failure.error || failure.message,
    connectionCount: connections.length,
    activeConnectionCount: activeConnections.length,
    hasUsableCredential,
    credentialInfo,
    discoveredModels: models,
    modelCandidates: models,
    modelTests,
    modelSummary: {
      total: modelTests.length,
      passed: 0,
      failed: failedModels.length,
    },
    attempts: modelTests.length,
    suggestion: "Semua model yang ditemukan sudah diuji. Model yang gagal hanya ditandai nonaktif untuk sesi pengujian; tidak dihapus dari konfigurasi.",
    latencyMs,
  };
}

async function runWithConcurrency(items, worker, limit = 5) {
  const results = new Array(items.length);
  let next = 0;

  async function runner() {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => runner()),
  );
  return results;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const message = typeof body.message === "string" && body.message.trim()
      ? body.message.trim().slice(0, 2000)
      : "Halo, apa kabar?";

    await ensureInitialized();

    const [allConnections, providerNodes, modelAliases, customModels] = await Promise.all([
      getProviderConnections({}),
      getProviderNodes(),
      getModelAliases(),
      getCustomModels(),
    ]);
    const displayNames = new Map(
      (providerNodes || [])
        .filter((node) => node?.id)
        .map((node) => [node.id, node.name || node.prefix || node.id]),
    );
    for (const connection of allConnections) {
      if (connection?.provider && connection?.name && !displayNames.has(connection.provider)) {
        displayNames.set(connection.provider, connection.name);
      }
    }
    const configuredProviders = new Set(
      allConnections
        .map((connection) => connection.provider)
        .filter((provider) => provider && !HIDDEN_PROVIDER_IDS.has(provider)),
    );

    for (const [provider, info] of Object.entries(FREE_PROVIDERS)) {
      if (!HIDDEN_PROVIDER_IDS.has(provider) && info?.noAuth) {
        configuredProviders.add(provider);
      }
    }

    const providers = [...configuredProviders].filter(isChatProvider).sort();
    // Stream mode uses a bounded worker pool: results arrive as soon as each
  // provider answers, while the gateway avoids creating one promise/connection
  // per provider. This keeps the design viable for hundreds or thousands of
  // configured services.
  const streamMode = new URL(request.url).searchParams.get("stream") === "1";
  if (streamMode) {
    const encoder = new TextEncoder();
    const send = (controller, type, payload) => {
      controller.enqueue(encoder.encode(`event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`));
    };

    const stream = new ReadableStream({
      async start(controller) {
        const summary = { total: providers.length, passed: 0, failed: 0, skipped: 0 };
        try {
          const startedAt = Date.now();
          send(controller, "start", {
            message,
            mode: "chat-all",
            total: providers.length,
            concurrency: Math.min(CHAT_ALL_CONCURRENCY, providers.length),
            timeoutMs: CHAT_ALL_PROVIDER_TIMEOUT_MS,
            startedAt,
            providers: providers.map((provider) => ({
              provider,
              name: providerName(provider, displayNames),
              status: "pending",
            })),
          });

          let nextIndex = 0;
          async function worker() {
            while (true) {
              const index = nextIndex++;
              if (index >= providers.length) return;
              const provider = providers[index];
              let result;
              try {
                result = await testProvider(
                  provider,
                  message,
                  request.headers,
                  displayNames,
                  modelAliases,
                  customModels,
                );
              } catch (error) {
                result = {
                  provider,
                  name: providerName(provider, displayNames),
                  status: "failed",
                  code: "ERR",
                  message: error?.message || "Pengujian layanan gagal.",
                  latencyMs: Date.now() - startedAt,
                };
              }

              if (result.status === "ok") summary.passed++;
              else if (result.status === "failed") summary.failed++;
              else summary.skipped++;

              send(controller, "result", {
                ...result,
                progress: {
                  completed: summary.passed + summary.failed + summary.skipped,
                  total: summary.total,
                },
              });
            }
          }

          await Promise.all(
            Array.from(
              { length: Math.min(CHAT_ALL_CONCURRENCY, providers.length) },
              () => worker(),
            ),
          );

          send(controller, "done", {
            message,
            mode: "chat-all",
            testedAt: new Date().toISOString(),
            summary,
          });
        } catch (error) {
          send(controller, "error", {
            error: error?.message || "Pengujian chat semua layanan gagal",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  const results = await runWithConcurrency(
      providers,
      (provider) => testProvider(provider, message, request.headers, displayNames, modelAliases, customModels),
      5,
    );

    const passed = results.filter((item) => item.status === "ok").length;
    const failed = results.filter((item) => item.status === "failed").length;
    const skipped = results.filter((item) => item.status === "skipped").length;

    return NextResponse.json({
      message,
      mode: "chat-all",
      results,
      testedAt: new Date().toISOString(),
      summary: {
        total: results.length,
        passed,
        failed,
        skipped,
      },
    }, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({
      error: error?.message || "Pengujian chat semua layanan gagal",
    }, { status: 500 });
  }
}
