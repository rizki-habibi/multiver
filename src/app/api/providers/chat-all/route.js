import { NextResponse } from "next/server";
import { getProviderConnections } from "@/models";
import { FREE_PROVIDERS } from "@/shared/constants/providers";
import { getDefaultModel } from "open-sse/config/providerModels.js";
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

function providerName(provider) {
  return (
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

async function testProvider(provider, message, requestHeaders) {
  const startedAt = Date.now();
  const connections = await getProviderConnections({ provider });

  if (!isChatProvider(provider)) {
    return {
      provider,
      name: providerName(provider),
      status: "skipped",
      code: "NON_CHAT",
      message: "Layanan ini bukan layanan percakapan sehingga tidak diuji dengan pesan chat.",
      latencyMs: Date.now() - startedAt,
    };
  }

  const activeConnections = connections.filter((connection) => connection.isActive !== false);
  const hasNoAuth = FREE_PROVIDERS[provider]?.noAuth === true;

  if (activeConnections.length === 0 && !hasNoAuth) {
    return {
      provider,
      name: providerName(provider),
      status: "skipped",
      code: "NO_CONNECTION",
      message: connections.length > 0
        ? "Semua koneksi layanan sedang nonaktif."
        : "Belum ada koneksi atau kunci aktif untuk layanan ini.",
      latencyMs: Date.now() - startedAt,
    };
  }

  const model = getDefaultModel(provider);
  if (!model) {
    return {
      provider,
      name: providerName(provider),
      status: "failed",
      code: "NO_MODEL",
      message: "Tidak ditemukan model chat bawaan untuk layanan ini.",
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
        stream: true,
        temperature: 0,
        max_tokens: 120,
      }),
    });

    const response = await handleChat(internalRequest);
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
        name: providerName(provider),
        model,
        status: "ok",
        code: "OK",
        message: parsed.assistantText.slice(0, 1200),
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
      name: providerName(provider),
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
      name: providerName(provider),
      model,
      status: "failed",
      code: diagnosis.code,
      message: diagnosis.message,
      error: rawError.slice(0, 800),
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

    const allConnections = await getProviderConnections({});
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
      (provider) => testProvider(provider, message, request.headers),
      5,
    );

    const passed = results.filter((item) => item.status === "ok").length;
    const failed = results.filter((item) => item.status === "failed").length;
    const skipped = results.filter((item) => item.status === "skipped").length;

    return NextResponse.json({
      message,
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
