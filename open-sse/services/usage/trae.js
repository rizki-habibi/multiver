/**
 * Trae (ByteDance marscode) usage handler.
 *
 * Registry menyatakan features.usage:true untuk trae, tetapi selama ini tidak
 * ada handler di USAGE_HANDLERS — setiap permintaan kuota membalas
 * "Usage API not implemented for trae" meskipun endpoint sudah dideklarasikan
 * di transport.usage (lihat providers/registry/trae.js).
 *
 * Endpointnya adalah GetUserInfo (POST, header x-cloudide-token), yang
 * dipakai alur login untuk identitas, bukan kuota numerik. Jadi handler ini
 * adalah "connected check": verifikasi token + kembalikan identitas akun
 * agar dasbor tahu layanan ini aktif dan deteksi akun bekerja.
 */

import { proxyAwareFetch } from "../../utils/proxyFetch.js";
import { U } from "./shared.js";

const FALLBACK_ORIGINS = [
  "https://api.marscode.com",
  "https://api.trae.ai",
  "https://www.trae.ai",
];

function extractPath(obj, paths) {
  for (const p of paths) {
    let cur = obj;
    let ok = true;
    for (const k of p) {
      if (cur == null || typeof cur !== "object") { ok = false; break; }
      cur = cur[k];
    }
    if (ok && cur) return cur;
  }
  return null;
}

/**
 * @param {string} accessToken - Trae JWT (Cloud-IDE-JWT)
 * @param {object} proxyOptions - proxy config
 * @param {object} providerSpecificData - region hints
 * @returns {Promise<object>} { plan, message?, quotas }
 */
export async function getTraeUsage(accessToken, proxyOptions = null, providerSpecificData = {}) {
  if (!accessToken) {
    return { message: "Trae connection token not available. Please re-authorize." };
  }

  // Region mengubah origin API (CN memakai marscode.com). transport.usage.url
  // sudah region-correct bila ada; fallback coba semua origin.
  const primaryUrl = U("trae").url;
  const origins = primaryUrl ? [primaryUrl, ...FALLBACK_ORIGINS] : FALLBACK_ORIGINS;
  const tried = new Set();

  for (const origin of origins) {
    const url = String(origin).replace(/\/$/, "");
    if (tried.has(url)) continue;
    tried.add(url);
    try {
      const response = await proxyAwareFetch(url, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "x-cloudide-token": accessToken,
        },
        body: JSON.stringify({}),
      }, proxyOptions);

      // 401/403 → token kedaluwarsa; coba origin lain tidak membantu, balas
      // pesan yang jelas agar UI bisa menawarkan re-auth.
      if (response.status === 401 || response.status === 403) {
        return { message: "Trae token expired or invalid. Please re-authorize the connection." };
      }
      if (!response.ok) continue;

      const data = await response.json().catch(() => null);
      if (!data) continue;

      const email = extractPath(data, [
        ["Result", "NonPlainTextEmail"], ["Result", "Email"], ["email"], ["data", "email"],
      ]);
      const name = extractPath(data, [
        ["Result", "ScreenName"], ["Result", "Nickname"], ["nickname"], ["name"],
      ]);
      const aiRegion = extractPath(data, [["Result", "AIRegion"], ["aiRegion"]]);

      const who = [name, email].filter(Boolean).join(" — ") || "Trae connected";

      return {
        plan: aiRegion ? `Trae (${String(aiRegion).toUpperCase()})` : "Trae",
        message: who,
        // GetUserInfo tidak memaparkan kuota numerik; kunci keterbacaan UI
        // adalah "connected" + identitas, bukan bar persentase palsu.
        quotas: {},
      };
    } catch { /* coba origin berikutnya */ }
  }

  return { message: "Trae connected. Usage endpoint unreachable." };
}
