import { NextResponse } from "next/server";
import { getSettings, validateApiKey } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { getDashboardAuthSession } from "@/lib/auth/dashboardSession";
import { hasTrustedPeerHeaders } from "@/lib/auth/trustedPeer";

const CLI_TOKEN_HEADER = "x-mv-cli-token";
const CLI_TOKEN_SALT = "mv-cli-auth";
let cachedCliToken = null;

async function getCliToken() {
  if (!cachedCliToken) cachedCliToken = await getConsistentMachineId(CLI_TOKEN_SALT);
  return cachedCliToken;
}

async function hasValidCliToken(request) {
  const token = request.headers.get(CLI_TOKEN_HEADER);
  return !!token && token === await getCliToken();
}

const PUBLIC_API_PATHS = [
  "/api/health","/api/init","/api/locale","/api/auth/login","/api/auth/logout","/api/auth/status",
  "/api/auth/oidc","/api/auth/saml","/api/auth/github","/api/version","/api/settings/require-login",
];
const PUBLIC_PREFIXES = ["/v1","/v1beta","/api/v1","/api/v1beta","/codex","/responses"];
const ALWAYS_PROTECTED = [
  "/api/shutdown","/api/settings/database","/api/version/shutdown","/api/version/update",
  "/api/oauth/cursor/auto-import","/api/oauth/kiro/auto-import",
];
const LOCAL_ONLY_PATHS = [
  "/api/cli-tools/cowork-settings","/api/mitm/kiro","/api/mcp/","/api/tunnel/tailscale-install",
  "/api/tunnel/tailscale-enable","/api/tunnel/tailscale-disable","/api/tunnel/tailscale-check",
  "/api/tunnel/enable","/api/tunnel/disable","/api/oauth/cursor/auto-import","/api/oauth/kiro/auto-import",
  "/api/auth/reset-password","/api/headroom/start","/api/headroom/stop","/api/headroom/proxy",
];
const LOOPBACK_HOSTS = new Set(["localhost","127.0.0.1","::1"]);

function isLoopbackHostname(h) {
  if (!h) return false;
  let name = String(h).trim().toLowerCase();
  if (name.startsWith("[")) { const end=name.indexOf("]"); if(end===-1)return false; name=name.slice(1,end); }
  else if (name.indexOf(":") !== -1 && name.indexOf(":") === name.lastIndexOf(":")) name=name.slice(0,name.indexOf(":"));
  if (name.startsWith("::ffff:")) name=name.slice(7);
  return LOOPBACK_HOSTS.has(name);
}

function isLoopbackPeer(request) {
  if (hasTrustedPeerHeaders(request)) return isLoopbackHostname(request.headers.get("x-mv-real-ip"));
  if (process.env.NODE_ENV === "development") return isLoopbackHostname(request.headers.get("host"));
  return false;
}

export function isLocalRequest(request) {
  if (request.headers.get("x-mv-via-proxy")) return false;
  if (!isLoopbackPeer(request)) return false;
  const origin=request.headers.get("origin");
  if (origin) { try { if(!isLoopbackHostname(new URL(origin).hostname)) return false; } catch { return false; } }
  return true;
}

function isPublicLlmApi(pathname){return PUBLIC_PREFIXES.some(p=>pathname===p||pathname.startsWith(`${p}/`));}
function extractApiKey(request){
  const authHeader=request.headers.get("Authorization");
  if(authHeader?.startsWith("Bearer "))return authHeader.slice(7);
  const apiKeyHeader=request.headers.get("x-api-key"); if(apiKeyHeader)return apiKeyHeader;
  const googleApiKeyHeader=request.headers.get("x-goog-api-key"); if(googleApiKeyHeader)return googleApiKeyHeader;
  return request.nextUrl.searchParams?.get("key")||null;
}
async function hasValidApiKey(request){const apiKey=extractApiKey(request); return !!apiKey&&await validateApiKey(apiKey);}
async function canAccessPublicLlmApi(request){if(await isGithubAdminSession(request))return true;if(await hasValidApiKey(request))return true;return false;}
async function hasValidToken(request){return !!(await getDashboardAuthSession(request.cookies.get("auth_token")?.value));}
async function loadSettings(){try{return await getSettings();}catch{return null;}}
async function session(request){return await getDashboardAuthSession(request.cookies.get("auth_token")?.value);}
async function isGithubAdminSession(request){const s=await session(request);return s?.authProvider==="github"&&s?.role==="admin"&&String(s?.githubId||"")==="150777189";}
async function isAuthenticated(request){return await isGithubAdminSession(request);}
export { isAuthenticated };
function isOfficePath(pathname){return pathname==="/dashboard/office"||pathname.startsWith("/dashboard/office/");}
function isOfficeApi(pathname){return pathname==="/api/office"||pathname.startsWith("/api/office/");}

export const __test__={isLocalRequest,isPublicLlmApi,extractApiKey,canAccessPublicLlmApi,isOfficePath,isOfficeApi};

export async function proxy(request){
  const {pathname}=request.nextUrl;

  if(ALWAYS_PROTECTED.some(p=>pathname.startsWith(p)) && !(await isGithubAdminSession(request)))
    return NextResponse.json({error:"GitHub administrator authentication required"},{status:401});

  if(isPublicLlmApi(pathname)){
    if(await canAccessPublicLlmApi(request))return NextResponse.next();
    return NextResponse.json({error:"GitHub administrator or valid API key required"},{status:401});
  }

  if(pathname.startsWith("/api/")){
    if(isPublicApi(pathname))return NextResponse.next();
    if(!(await isGithubAdminSession(request)))
      return NextResponse.json({error:"GitHub administrator authentication required"},{status:401});
    return NextResponse.next();
  }

  if(pathname.startsWith("/dashboard")){
    if(!(await isGithubAdminSession(request)))
      return NextResponse.redirect(new URL("/login",request.url));
    return NextResponse.next();
  }

  if(pathname==="/")return NextResponse.redirect(new URL("/dashboard",request.url));
  return NextResponse.next();
}

function isPublicApi(pathname){return PUBLIC_API_PATHS.some(p=>pathname===p||pathname.startsWith(`${p}/`));}
