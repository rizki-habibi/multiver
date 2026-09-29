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
    };
  }
  if (status === 401 || status === 403 || /unauthorized|invalid api key|token invalid|expired|forbidden/.test(lower)) {
    return {
      code: "AUTH",
      message: "Kunci atau sesi layanan ditolak. Periksa token, login OAuth, atau masa berlaku akun.",
    };
  }
  if (status === 402 || /payment|billing|credit|insufficient|saldo|quota exceeded/.test(lower)) {
    return {
      code: "402",
      message: "Layanan meminta pembayaran, saldo, kredit, atau kuota akun sudah habis.",
    };
  }
  if (status === 429 || /rate.?limit|too many requests|throttl|quota/.test(lower)) {
    return {
      code: "429",
      message: "Layanan membatasi permintaan. Kemungkinan terkena batas laju atau kuota.",
    };
  }
  if (status === 404 || /not found|unknown model|model .*not/.test(lower)) {
    return {
      code: "404",
      message: "Model atau titik akhir tidak ditemukan. Periksa model yang tersedia pada layanan.",
    };
  }
  if (status === 408 || status === 504 || /timeout|timed out|time out/.test(lower)) {
    return {
      code: "TIMEOUT",
      message: "Layanan tidak menjawab dalam batas waktu pengujian.",
    };
  }
  if (status >= 500 || /bad gateway|service unavailable|upstream/.test(lower)) {
    return {
      code: status ? String(status) : "5XX",
      message: "Layanan tujuan mengalami gangguan atau mengembalikan kesalahan server.",
    };
  }
  if (/enotfound|econnrefused|econnreset|network|fetch failed|socket/.test(lower)) {
    return {
      code: "NET",
      message: "Tidak dapat terhubung ke layanan. Periksa jaringan, DNS, proksi, atau alamat layanan.",
    };
  }
  return {
    code: status ? String(status) : "ERR",
    message: "Layanan gagal menjawab. Lihat rincian kesalahan untuk penyebab aslinya.",
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

async function readResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  const raw = await response.text();
  const assistantText = extractAssistantText(raw, contentType);
  return {
    raw,
    contentType,
    assistantText,
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

async function resolveCompatibleModel(provider, connections) {
  for (const connection of connections.filter((item) => item.isActive !== false)) {
    const baseUrl = connection.providerSpecificData?.baseUrl?.replace(/\/$/, "");
    if (!baseUrl) continue;
    const connectionApiKey = connection.apiKey || connection.providerSpecificData?.apiKey || null;
    const connectionAccessToken = connection.accessToken || connection.providerSpecificData?.accessToken || null;
    const headers = { "Content-Type": "application/json" };
    if (connectionApiKey || connectionAccessToken) {
      if (isAnthropicCompatibleProvider(provider)) {
        const credential = connectionApiKey || connectionAccessToken;
        headers["x-api-key"] = credential;
        headers.Authorization = "Bearer " + credential;
        headers["anthropic-version"] = "2023-06-01";
      } else {
        headers.Authorization = "Bearer " + (connectionApiKey || connectionAccessToken);
      }
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(baseUrl + "/models", { headers, signal: controller.signal });
        if (!response.ok) continue;
        const data = await response.json();
        const models = Array.isArray(data) ? data : (data?.data || data?.models || []);
        const selected = firstChatModel(models);
        if (selected) return normalizeModelId(selected, provider);
      } finally {
        clearTimeout(timer);
      }
    } catch {
      // Continue with the next connection/model source.
    }
  }
  return null;
}

async function resolveDynamicModel(provider, connections, modelAliases, customModels) {
  const configuredDefault = connections
    .filter((connection) => connection.isActive !== false)
    .map((connection) => normalizeModelId(connection.defaultModel, provider))
    .find(Boolean);
  if (configuredDefault) return configuredDefault;

  const staticDefault = getDefaultModel(provider);
  if (staticDefault) return staticDefault;

  // Some registry providers (notably OpenCode Free) keep their live/static
  // model catalog on the provider registry instead of providerModels.js.
  // Prefer a declared chat model there before reporting NO_MODEL.
  const registryModel = firstChatModel(PROVIDERS[provider]?.models || []);
  if (registryModel) return normalizeModelId(registryModel, provider);

  const aliased = Object.values(modelAliases || {})
    .filter((fullModel) => typeof fullModel === "string" && fullModel.startsWith(provider + "/"))
    .map((fullModel) => ({ id: normalizeModelId(fullModel, provider), kind: "llm" }));
  const aliasModel = firstChatModel(aliased);
  if (aliasModel) return aliasModel.id;

  const custom = (customModels || [])
    .filter((item) => item?.providerAlias === provider && (item?.kind || item?.type || "llm") === "llm")
    .map((item) => ({ id: item.id, kind: "llm" }));
  const customModel = firstChatModel(custom);
  if (customModel) return customModel.id;

  if (isOpenAICompatibleProvider(provider) || isAnthropicCompatibleProvider(provider)) {
    return resolveCompatibleModel(provider, connections);
  }

  if (provider === "zed") {
    const connection = connections.find((item) => item.isActive !== false);
    if (connection?.accessToken) {
      try {
        const result = await resolveZedModels({
          accessToken: connection.accessToken,
          providerSpecificData: connection.providerSpecificData || {},
        }, { forceRefresh: true });
        const model = firstChatModel(result?.models || []);
        if (model) return normalizeModelId(model, provider);
      } catch {
        // The normal chat request will report the real upstream error.
      }
    }
  }

  return null;
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

  const model = await resolveDynamicModel(provider, connections, modelAliases, customModels);
  if (!model) {
    return {
      provider,
      name: providerName(provider, displayNames),
      status: "failed",
      code: "NO_MODEL",
      message: "Belum ada model chat yang bisa dipakai. Atur model bawaan, alias model, atau koneksi layanan terlebih dahulu.",
      connectionCount: connections.length,
      activeConnectionCount: activeConnections.length,
      hasUsableCredential,
      credentialInfo,
      latencyMs: Date.now() - startedAt,
    };
  }

  if (!hasUsableCredential) {
    return {
      provider,
      name: providerName(provider, displayNames),
      model,
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

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);

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

    const response = await handleChat(internalRequest, null, { internal: true });
    const parsed = await readResponse(response);
    const latencyMs = Date.now() - startedAt;

    if (response.ok && parsed.assistantText) {
      await appendMitmConsoleLog({
        level: "success",
        source: "LAYANAN-TEST",
        event: "provider.chat_test.success",
        message: `Chat uji berhasil — ${provider}/${model}`,
        model: `${provider}/${model}`,
        route: "LAYANAN-TEST",
        status: "SUCCESS",
      }).catch(() => {});

      return {
        provider,
        name: providerName(provider, displayNames),
        model,
        status: "ok",
        code: "OK",
        message: parsed.assistantText.slice(0, 1200),
        connectionCount: connections.length,
        activeConnectionCount: activeConnections.length,
        hasUsableCredential,
        credentialInfo,
        latencyMs,
      };
    }

    const diagnosis = diagnose(response.status, parsed.raw);
    const detail = parsed.raw
      .replace(/authorization\s*[:=]\s*[^\s,}]+/gi, "authorization=[REDAKSI]")
      .replace(/api[_-]?key\s*[:=]\s*[^\s,}]+/gi, "apiKey=[REDAKSI]")
      .slice(0, 800);

    await appendMitmConsoleLog({
      level: "error",
      source: "LAYANAN-TEST",
      event: "provider.chat_test.error",
      message: `Chat uji gagal — ${provider}/${model} HTTP ${response.status}`,
      model: `${provider}/${model}`,
      route: "LAYANAN-TEST",
      status: `HTTP_${response.status}`,
      error: detail || diagnosis.message,
      reason: diagnosis.message,
    }).catch(() => {});

    return {
      provider,
      name: providerName(provider, displayNames),
      model,
      status: "failed",
      code: diagnosis.code,
      message: diagnosis.message,
      error: detail || `HTTP ${response.status}`,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startedAt;
    const rawError = error?.name === "AbortError"
      ? "Timeout 30 detik"
      : error?.message || String(error);
    const diagnosis = diagnose(null, rawError);

    await appendMitmConsoleLog({
      level: "error",
      source: "LAYANAN-TEST",
      event: "provider.chat_test.exception",
      message: `Chat uji gagal — ${provider}/${model}`,
      model: `${provider}/${model}`,
      route: "LAYANAN-TEST",
      status: diagnosis.code,
      error: rawError.slice(0, 800),
      reason: diagnosis.message,
    }).catch(() => {});

    return {
      provider,
      name: providerName(provider, displayNames),
      model,
      status: "failed",
      code: diagnosis.code,
      message: diagnosis.message,
      error: rawError.slice(0, 800),
      connectionCount: connections.length,
      activeConnectionCount: activeConnections.length,
      hasUsableCredential,
      credentialInfo,
      latencyMs,
    };
  } finally {
    clearTimeout(timer);
  }
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
