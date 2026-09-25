import { NextResponse } from "next/server";
import { buildAuthUrl, getCloudConfig, saveCloudCredentials } from "@/lib/cloud/storage";
import { getCloudProvider } from "@/lib/cloud/providers";
import { getSettings } from "@/lib/localDb";

export const dynamic = "force-dynamic";

// GET /api/cloud/oauth/start?provider=gdrive
// Begins the OAuth flow for cloud-storage providers. Client ID/secret come from
// env (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET) or from saved settings.
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider");
    const provider = getCloudProvider(providerId);
    if (!provider) return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
    if (provider.supported === false) {
      return NextResponse.json({ error: provider.reason || "Provider not supported" }, { status: 400 });
    }

    const settings = await getSettings();
    const envKey = providerId === "gdrive" ? "CLOUD_GOOGLE_CLIENT_ID" : null;
    const envSecret = providerId === "gdrive" ? "CLOUD_GOOGLE_CLIENT_SECRET" : null;
    const clientId =
      process.env[envKey] || settings.cloudClientId || (await getCloudConfig(providerId))?.clientId;
    const clientSecret =
      process.env[envSecret] ||
      settings.cloudClientSecret ||
      (await getCloudConfig(providerId))?.clientSecret;

    if (!clientId) {
      return NextResponse.json(
        {
          error:
            "Client ID not configured. Set GOOGLE_CLIENT_ID in .env or save it in dashboard settings.",
        },
        { status: 400 },
      );
    }

    const state = `${providerId}:${Math.random().toString(36).slice(2)}`;
    const redirectUri = new URL("/api/cloud/oauth/callback", request.url).toString();

    await saveCloudCredentials(providerId, {
      clientId,
      clientSecret: clientSecret || "",
      oauthState: state,
    });

    const authUrl = buildAuthUrl(providerId, clientId, redirectUri, state);
    return NextResponse.redirect(authUrl);
  } catch (error) {
    console.error("[cloud] oauth start failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
