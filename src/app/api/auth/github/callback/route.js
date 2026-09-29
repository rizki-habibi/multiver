import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { setDashboardAuthCookie } from "@/lib/auth/dashboardSession";
import {
  GITHUB_STATE_COOKIE,
  exchangeGithubCode,
  fetchGithubIdentity,
  githubRoleForUserId,
  githubUsersAllowed,
  isGithubConfigured,
} from "@/lib/auth/github";

export async function GET(request) {
  const fail = (message, status = 400) =>
    NextResponse.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });

  try {
    if (!isGithubConfigured()) return fail("GitHub OAuth is not configured", 503);
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cookieStore = await cookies();
    const expectedState = cookieStore.get(GITHUB_STATE_COOKIE)?.value;
    cookieStore.delete(GITHUB_STATE_COOKIE);

    if (!code || !state || !expectedState || !cryptoSafeEqual(state, expectedState)) {
      return fail("Invalid GitHub OAuth state");
    }

    const accessToken = await exchangeGithubCode(request, code);
    const githubUser = await fetchGithubIdentity(accessToken);
    const githubId = String(githubUser.id);
    const role = githubRoleForUserId(githubId);

    if (role !== "admin" && !githubUsersAllowed()) {
      return fail("This Multiver instance only permits its configured GitHub administrator.", 403);
    }

    await setDashboardAuthCookie(cookieStore, request, {
      role,
      authProvider: "github",
      githubId,
      githubLogin: String(githubUser.login || ""),
      githubName: String(githubUser.name || ""),
      githubAvatar: String(githubUser.avatar_url || ""),
    });

    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (error) {
    console.error("[AUTH][github] callback failed:", error?.message || error);
    return fail("GitHub login failed", 502);
  }
}

function cryptoSafeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && requireTimingSafeEqual(aa, bb);
}

function requireTimingSafeEqual(a, b) {
  const crypto = require("node:crypto");
  return crypto.timingSafeEqual(a, b);
}
