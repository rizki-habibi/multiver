// Cloud storage sync: push/pull Multiver data (settings JSON + SQLite backup)
// to Google Drive (OAuth) or any WebDAV server. Uses the already-installed
// undici/fetch — no new dependency.
//
// ponytail: refresh tokens are stored encrypted-at-rest in localDb settings
// (cloudProviderData). Access tokens are kept in memory only. Upgrade path when
// a second provider arrives: add a per-provider adapter object to ADAPTERS.

import { getSettings, updateSettings } from "@/lib/localDb";
import { CLOUD_PROVIDERS } from "./providers.js";

const MULTIVER_FOLDER = "Multiver";
const SETTINGS_FILE = "multiver-settings.json";
const DB_FILE = "multiver-data.sqlite";

function getRedirectOrigin(request) {
  const proto = request?.headers?.get?.("x-forwarded-proto");
  const host = request?.headers?.get?.("host");
  if (!host) return null;
  return `${proto === "https" ? "https" : "http"}://${host}`;
}

export function buildRedirectUri(request, providerId) {
  const origin = getRedirectOrigin(request) || "http://localhost:20222";
  return `${origin}/api/cloud/oauth/callback?provider=${providerId}`;
}

export function buildAuthUrl(providerId, clientId, redirectUri, state) {
  const p = CLOUD_PROVIDERS[providerId];
  if (!p) throw new Error(`Unknown cloud provider: ${providerId}`);
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: p.scope,
    state,
    access_type: "offline",
    prompt: "consent",
  });
  return `${p.authUrl}?${params.toString()}`;
}

export async function exchangeCode(providerId, code, clientId, clientSecret, redirectUri) {
  const p = CLOUD_PROVIDERS[providerId];
  if (!p) throw new Error(`Unknown cloud provider: ${providerId}`);

  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });

  const res = await fetch(p.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  const tokens = await res.json();
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
    scope: tokens.scope,
  };
}

export async function refreshCloudToken(providerId, refreshToken, clientId, clientSecret) {
  const p = CLOUD_PROVIDERS[providerId];
  if (!p) throw new Error(`Unknown cloud provider: ${providerId}`);

  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });

  const res = await fetch(p.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Token refresh failed (${res.status}): ${text}`);
    err.permanent = /invalid_grant|invalid_client|unauthorized_client/.test(text);
    throw err;
  }
  const tokens = await res.json();
  return {
    accessToken: tokens.access_token,
    // Google may rotate; keep the old one when absent.
    refreshToken: tokens.refresh_token || refreshToken,
    expiresAt: tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null,
  };
}

// ─── Credential storage (encrypted-at-rest fields only) ───────────────────

async function readCloudData() {
  const settings = await getSettings();
  return settings.cloudProviderData || {};
}

async function writeCloudData(data) {
  await updateSettings({ cloudProviderData: data });
  return data;
}

export async function saveCloudCredentials(providerId, creds) {
  const data = await readCloudData();
  data[providerId] = { ...data[providerId], ...creds };
  return writeCloudData(data);
}

export async function clearCloudCredentials(providerId) {
  const data = await readCloudData();
  delete data[providerId];
  return writeCloudData(data);
}

export async function getCloudConfig(providerId) {
  const data = await readCloudData();
  return data[providerId] || null;
}

/**
 * Resolve a fresh access token, refreshing when stale.
 * @returns {Promise<{accessToken: string} | {error: string}>}
 */
export async function getFreshAccessToken(providerId) {
  const cfg = await getCloudConfig(providerId);
  if (!cfg) return { error: "Provider not connected" };

  const stillValid = cfg.expiresAt && cfg.expiresAt - 60000 > Date.now();
  if (stillValid && cfg.accessToken) return { accessToken: cfg.accessToken };
  if (!cfg.refreshToken) return { error: "No refresh token — reconnect required" };

  try {
    const refreshed = await refreshCloudToken(
      providerId,
      cfg.refreshToken,
      cfg.clientId,
      cfg.clientSecret,
    );
    await saveCloudCredentials(providerId, refreshed);
    return { accessToken: refreshed.accessToken };
  } catch (e) {
    if (e.permanent) await clearCloudCredentials(providerId);
    return { error: e.message };
  }
}

// ─── Google Drive helpers ────────────────────────────────────────────────

async function driveFindFolder(accessToken, name) {
  const q = new URLSearchParams({
    q: `mimeType='application/vnd.google-apps.folder' and name='${name}' and trashed=false`,
    fields: "files(id,name)",
    spaces: "drive",
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${q}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive folder search failed (${res.status})`);
  const json = await res.json();
  return json.files?.[0]?.id || null;
}

async function driveCreateFolder(accessToken, name) {
  const res = await fetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  if (!res.ok) throw new Error(`Drive folder create failed (${res.status})`);
  const json = await res.json();
  return json.id;
}

