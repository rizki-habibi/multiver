import { NextResponse } from "next/server";
import { getSettings, validateApiKey } from "@/lib/localDb";
import { getConsistentMachineId } from "@/shared/utils/machineId";
import { getDashboardAuthSession, verifyDashboardAuthToken } from "@/lib/auth/dashboardSession";
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
const PROTECTED_API_PATHS = [
  "/api/settings","/api/keys","/api/providers","/api/combos","/api/models","/api/usage","/api/oauth",
  "/api/cloud","/api/media-providers","/api/pricing","/api/tags","/api/cli-tools","/api/mcp","/api/translator","/api/tunnel",
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
async function canAccessPublicLlmApi(request){if(isLocalRequest(request))return true;if(await hasValidCliToken(request))return true;return await hasValidApiKey(request);}
async function canAccessLocalOnlyRoute(request){if(await hasValidCliToken(request))return true;if(isLocalRequest(request)&&await isAuthenticated(request))return true;return false;}
async function hasValidToken(request){return !!(await getDashboardAuthSession(request.cookies.get("auth_token")?.value));}
async function loadSettings(){try{return await getSettings();}catch{return null;}}
async function isAuthenticated(request){if(await hasValidToken(request))return true;const settings=await loadSettings();return !!(settings&&settings.requireLogin===false);}
export { isAuthenticated };
async function session(request){return await getDashboardAuthSession(request.cookies.get("auth_token")?.value);}
async function isAdmin(request){const s=await session(request);return s?.role==="admin";}
async function isGithubUser(request){const s=await session(request);return s?.authProvider==="github"&&s?.role!=="admin";}
function isOfficePath(pathname){return pathname==="/dashboard/office"||pathname.startsWith("/dashboard/office/");}
function isOfficeApi(pathname){return pathname==="/api/office"||pathname.startsWith("/api/office/");}

export const __test__={isLocalRequest,isPublicLlmApi,extractApiKey,canAccessPublicLlmApi,canAccessLocalOnlyRoute,isOfficePath,isOfficeApi};

export async function proxy(request){
  const {pathname}=request.nextUrl;
  if(LOCAL_ONLY_PATHS.some(p=>pathname.startsWith(p)) && !(await canAccessLocalOnlyRoute(request)))
    return NextResponse.json({error:"Local only: CLI token required"},{status:403});
  if(ALWAYS_PROTECTED.some(p=>pathname.startsWith(p)) && !(await hasValidCliToken(request)) && !(await hasValidToken(request)))
    return NextResponse.json({error:"Unauthorized"},{status:401});

  if(isPublicLlmApi(pathname)){
    if(await canAccessPublicLlmApi(request))return NextResponse.next();
    return NextResponse.json({error:"API key required for remote API access"},{status:401});
  }

  if(pathname.startsWith("/api/")){
    if(isPublicApi(pathname))return NextResponse.next();
    const authenticated=await isAuthenticated(request);
    if(!authenticated)return NextResponse.json({error:"Unauthorized"},{status:401});
    if(await isGithubUser(request)&&!isOfficeApi(pathname))
      return NextResponse.json({error:"GitHub users are restricted to Office Bot until legacy resource ownership is enabled."},{status:403});
    return NextResponse.next();
  }

  if(pathname.startsWith("/dashboard")){
    const settings=await loadSettings();
    const requireLogin=settings?.requireLogin!==false;
    if(!requireLogin)return NextResponse.next();
    const current=await session(request);
    if(!current)return NextResponse.redirect(new URL("/login",request.url));
    if(await isGithubUser(request)&&!isOfficePath(pathname))
      return NextResponse.redirect(new URL("/dashboard/office",request.url));
    return NextResponse.next();
  }
  if(pathname==="/")return NextResponse.redirect(new URL("/dashboard",request.url));
  return NextResponse.next();
}
function isPublicApi(pathname){return PUBLIC_API_PATHS.some(p=>pathname===p||pathname.startsWith(`${p}/`));}
