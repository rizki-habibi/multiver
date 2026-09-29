import { execSync } from "child_process";
import pkg from "../../../../package.json" with { type: "json" };

const VERSION_CACHE_TTL_MS = 3600000; // 1h cache
const versionCache = (global.__npmVersionCache ??= { value: null, fetchedAt: 0 });

// Fetch latest version from git tags (works for private repos without token)
function fetchLatestVersion() {
  try {
    // Use git ls-remote to get tags without cloning — works for any repo with git access
    const output = execSync(
      `git ls-remote --tags --sort=-v:refname origin`,
      { encoding: "utf8", timeout: 8000, stdio: ["pipe", "pipe", "pipe"] }
    );
    // Tags look like: <sha>\trefs/tags/v12.0.0
    // Filter annotated tag refs (skip ^{} dereferenced ones for clean match)
    const match = output.match(/refs\/tags\/v(\d+\.\d+\.\d+)$/m);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function compareVersions(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] > pb[i]) return 1;
    if (pa[i] < pb[i]) return -1;
  }
  return 0;
}

async function getLatestVersionCached() {
  if (versionCache.value && Date.now() - versionCache.fetchedAt < VERSION_CACHE_TTL_MS) {
    return versionCache.value;
  }
  const latest = fetchLatestVersion();
  if (latest) {
    versionCache.value = latest;
    versionCache.fetchedAt = Date.now();
  }
  return latest;
}

export async function GET() {
  const latestVersion = await getLatestVersionCached();
  const currentVersion = pkg.version;
  const hasUpdate = latestVersion ? compareVersions(latestVersion, currentVersion) > 0 : false;

  return Response.json({ currentVersion, latestVersion, hasUpdate });
}
