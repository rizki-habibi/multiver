import { SignJWT, jwtVerify } from "jose";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "@/lib/dataDir";

const SESSION_MAX_AGE_SEC = 24 * 60 * 60;

function loadJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production");
  }
  const file = path.join(DATA_DIR, "jwt-secret");
  try {
    const value = fs.readFileSync(file, "utf8").trim();
    if (value) return value;
  } catch {}
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const generated = crypto.randomBytes(32).toString("hex");
  fs.writeFileSync(file, generated, { mode: 0o600 });
  return generated;
}

let secretCache = null;
function getSecret() {
  if (!secretCache) secretCache = new TextEncoder().encode(loadJwtSecret());
  return secretCache;
}

export function shouldUseSecureCookie(request) {
  if (process.env.AUTH_COOKIE_SECURE === "true") return true;
  if (process.env.NODE_ENV !== "production") {
    return request?.headers?.get?.("x-forwarded-proto") === "https" || request?.url?.startsWith("https://");
  }
  if (process.env.TRUST_PROXY === "true") return request?.headers?.get?.("x-forwarded-proto") === "https";
  return request?.url?.startsWith("https://");
}

export async function createDashboardAuthToken(claims = {}) {
  const safeClaims = {
    authenticated: true,
    role: claims.role || "user",
    ...claims,
  };
  return new SignJWT(safeClaims)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("24h")
    .sign(getSecret());
}

export async function verifyDashboardAuthToken(token) {
  return !!(await getDashboardAuthSession(token));
}

export async function getDashboardAuthSession(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (payload.authenticated !== true) return null;
    return payload;
  } catch {
    return null;
  }
}

export async function setDashboardAuthCookie(cookieStore, request, claims = {}) {
  const token = await createDashboardAuthToken(claims);
  cookieStore.set("auth_token", token, {
    httpOnly: true,
    secure: shouldUseSecureCookie(request),
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SEC,
  });
}

export function clearDashboardAuthCookie(cookieStore) {
  cookieStore.delete("auth_token");
}

export async function verifyDashboardPassword() {
  // Password authentication is intentionally disabled in cloud mode.
  // Multiver accepts GitHub owner login only.
  return false;
}
