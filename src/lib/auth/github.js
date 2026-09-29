import crypto from "node:crypto";

export const GITHUB_STATE_COOKIE = "github_oauth_state";

function required(name) {
  const value = String(process.env[name] || "").trim();
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function isGithubConfigured() {
  return Boolean(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET);
}

export function getGithubRedirectUri(request) {
  const configured = String(process.env.GITHUB_REDIRECT_URI || "").trim();
  if (configured) return configured;
  const url = new URL(request.url);
  return `${url.origin}/api/auth/github/callback`;
}

export function createGithubState() {
  return crypto.randomBytes(32).toString("base64url");
}

export function buildGithubAuthorizeUrl(request, state) {
  const clientId = required("GITHUB_CLIENT_ID");
  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", getGithubRedirectUri(request));
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);
  url.searchParams.set("allow_signup", "false");
  return url;
}

export async function exchangeGithubCode(request, code) {
  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2026-03-10",
    },
    body: JSON.stringify({
      client_id: required("GITHUB_CLIENT_ID"),
      client_secret: required("GITHUB_CLIENT_SECRET"),
      code,
      redirect_uri: getGithubRedirectUri(request),
    }),
    cache: "no-store",
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) throw new Error("GitHub OAuth token exchange failed");
  return data.access_token;
}

export async function fetchGithubIdentity(accessToken) {
  const response = await fetch("https://api.github.com/user", {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${accessToken}`,
      "X-GitHub-Api-Version": "2026-03-10",
      "User-Agent": "Multiver",
    },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("GitHub identity lookup failed");
  const user = await response.json();
  if (!Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0) {
    throw new Error("GitHub identity has no valid numeric user ID");
  }
  return user;
}

export function githubRoleForUserId(id) {
  const adminId = String(process.env.ADMIN_GITHUB_ID || "").trim();
  if (!adminId) return "user";
  return String(id) === adminId ? "admin" : "user";
}

export function githubUsersAllowed() {
  return process.env.ALLOW_GITHUB_USERS === "true";
}