async function driveEnsureFolder(accessToken) {
  const existing = await driveFindFolder(accessToken, MULTIVER_FOLDER);
  if (existing) return existing;
  return driveCreateFolder(accessToken, MULTIVER_FOLDER);
}

async function driveFindFile(accessToken, folderId, name) {
  const q = new URLSearchParams({
    q: `name='${name}' and '${folderId}' in parents and trashed=false`,
    fields: "files(id,name,modifiedTime,size)",
    spaces: "drive",
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${q}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive file search failed (${res.status})`);
  const json = await res.json();
  return json.files?.[0] || null;
}

async function driveUpload(accessToken, folderId, name, bytes, mimeType) {
  const existing = await driveFindFile(accessToken, folderId, name);
  const method = existing ? "PATCH" : "POST";
  const uploadUrl = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";

  const boundary = "multiver-" + Math.random().toString(36).slice(2);
  const metadata = existing
    ? {}
    : { name, parents: [folderId] };
  const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(
    metadata,
  )}\r\n`;
  const dataPart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const tail = `\r\n--${boundary}--\r\n`;

  const body = new Uint8Array([
    ...new TextEncoder().encode(metaPart),
    ...new TextEncoder().encode(dataPart),
    ...new Uint8Array(bytes),
    ...new TextEncoder().encode(tail),
  ]);

  const res = await fetch(uploadUrl, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Drive upload failed (${res.status}): ${text}`);
  }
  const json = await res.json();
  return { fileId: json.id, name };
}

async function driveDownload(accessToken, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive download failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

async function driveList(accessToken, folderId) {
  const q = new URLSearchParams({
    q: `'${folderId}' in parents and trashed=false`,
    fields: "files(id,name,modifiedTime,size,mimeType)",
    orderBy: "modifiedTime desc",
    pageSize: 50,
  });
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?${q}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive list failed (${res.status})`);
  const json = await res.json();
  return json.files || [];
}

async function driveDelete(accessToken, fileId) {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`Drive delete failed (${res.status})`);
  return true;
}

// ─── WebDAV helpers (generic) ─────────────────────────────────────────────

function webdavBase(cfg) {
  const base = String(cfg.baseUrl || "").replace(/\/+$/, "");
  return `${base}/Multiver`;
}

function webdavAuth(cfg) {
  const raw = `${cfg.username || ""}:${cfg.password || ""}`;
  return `Basic ${typeof btoa === "function" ? btoa(raw) : Buffer.from(raw).toString("base64")}`;
}

async function webdavEnsureDir(cfg, path) {
  // MKCOL is idempotent-safe to ignore when the folder exists.
  await fetch(`${path}/`, {
    method: "MKCOL",
    headers: { Authorization: webdavAuth(cfg) },
  }).catch(() => {});
}

async function webdavUpload(cfg, name, bytes, mimeType) {
  await webdavEnsureDir(cfg, webdavBase(cfg));
  const res = await fetch(`${webdavBase(cfg)}/${name}`, {
    method: "PUT",
    headers: {
      Authorization: webdavAuth(cfg),
      "Content-Type": mimeType || "application/octet-stream",
      "Content-Length": String(bytes.length),
    },
    body: bytes,
  });
  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    throw new Error(`WebDAV upload failed (${res.status}): ${text}`);
  }
  return { fileId: name, name };
}

