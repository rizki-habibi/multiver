import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  GITHUB_STATE_COOKIE,
  createGithubState,
  buildGithubAuthorizeUrl,
  isGithubConfigured,
} from "@/lib/auth/github";

export async function GET(request) {
  if (!isGithubConfigured()) {
    return NextResponse.json({ error: "GitHub OAuth is not configured" }, { status: 503 });
  }
  const state = createGithubState();
  const cookieStore = await cookies();
  cookieStore.set(GITHUB_STATE_COOKIE, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return NextResponse.redirect(buildGithubAuthorizeUrl(request, state));
}
