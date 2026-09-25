import { NextResponse } from "next/server";
import { pushBackup, pullSettings, cloudList, cloudRemove, getCloudConfig } from "@/lib/cloud/storage";
import { getSettings, updateSettings } from "@/lib/localDb";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

// POST /api/cloud/sync — push local data to cloud
export async function POST(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider");
    if (!providerId) return NextResponse.json({ error: "provider required" }, { status: 400 });

    const result = await pushBackup(providerId);
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    console.error("[cloud] sync push failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET /api/cloud/sync?provider=gdrive — list remote files
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider");
    if (!providerId) return NextResponse.json({ error: "provider required" }, { status: 400 });

    const files = await cloudList(providerId);
    const cfg = await getCloudConfig(providerId);
    return NextResponse.json(
      { files, lastBackupAt: cfg?.lastBackupAt || null },
      { headers: NO_STORE },
    );
  } catch (error) {
    console.error("[cloud] sync list failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/cloud/sync?provider=gdrive — restore settings from cloud
export async function PATCH(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider");
    if (!providerId) return NextResponse.json({ error: "provider required" }, { status: 400 });

    const parsed = await pullSettings(providerId);
    if (!parsed || !parsed.settings) {
      return NextResponse.json({ error: "No settings backup found in cloud" }, { status: 404 });
    }

    // Never import credentials/auth secrets from a remote file blindly.
    const FORBIDDEN = ["password", "oidcClientSecret", "mitmSudoEncrypted", "cloudProviderData"];
    const body = { ...parsed.settings };
    for (const k of FORBIDDEN) delete body[k];

    await updateSettings(body);
    return NextResponse.json({ ok: true, restoredAt: parsed.exportedAt }, { headers: NO_STORE });
  } catch (error) {
    console.error("[cloud] sync restore failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/cloud/sync?provider=gdrive&name=multiver-settings.json
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider");
    const name = searchParams.get("name");
    if (!providerId || !name) {
      return NextResponse.json({ error: "provider and name required" }, { status: 400 });
    }
    const removed = await cloudRemove(providerId, name);
    return NextResponse.json({ ok: removed }, { headers: NO_STORE });
  } catch (error) {
    console.error("[cloud] sync delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
