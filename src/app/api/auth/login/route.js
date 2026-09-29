import { NextResponse } from "next/server";
import { getSettings } from "@/lib/localDb";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { setDashboardAuthCookie } from "@/lib/auth/dashboardSession";
import { isOidcConfigured } from "@/lib/auth/oidc";
import { isSamlConfigured } from "@/lib/auth/saml.js";
import { checkLock, recordFail, recordSuccess, getClientIp } from "@/lib/auth/loginLimiter";
import { isLocalRequest } from "@/dashboardGuard";

const RESET_HINT = "Forgot password? Reset to default via Multiver CLI → Settings → Reset Password to Default.";
const NO_STORE_HEADERS = { "Cache-Control": "no-store" };

function isTunnelRequest(request, settings) {
  try {
    const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
    const tunnelHost = settings.tunnelUrl ? new URL(settings.tunnelUrl).hostname.toLowerCase() : "";
    const tailscaleHost = settings.tailscaleUrl ? new URL(settings.tailscaleUrl).hostname.toLowerCase() : "";
    return (tunnelHost && host === tunnelHost) || (tailscaleHost && host === tailscaleHost);
  } catch {
    return false;
  }
}

export async function POST(request) {
  try {
    const ip = getClientIp(request);
    const lock = checkLock(ip);
    if (lock.locked) {
      return NextResponse.json(
        { error: "Too many failed attempts. Try again later.", retryAfter: lock.retryAfter, resetHint: RESET_HINT },
        { status: 429, headers: { "Retry-After": String(lock.retryAfter), ...NO_STORE_HEADERS } }
      );
    }

    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === "string" ? body.password : "";
    const settings = await getSettings();

    if (isTunnelRequest(request, settings) && settings.tunnelDashboardAccess !== true) {
      return NextResponse.json({ error: "Dashboard access via tunnel is disabled" }, { status: 403, headers: NO_STORE_HEADERS });
    }

    const storedHash = settings.password;
    if (settings.authMode === "sso" || settings.authMode === "saml" || settings.authMode === "oidc") {
      const ssoType = settings.ssoType || (settings.authMode === "saml" ? "saml" : "oidc");
      if (ssoType === "saml" && isSamlConfigured(settings)) {
        return NextResponse.json({ error: "Password login is disabled. Use SAML SSO sign in." }, { status: 403, headers: NO_STORE_HEADERS });
      }
      if (ssoType === "oidc" && isOidcConfigured(settings)) {
        return NextResponse.json({ error: "Password login is disabled. Use OIDC sign in." }, { status: 403, headers: NO_STORE_HEADERS });
      }
    }

    const initialPassword = process.env.INITIAL_PASSWORD || "123456";
    const isValid = storedHash
      ? await bcrypt.compare(password, storedHash)
      : password === initialPassword;

    if (isValid) {
      recordSuccess(ip);
      const mustChangePassword = !storedHash && !process.env.INITIAL_PASSWORD && !isLocalRequest(request);
      if (mustChangePassword) {
        return NextResponse.json(
          { success: false, error: "Default password must be changed before remote access.", mustChangePassword },
          { status: 403, headers: NO_STORE_HEADERS }
        );
      }
      const cookieStore = await cookies();
      await setDashboardAuthCookie(cookieStore, request, { role: "admin", authProvider: "password" });
      return NextResponse.json({ success: true, mustChangePassword: false }, { headers: NO_STORE_HEADERS });
    }

    const { remainingBeforeLock } = recordFail(ip);
    const postLock = checkLock(ip);
    if (postLock.locked) {
      return NextResponse.json(
        { error: "Too many failed attempts. Try again later.", retryAfter: postLock.retryAfter, resetHint: RESET_HINT },
        { status: 429, headers: { "Retry-After": String(postLock.retryAfter), ...NO_STORE_HEADERS } }
      );
    }
    return NextResponse.json(
      { error: "Invalid credentials.", remainingBeforeLock },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error("[AUTH] login failed:", error?.message || error);
    return NextResponse.json({ error: "Authentication failed" }, { status: 500, headers: NO_STORE_HEADERS });
  }
}
