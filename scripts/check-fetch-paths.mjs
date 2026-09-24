// One-off audit: verify every client-side fetch("/api/...") resolves to a real route file.
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, sep, normalize } from "node:path";

const ROOT = process.cwd();
const API_ROOT = join(ROOT, "src", "app", "api");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

// Collect every route the App Router actually exposes under /api.
function collectRoutes() {
  const files = walk(API_ROOT);
  const routes = new Set();
  for (const f of files) {
    if (!f.endsWith(`${sep}route.js`)) continue;
    let rel = f.slice(API_ROOT.length).split(/[\\/]/).filter(Boolean).slice(0, -1).join("/");
    // Dynamic segments resolve fine at runtime, so keep them as-is for matching.
    routes.add("/api" + (rel ? "/" + rel : ""));
  }
  return routes;
}

// Expand a fetched path to the candidate route dirs (with + without dynamic segs).
function pathExists(path, routes) {
  if (routes.has(path)) return true;
  // /api/providers/123/models -> /api/providers/[id]/models
  const segs = path.split("/").slice(2); // drop "/api"
  for (let i = segs.length - 1; i >= 0; i--) {
    const guess = "/api/" + [...segs.slice(0, i), "[id]", ...segs.slice(i + 1)].join("/");
    if (routes.has(guess)) return true;
    const guessRest = "/api/" + [...segs.slice(0, i), "[...path]", ...segs.slice(i + 1)].join("/");
    if (routes.has(guessRest)) return true;
  }
  return false;
}

const routes = collectRoutes();
const srcFiles = walk(join(ROOT, "src")).filter((f) => !f.includes(`${sep}node_modules${sep}`));
const re = /fetch\(\s*[`"]\/(api\/[a-zA-Z0-9_\-/]*[a-zA-Z0-9_\-])[`"]/g;

const dead = new Map();
for (const f of srcFiles) {
  const src = readFileSync(f, "utf8");
  let m;
  while ((m = re.exec(src))) {
    const p = "/" + m[1];
    if (!pathExists(p, routes)) {
      if (!dead.has(p)) dead.set(p, []);
      dead.get(p).push(f.replace(ROOT + sep, ""));
    }
  }
}

const total = [...dead.keys()].length;
if (total === 0) {
  console.log("OK: every client fetch path resolves to a route.");
  process.exit(0);
}
console.log(`UNRESOLVED FETCH PATHS (${total}) — verify against src/app/api before acting:`);
for (const [p, files] of [...dead.entries()].sort()) {
  console.log(`  ${p}`);
  for (const f of files) console.log(`      <- ${f}`);
}
process.exit(0);
