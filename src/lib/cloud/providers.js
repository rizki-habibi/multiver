// Cloud storage provider registry for Multiver sync.
//
// ponytail: only Google Drive ships an integration here. Proton Drive has no
// public REST API for third-party file writes (Proton's public docs expose mail
// and account APIs only), so it is listed as unsupported on purpose rather than
// half-implemented. Add a provider object here when a usable API exists.

export const CLOUD_PROVIDERS = {
  gdrive: {
    id: "gdrive",
    name: "Google Drive",
    icon: "cloud",
    color: "#4285F4",
    // Minimal scope: read/write files created by this app only.
    scope: "https://www.googleapis.com/auth/drive.file",
    tokenUrl: "https://oauth2.googleapis.com/token",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    // The app folder — created if missing, reused afterwards.
    folderName: "Multiver",
  },
  proton: {
    id: "proton",
    name: "Proton Drive",
    icon: "lock",
    color: "#6D4AFF",
    supported: false,
    reason: "Proton Drive exposes no public file-write API for third-party apps.",
  },
  webdav: {
    id: "webdav",
    name: "WebDAV / Lainnya",
    icon: "dns",
    color: "#64748B",
    supported: true,
    // Generic WebDAV (Nextcloud, Synology, box, ownCloud…) — baseUrl + basic auth.
    needsBaseUrl: true,
  },
};

export const CLOUD_PROVIDER_LIST = Object.values(CLOUD_PROVIDERS);

export function getCloudProvider(id) {
  return CLOUD_PROVIDERS[id] || null;
}

export function isCloudProviderSupported(id) {
  const p = getCloudProvider(id);
  return !!p?.supported;
}
