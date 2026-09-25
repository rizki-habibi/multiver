import { NextResponse } from "next/server";
import { CLOUD_PROVIDER_LIST } from "@/lib/cloud/providers";
import {
  cloudStatus,
  cloudList,
  getCloudConfig,
  saveCloudCredentials,
  clearCloudCredentials,
} from "@/lib/cloud/storage";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store" };

// GET /api/cloud — list providers + connection status
export async function GET() {
  try {
    const providers = await Promise.all(
      CLOUD_PROVIDER_LIST.map(async (p) => {
        const status = await cloudStatus(p.id);
        return {
          id: p.id,
          name: p.name,
          icon: p.icon,
          color: p.color,
          supported: p.supported !== false,
          reason: p.reason || null,
          needsBaseUrl: !!p.needsBaseUrl,
          connected: status.connected,
          account: status.account || null,
          lastBackupAt: (await getCloudConfig(p.id))?.lastBackupAt || null,
        };
      }),
    );

    return NextResponse.json({ providers }, { headers: NO_STORE });
  } catch (error) {
    console.error("[cloud] GET failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/cloud — connect WebDAV account (no OAuth needed) or update config
export async function PATCH(request) {
  try {
    const body = await request.json();
    const { providerId, baseUrl, username, password } = body;
    if (!providerId) return NextResponse.json({ error: "providerId required" }, { status: 400 });

    if (providerId === "webdav") {
      if (!baseUrl) return NextResponse.json({ error: "baseUrl required" }, { status: 400 });
      await saveCloudCredentials(providerId, {
        baseUrl: String(baseUrl).trim(),
        username: String(username || "").trim(),
        password: String(password || ""),
      });
      const status = await cloudStatus(providerId);
      return NextResponse.json({ connected: true, ...status }, { headers: NO_STORE });
    }

    return NextResponse.json({ error: "Use OAuth flow for this provider" }, { status: 400 });
  } catch (error) {
    console.error("[cloud] PATCH failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE /api/cloud?provider=gdrive — disconnect
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider");
    if (!providerId) return NextResponse.json({ error: "provider required" }, { status: 400 });

    await clearCloudCredentials(providerId);
    return NextResponse.json({ connected: false }, { headers: NO_STORE });
  } catch (error) {
    console.error("[cloud] DELETE failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
