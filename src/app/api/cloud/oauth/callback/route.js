import { NextResponse } from "next/server";
import { exchangeCode, getCloudConfig, saveCloudCredentials } from "@/lib/cloud/storage";

export const dynamic = "force-dynamic";

// GET /api/cloud/oauth/callback?provider=gdrive&code=...&state=...
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const providerId = searchParams.get("provider");
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return NextResponse.redirect(
        new URL(`/dashboard/cloud?error=${encodeURIComponent(error)}`, request.url),
      );
    }
    if (!providerId || !code) {
      return NextResponse.redirect(new URL("/dashboard/cloud?error=missing_code", request.url));
    }

    const cfg = await getCloudConfig(providerId);
    if (!cfg || !cfg.clientId) {
      return NextResponse.redirect(new URL("/dashboard/cloud?error=no_config", request.url));
    }
    // CSRF guard: state must match the one we stored before redirecting.
    if (cfg.oauthState && state && cfg.oauthState !== state) {
      return NextResponse.redirect(new URL("/dashboard/cloud?error=state_mismatch", request.url));
    }

    const redirectUri = new URL("/api/cloud/oauth/callback", request.url).toString();
    const tokens = await exchangeCode(
      providerId,
      code,
      cfg.clientId,
      cfg.clientSecret,
      redirectUri,
    );

    await saveCloudCredentials(providerId, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      oauthState: null,
    });

    return NextResponse.redirect(new URL("/dashboard/cloud?connected=1", request.url));
  } catch (error) {
    console.error("[cloud] oauth callback failed:", error.message);
    return NextResponse.redirect(
      new URL(`/dashboard/cloud?error=${encodeURIComponent(error.message)}`, request.url),
    );
  }
}