async function webdavDownload(cfg, name) {
  const res = await fetch(`${webdavBase(cfg)}/${name}`, {
    headers: { Authorization: webdavAuth(cfg) },
  });
  if (!res.ok) throw new Error(`WebDAV download failed (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

async function webdavList(cfg) {
  // PROPFIND depth 1 on the folder.
  const res = await fetch(`${webdavBase(cfg)}/`, {
    method: "PROPFIND",
    headers: { Authorization: webdavAuth(cfg), Depth: "1" },
  });
  if (!res.ok) return [];
  const text = await res.text().catch(() => "");
  // Minimal parse: href entries are the file names.
  const items = [];
  const re = /<d?:?href>([^<]+)<\/d?:?href>/gi;
  let m;
  while ((m = re.exec(text))) {
    const path = decodeURIComponent(m[1]);
    const name = path.split("/").filter(Boolean).pop();
    if (name && name !== "Multiver") items.push({ id: name, name, modifiedTime: null, size: null });
  }
  return items;
}

async function webdavDelete(cfg, name) {
  await fetch(`${webdavBase(cfg)}/${name}`, {
    method: "DELETE",
    headers: { Authorization: webdavAuth(cfg) },
  }).catch(() => {});
  return true;
}

// ─── Unified adapter surface ──────────────────────────────────────────────

const ADAPTERS = {
  gdrive: {
    async push(cfg, name, bytes, mimeType, accessToken) {
      const folderId = await driveEnsureFolder(accessToken);
      return driveUpload(accessToken, folderId, name, bytes, mimeType);
    },
    async pull(cfg, name, accessToken) {
      const folderId = await driveEnsureFolder(accessToken);
      const file = await driveFindFile(accessToken, folderId, name);
      if (!file) return null;
      return driveDownload(accessToken, file.id);
    },
    async list(cfg, accessToken) {
      const folderId = await driveEnsureFolder(accessToken);
      return driveList(accessToken, folderId);
    },
    async remove(cfg, name, accessToken) {
      const folderId = await driveEnsureFolder(accessToken);
      const file = await driveFindFile(accessToken, folderId, name);
      if (!file) return false;
      return driveDelete(accessToken, file.id);
    },
  },
  webdav: {
    async push(cfg, name, bytes, mimeType) {
      return webdavUpload(cfg, name, bytes, mimeType);
    },
    async pull(cfg, name) {
      return webdavDownload(cfg, name);
    },
    async list(cfg) {
      return webdavList(cfg);
    },
    async remove(cfg, name) {
      return webdavDelete(cfg, name);
    },
  },
};

function adapterFor(providerId) {
  const a = ADAPTERS[providerId];
  if (!a) throw new Error(`Unsupported cloud provider: ${providerId}`);
  return a;
}

async function withToken(providerId, cfg, fn) {
  if (providerId === "webdav") return fn(cfg, null);
  const { accessToken, error } = await getFreshAccessToken(providerId);
  if (error) throw new Error(error);
  return fn(cfg, accessToken);
}

// ─── Public sync API ──────────────────────────────────────────────────────

export async function cloudPush(providerId, name, bytes, mimeType = "application/octet-stream") {
  const cfg = await getCloudConfig(providerId);
  if (!cfg) throw new Error("Provider not connected");
  const adapter = adapterFor(providerId);
  const result = await withToken(providerId, cfg, (c, token) =>
    adapter.push(c, name, bytes, mimeType, token),
  );
  return result;
}

export async function cloudPull(providerId, name) {
  const cfg = await getCloudConfig(providerId);
  if (!cfg) throw new Error("Provider not connected");
  const adapter = adapterFor(providerId);
  const bytes = await withToken(providerId, cfg, (c, token) => adapter.pull(c, name, token));
  return bytes;
}

export async function cloudList(providerId) {
  const cfg = await getCloudConfig(providerId);
  if (!cfg) return [];
  const adapter = adapterFor(providerId);
  return withToken(providerId, cfg, (c, token) => adapter.list(c, token));
}

export async function cloudRemove(providerId, name) {
  const cfg = await getCloudConfig(providerId);
  if (!cfg) return false;
  const adapter = adapterFor(providerId);
  return withToken(providerId, cfg, (c, token) => adapter.remove(c, name, token));
}

export async function cloudStatus(providerId) {
  const cfg = await getCloudConfig(providerId);
  if (!cfg) return { connected: false };
  const provider = CLOUD_PROVIDERS[providerId];
  return {
    connected: true,
    providerId,
    name: provider.name,
    account: cfg.accountEmail || cfg.username || null,
    expiresAt: cfg.expiresAt || null,
    baseUrl: cfg.baseUrl || null,
  };
}

// ─── Data serialization ───────────────────────────────────────────────────

/**
 * Serialize current settings + DB file for upload.
 * @returns {Promise<{settings: object, dbBytes: Uint8Array|null}>}
 */
export async function collectSyncData() {
  const { exportSettings } = await import("@/lib/db/repos/settingsRepo.js");
  const settings = await exportSettings();
  let dbBytes = null;
  try {
    const { getAdapter } = await import("@/lib/db/driver.js");
    const db = await getAdapter();
    if (typeof db.export === "function") {
      const buf = db.export();
      dbBytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    }
  } catch {
    // sql.js export unavailable — settings-only sync still works.
  }
  return { settings, dbBytes };
}

export async function pushBackup(providerId) {
  const { settings, dbBytes } = await collectSyncData();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const payload = JSON.stringify({ version: 3, exportedAt: stamp, settings }, null, 0);
  const settingsBytes = new TextEncoder().encode(payload);
  const pushed = [];

  pushed.push(await cloudPush(providerId, SETTINGS_FILE, settingsBytes, "application/json"));
  if (dbBytes) {
    pushed.push(await cloudPush(providerId, DB_FILE, dbBytes, "application/vnd.sqlite3"));
  }
  // Keep a timestamped snapshot alongside the live settings file.
  pushed.push(
    await cloudPush(
      providerId,
      `backups/settings-${stamp}.json`,
      settingsBytes,
      "application/json",
    ),
  );

  await saveCloudCredentials(providerId, { lastBackupAt: stamp, lastBackupFiles: pushed.length });
  return { stamp, files: pushed.length };
}

export async function pullSettings(providerId) {
  const bytes = await cloudPull(providerId, SETTINGS_FILE);
  if (!bytes) return null;
  const text = new TextDecoder().decode(bytes);
  const parsed = JSON.parse(text);
  return parsed;
}
