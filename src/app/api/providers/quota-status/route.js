import { NextResponse } from "next/server";
import { getProviderConnections } from "@/lib/db";

/**
 * GET /api/providers/quota-status
 *
 * Returns a safe provider/connection-level quota-health snapshot.
 * Exact remaining percentages are only reported when a provider-specific
 * usage service has already stored a normalized quota object.
 */
export async function GET() {
  try {
    const connections = await getProviderConnections({ isActive: true });
    const now = Date.now();

    const rows = connections.map((connection) => {
      const psd = connection.providerSpecificData || {};
      const quota = psd.quota && typeof psd.quota === "object" ? psd.quota : null;
      const rateLimitedUntil = connection.rateLimitedUntil || null;
      const rateLimitedMs = rateLimitedUntil ? new Date(rateLimitedUntil).getTime() : 0;
      const modelLocks = Object.entries(connection)
        .filter(([key, value]) => key.startsWith("modelLock_") && value)
        .map(([key, value]) => ({ model: key.slice("modelLock_".length), until: value }))
        .filter(({ until }) => new Date(until).getTime() > now);
      const lastError = String(connection.lastError || "");
      const quotaError = /(quota|rate.?limit|too many requests|capacity|usage limit|payment required|insufficient)/i.test(lastError);

      let status = "healthy";
      if (quota && Number.isFinite(Number(quota.remainingPercentage)) && Number(quota.remainingPercentage) <= 0) {
        status = "exhausted";
      } else if (rateLimitedMs > now || modelLocks.length > 0 || quotaError) {
        status = "limited";
      }

      const remainingPercentage = quota && Number.isFinite(Number(quota.remainingPercentage))
        ? Math.max(0, Math.min(100, Number(quota.remainingPercentage)))
        : null;

      return {
        connectionId: connection.id,
        connectionName: connection.name || connection.connectionName || connection.id,
        provider: connection.provider,
        status,
        exact: remainingPercentage !== null,
        remainingPercentage,
        resetAt: quota?.resetAt || (rateLimitedMs > now ? rateLimitedUntil : null),
        rateLimitedUntil: rateLimitedMs > now ? rateLimitedUntil : null,
        lockedModels: modelLocks.map((item) => item.model),
        backoffLevel: Number(connection.backoffLevel || 0),
        lastError: lastError ? lastError.slice(0, 300) : null,
        source: remainingPercentage !== null ? "provider-cache" : "runtime-health",
        checkedAt: new Date().toISOString(),
      };
    });

    return NextResponse.json({
      updatedAt: new Date().toISOString(),
      providers: rows,
      summary: {
        total: rows.length,
        healthy: rows.filter((row) => row.status === "healthy").length,
        limited: rows.filter((row) => row.status === "limited").length,
        exhausted: rows.filter((row) => row.status === "exhausted").length,
        exact: rows.filter((row) => row.exact).length,
      },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({
      error: "Gagal membaca status kuota penyedia",
      detail: error?.message || String(error),
    }, { status: 500 });
  }
}
