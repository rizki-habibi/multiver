export const WENYAN_LOCALES = ["zh-CN", "zh-TW"];

export const TUNNEL_BENEFITS = [
  { icon: "public", title: "Akses dari Mana Saja", desc: "Gunakan API Anda dari jaringan mana pun" },
  { icon: "group", title: "Bagikan Titik Akhir", desc: "Bagikan alamat kepada anggota tim" },
  { icon: "code", title: "Gunakan di Cursor/Cline", desc: "Hubungkan alat AI dari jarak jauh" },
  { icon: "lock", title: "Terenkripsi", desc: "TLS ujung-ke-ujung melalui Cloudflare" },
];

export const TUNNEL_PING_INTERVAL_MS = 2000;
export const TUNNEL_PING_MAX_MS = 300000;
export const STATUS_POLL_FAST_MS = 5000;
export const STATUS_POLL_SLOW_MS = 30000;
export const REACHABLE_MISS_THRESHOLD = 5;
export const CLIENT_PING_FAST_MS = 10000;
export const CLIENT_PING_SLOW_MS = 60000;
export const CLIENT_PING_TIMEOUT_MS = 5000;

export const CAVEMAN_LEVELS = [
  { id: "lite", label: "Ringan", desc: "Hapus kata pengisi, pertahankan tata bahasa" },
  { id: "full", label: "Penuh", desc: "Hapus kata sandang, potongan kalimat diperbolehkan" },
  { id: "ultra", label: "Maksimal", desc: "Gaya singkat, kompresi maksimal" },
];

export const PONYTAIL_LEVELS = [
  { id: "lite", label: "Ringan", desc: "Buat sesuai permintaan, pilih opsi yang lebih sederhana" },
  { id: "full", label: "Penuh", desc: "Prioritaskan pustaka bawaan dan fitur asli" },
  { id: "ultra", label: "Maksimal", desc: "YAGNI maksimal, utamakan penghapusan" },
];
