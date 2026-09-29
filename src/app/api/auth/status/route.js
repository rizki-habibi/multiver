import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getSettings } from "@/lib/localDb";
import { isOidcConfigured } from "@/lib/auth/oidc";
import { isSamlConfigured } from "@/lib/auth/saml.js";
import { isGithubConfigured } from "@/lib/auth/github";
import { getDashboardAuthSession } from "@/lib/auth/dashboardSession";

export async function GET() {
  try {
    const settings = await getSettings();
    const cookieStore = await cookies();
    const session = await getDashboardAuthSession(cookieStore.get("auth_token")?.value);
    const requireLogin = settings.requireLogin !== false;
    const authMode = settings.authMode || "password";
    const ssoType = settings.ssoType || "oidc";
    const oidcName = String(session?.oidcName || "").trim();
    const oidcEmail = String(session?.oidcEmail || "").trim();
    const samlName = String(session?.samlName || "").trim();
    const samlEmail = String(session?.samlEmail || "").trim();
    return NextResponse.json({
      requireLogin, authMode, ssoType,
      oidcConfigured: isOidcConfigured(settings),
      oidcLoginLabel: (settings.oidcLoginLabel || "Sign in with OIDC").trim() || "Sign in with OIDC",
      samlConfigured: isSamlConfigured(settings),
      samlLoginLabel: (settings.samlLoginLabel || "Sign in with SAML SSO").trim() || "Sign in with SAML SSO",
      githubConfigured: isGithubConfigured(),
      hasPassword: !!settings.password,
      authenticated: !!session,
      role: session?.role || null,
      authProvider: session?.authProvider || null,
      githubId: session?.githubId || null,
      githubLogin: session?.githubLogin || null,
      displayName: String(session?.githubName || samlName || samlEmail || oidcName || oidcEmail || (session?.authProvider === "github" ? "GitHub user" : "Password user")),
      loginMethod: session?.authProvider === "github" ? "GitHub" : session?.saml ? "SAML" : session?.oidc ? "OIDC" : "Password",
      oidcName: oidcName || null, oidcEmail: oidcEmail || null, oidcLogin: !!session?.oidc,
      samlName: samlName || null, samlEmail: samlEmail || null, samlLogin: !!session?.saml,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({
      requireLogin: true, authMode: "password", ssoType: "oidc",
      oidcConfigured: false, samlConfigured: false, githubConfigured: false,
      hasPassword: false, authenticated: false, role: null, authProvider: null,
      githubId: null, githubLogin: null, displayName: "Password user", loginMethod: "Password",
      oidcName: null, oidcEmail: null, oidcLogin: false, samlName: null, samlEmail: null, samlLogin: false,
    }, { headers: { "Cache-Control": "no-store" } });
  }
}
