import { NextResponse } from "next/server";
import { assertPublicUrl } from "@/shared/utils/ssrfGuard.js";
import { isLocalRequest } from "@/dashboardGuard";
import { getProviderConnections } from "@/models";

export const dynamic = "force-dynamic";

const fetchWithTimeout = (url, options, timeout = 10000) =>
  Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error("Request timeout")), timeout)),
  ]);

// Auto-detect the API style of a compatible endpoint.
// Returns { type: "openai-compatible"|"anthropic-compatible", apiType?: "chat"|"responses" }
// based on which endpoints actually exist on the server.
async function detectStyle(baseUrl, apiKey) {
  const base = baseUrl.trim().replace(/\/$/, "");
  const auth = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  // Probe both dialects instead of returning the first non-auth error. Gateways
  // such as Atria and xKiro expose both OpenAI and Anthropic APIs; choosing
  // Anthropic merely because /messages returned 400 used to misclassify them.
  const probeAnthropic = async () => {
    try {
      const msgBase = base.endsWith("/messages") ? base.slice(0, -9) : base;
      const res = await fetchWithTimeout(
        `${msgBase.replace(/\/v1$/, "")}/v1/messages`,
        {
          method: "POST",
          headers: { ...auth, "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({
            model: "ping",
            max_tokens: 1,
            messages: [{ role: "user", content: "ping" }],
          }),
        },
      );
      return res.status !== 401 && res.status !== 403;
    } catch {
      return false;
    }
  };

  const probeOpenAI = async () => {
    try {
      const modelsRes = await fetchWithTimeout(`${base}/models`, { headers: auth });
      if (modelsRes.status !== 401 && modelsRes.status !== 403) return true;
    } catch {
      // /models missing → probe chat below
    }

    try {
      const chatRes = await fetchWithTimeout(`${base}/chat/completions`, {
        method: "POST",
        headers: auth,
        body: JSON.stringify({
          model: "ping",
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
      });
      return chatRes.status !== 401 && chatRes.status !== 403;
    } catch {
      return false;
    }
  };

  const [anthropic, openai] = await Promise.all([probeAnthropic(), probeOpenAI()]);

  // Prefer OpenAI Chat Completions when both dialects exist. It is the more
  // interoperable default for custom gateways and avoids falsely locking a
  // dual-protocol service into the Anthropic transport.
  if (openai) return { type: "openai-compatible", apiType: "chat", dualProtocol: anthropic };
  if (anthropic) return { type: "anthropic-compatible", dualProtocol: false };
  return null;
}

// POST /api/provider-nodes/detect - Auto-detect API style from baseUrl + apiKey
export async function POST(request) {
  try {
    const body = await request.json();
    const { baseUrl, apiKey } = body;

    if (!baseUrl || !apiKey) {
      return NextResponse.json({ error: "Base URL and API key required" }, { status: 400 });
    }

    try {
      new URL(baseUrl);
    } catch {
      return NextResponse.json({ error: "Invalid URL format" }, { status: 400 });
    }

    // SSRF guard for remote callers; local host keeps self-hosted nodes (e.g. ollama-local)
    if (!isLocalRequest(request)) {
      try {
        assertPublicUrl(baseUrl);
      } catch {
        return NextResponse.json({ error: "URL not allowed" }, { status: 400 });
      }
    }

    const detected = await detectStyle(baseUrl, apiKey);
    if (!detected) {
      return NextResponse.json({
        error: "Tidak terdeteksi endpoint OpenAI/Anthropic yang valid — periksa Base URL dan API key",
      }, { status: 404 });
    }

    // Report how many existing connections already use this baseUrl so the UI
    // can warn about duplicates before creating a node.
    let existingCount = 0;
    try {
      const conns = await getProviderConnections();
      existingCount = conns.filter(
        (c) => c.baseUrl === baseUrl.trim().replace(/\/$/, "") && c.isActive !== false,
      ).length;
    } catch {
      // non-fatal: duplicate hint is best-effort
    }

    return NextResponse.json({ ...detected, existingCount });
  } catch (error) {
    console.error("Error detecting provider style:", error);
    return NextResponse.json({ error: "Gagal mendeteksi tipe endpoint" }, { status: 500 });
  }
}
