import { NextResponse } from "next/server";
import { getProviderConnections } from "@/models";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

// GET /api/providers/health — lightweight status for the Key Validation tab.
// Sensitive fields are stripped; we only surface status + last error.
export async function GET() {
  try {
    const connections = await getProviderConnections();
    const safe = connections.map((c) => ({
      id: c.id,
      provider: c.provider,
      name: c.name || c.provider,
      status: c.status || (c.apiKey || c.accessToken ? "unknown" : "error"),
      lastError: c.lastError || null,
      lastCheckedAt: c.lastCheckedAt || null,
      hasKey: !!(c.apiKey || c.accessToken || c.refreshToken),
    }));
    return NextResponse.json({ connections: safe });
  } catch (error) {
    logger.error("HEALTH", `Failed to list connection health: ${error.message}`);
    return NextResponse.json({ error: "Failed to fetch health" }, { status: 500 });
  }
}

// POST /api/providers/health — validate one or all API keys.
// Body: { connectionId } or { checkAll: true }
// Sends a minimal request to the provider's validate endpoint and records the outcome.
export async function POST(request) {
  try {
    const body = await request.json();
    const connections = await getProviderConnections();

    if (body.checkAll) {
      const t0 = Date.now();
      const results = [];
      for (const c of connections) {
        results.push(await checkOne(c));
      }
      const healthy = results.filter((r) => r.ok).length;
      return NextResponse.json({
        results,
        summary: { total: results.length, healthy, durationMs: Date.now() - t0 },
      });
    }

    const conn = connections.find((c) => c.id === body.connectionId);
    if (!conn) {
      return NextResponse.json({ error: "Connection not found" }, { status: 404 });
    }
    const result = await checkOne(conn);
    return NextResponse.json({ result });
  } catch (error) {
    logger.error("HEALTH", `Key validation failed: ${error.message}`);
    return NextResponse.json({ error: error.message || "Validation failed" }, { status: 500 });
  }
}

// Minimal probe: hit the provider's own models endpoint (cheap, no tokens spent).
async function checkOne(conn) {
  const t0 = Date.now();
  const id = conn.id;
  try {
    if (!conn.apiKey && !conn.accessToken) {
      return { connectionId: id, ok: false, message: "Tidak ada API key/token", latencyMs: Date.now() - t0 };
    }

    // Route to the existing validate logic to avoid duplicating provider specifics.
    const res = await fetch(new URL(`/api/providers/validate`, requestUrlBase()).href, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: conn.provider, apiKey: conn.apiKey || undefined, providerSpecificData: conn.providerSpecificData || {} }),
    });

    const data = await res.json().catch(() => ({}));
    const ok = res.ok && data.valid !== false;
    return {
      connectionId: id,
      ok,
      message: ok ? "Kunci valid" : (data.error || data.message || `Validasi gagal (HTTP ${res.status})`),
      latencyMs: Date.now() - t0,
    };
  } catch (error) {
    return {
      connectionId: id,
      ok: false,
      message: error.message || "Validasi gagal",
      latencyMs: Date.now() - t0,
    };
  }
}

function requestUrlBase() {
  const port = process.env.MULTIVER_PORT || process.env.PORT || 20222;
  return `http://127.0.0.1:${port}`;
}
