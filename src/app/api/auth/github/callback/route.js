import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { setDashboardAuthCookie } from "@/lib/auth/dashboardSession";
import {
  GITHUB_STATE_COOKIE,
  exchangeGithubCode,
  fetchGithubIdentity,
  githubRoleForUserId,
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
    const store = await cookies();
    const expected = store.get(GITHUB_STATE_COOKIE)?.value;
    store.delete(GITHUB_STATE_COOKIE);

    if (!code || !state || !expected || !safeEqual(state, expected)) {
      return fail("Invalid GitHub OAuth state");
    }

    const token = await exchangeGithubCode(request, code);
    const user = await fetchGithubIdentity(token);
    const githubId = String(user.id);
    const role = githubRoleForUserId(githubId);

    if (role !== "admin") {
      return fail("Akun GitHub ini tidak diizinkan masuk ke Multiver.", 403);
    }

    await setDashboardAuthCookie(store, request, {
      role,
      authProvider: "github",
      githubId,
      githubLogin: String(user.login || ""),
      githubName: String(user.name || ""),
      githubAvatar: String(user.avatar_url || ""),
    });

    return NextResponse.redirect(new URL("/dashboard", request.url));
  } catch (e) {
    console.error("[AUTH][github] callback failed:", e?.message || e);
    return fail("GitHub login failed", 502);
  }
}

function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
