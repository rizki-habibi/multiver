import { NextResponse } from "next/server";
import {
  scanProviderIntelligence,
  disableProviderConnections,
  deleteZedData,
  deleteOrphanConnections,
  deleteInvalidOrSuspendedConnections,
} from "@/lib/providerIntelligence";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const deep = url.searchParams.get("deep") !== "0";
    return NextResponse.json(await scanProviderIntelligence({ deep }), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json({
      error: "Gagal memeriksa data provider",
      detail: error?.message || String(error),
    }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body?.action;

    if (action === "disable-invalid") {
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
      return NextResponse.json({ ok: true, changed: await disableProviderConnections(ids) });
    }

    if (action === "delete-invalid-suspended") {
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
      return NextResponse.json({
        ok: true,
        ...(await deleteInvalidOrSuspendedConnections(ids)),
      });
    }

    if (action === "delete-orphans") {
      const ids = Array.isArray(body.ids) ? body.ids.filter(Boolean) : [];
      return NextResponse.json({ ok: true, deleted: await deleteOrphanConnections(ids) });
    }

    if (action === "delete-zed") {
      return NextResponse.json({ ok: true, ...(await deleteZedData()) });
    }

    return NextResponse.json({ error: "Aksi tidak dikenal" }, { status: 400 });
  } catch (error) {
    return NextResponse.json({
      error: "Gagal menjalankan tindakan provider",
      detail: error?.message || String(error),
    }, { status: 500 });
  }
}
