import { NextResponse } from "next/server";
import { getAdapter } from "@/lib/db/driver";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const configured = Boolean(process.env.SUPABASE_DB_URL || process.env.DATABASE_URL);
  try {
    const db = await getAdapter();
    const row = db.get("SELECT 1 AS ok");
    const counts = {
      settings: db.get("SELECT COUNT(*) AS c FROM settings")?.c ?? 0,
      providerConnections: db.get("SELECT COUNT(*) AS c FROM providerConnections")?.c ?? 0,
      providerNodes: db.get("SELECT COUNT(*) AS c FROM providerNodes")?.c ?? 0,
      apiKeys: db.get("SELECT COUNT(*) AS c FROM apiKeys")?.c ?? 0,
    };
    return NextResponse.json({
      ok: row?.ok === 1,
      driver: db.driver,
      cloudConfigured: configured,
      schema: db.driver === "supabase-postgres" ? "multiver_runtime" : "local-sqlite",
      counts,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[health:database]", error?.message || error);
    return NextResponse.json({
      ok: false,
      driver: configured ? "supabase-postgres" : "unknown",
      cloudConfigured: configured,
      error: "Database connection failed",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
