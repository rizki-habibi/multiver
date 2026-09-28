// ponytail: nol ikon murni. Semua fungsi dipertahankan sebagai no-op agar call-site lama tak perlu dihapus serentak. Upgrade path: hapus file ini + importnya setelah referensi /providers/ lenih dari src/.

export function resolveProviderIconId() {
  return "";
}

/** Selalu null — tidak ada aset gambar lagi. */
export function getProviderIconSrc() {
  return null;
}

/** No-op, retained for compatibility. */
export function markProviderIconMissing() { }
