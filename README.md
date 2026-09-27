# MULTIVER MAX

**Advanced Multi-AI Fusion Router — semua model jalan, semua hasil ditampilkan.**

![Version](https://img.shields.io/badge/version-10.0.0-0969DA)
[![License](https://img.shields.io/npm/l/multiver.svg)](https://github.com/rizki-habibi/multiver/blob/main/LICENSE)

Multiver bukan sekadar router AI yang memilih satu model. Multiver Max menjalankan
**semua model** yang sudah dikonfigurasi dalam satu combo secara bersamaan, mempertahankan
hasil masing-masing model, dan membiarkan Anda membandingkannya.

---

## 🚀 Instalasi

### Cara 1 — npm global (siap pakai, direkomendasikan)

```bash
npm install -g multiver
multiver
```

Selesai. Perintah `multiver` langsung jalan — server mulai di
`http://localhost:20222/dashboard`. Pertama kali jalan, runtime dependency
(SQLite) otomatis diunduh ke `~/.multiver/runtime`.

### Cara 2 — Dari tarball lokal (tanpa registry)

Bila registry belum tersedia / offline:

```bash
# di folder repo (setelah npm run cli:build)
npm pack --prefix cli                    # hasil: cli/multiver-<versi>.tgz
npm install -g cli/multiver-10.0.0.tgz
multiver
```

### Cara 3 — Dari source (development)

```bash
git clone https://github.com/rizki-habibi/multiver.git
cd multiver
npm install
node cli/link-global.js
```

Perintah `node cli/link-global.js` mendaftarkan perintah `multiver` ke npm global tanpa
publikasi ke registry npm (lokal saja). Jika gagal, otomatis membuat shim
`multiver.cmd` / `multiver.ps1` di npm prefix (`C:\Users\<user>\AppData\Roaming\npm`).

> Juga bisa langsung tanpa instalasi global: `node cli/cli.js`

### Menjalankan

```bash
multiver                 # Start default, buka browser
multiver --port 20222    # Custom port
multiver --host 127.0.0.1  # Lokal saja (tidak terbuka ke jaringan)
multiver --no-browser    # Jangan buka browser otomatis
multiver --tray          # Mode system tray (background)
multiver --help          # Lihat semua opsi
```

Setelah jalan, buka `http://localhost:20222/dashboard`.

---

## ✨ Fitur

### 1. Combo Strategy (Cara Membagi Request ke Model)

| Strategy | Cara Kerja | Kapan Dipakai |
|----------|-----------|---------------|
| **Fallback** | Model A gagal → B → C | Hemat, model prioritas tetap |
| **Round Robin** | Request 1 → A, request 2 → B, request 3 → C | Bagi beban, hindari rate limit |
| **MAX — All Models** | **Semua model jalan paralel, semua hasil dipertahankan** | Eksperimen, perbandingan kualitas |
| **Fusion** | Semua model jalan, satu **Judge** menyatukan jawaban | Kualitas terbaik, biaya tertinggi (N+1 call) |

### 2. ⚡ MAX — All Models Parallel Execution

Konsep: **MAX tidak memilih model**. Semua model dalam combo dieksekusi.

```
MAX
├── Model 01 → RUN
├── Model 02 → RUN
├── Model 03 → RUN
├── Model 04 → RUN
└── Model 05 → RUN
      ↓
MAX RESPONSE BUS
      ↓
individual_results[]
```

**Karakteristik:**

- **Parallel execution** — semua model dijalankan bersamaan (`Promise.all`-style, concurrency terbatas)
- **Partial success** — 1 model gagal **tidak** membatalkan seluruh request
- **Per-model result** — latency, TTFT, token usage, status, error masing-masing model tercatat
- **Rate limit handling** — model yang kena 429 ditandai `RATE_LIMITED`, model lain tetap jalan
- **Timeout per model** — model yang hang di-timeout sendiri, model lain tetap selesai
- **Retry optional** — `maxRetry` per model (default 0)
- **Concurrency limit** — `Max Concurrent Models` (default 6) agar RAM/koneksi tidak jebol
- **Judge optional** — default **disabled**. Kalau diaktifkan, hasil judge **dan** individual
  results tetap dikembalikan

**Response format:**

```json
{
  "strategy": "max",
  "status": "partial_success",
  "total_models": 5,
  "completed": 4,
  "failed": 1,
  "results": [
    {
      "model": "provider/model-a",
      "status": "success",
      "response": "...",
      "latency_ms": 3240,
      "input_tokens": 120,
      "output_tokens": 840
    },
    {
      "model": "provider/model-b",
      "status": "error",
      "error_type": "RATE_LIMIT",
      "message": "..."
    }
  ]
}
```

**Cara pakai via API:**

```bash
curl http://localhost:20222/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "nama-combo-anda",
    "messages": [{"role": "user", "content": "Halo"}]
  }'
```

Kemudian set strategy combo menjadi **MAX** di Dashboard → Kombinasi.

### 3. 💰 Token Saver (RTK)

Kompresi `tool_result` otomatis sebelum request dikirim ke model. Menghemat 20-40% token.

- Aktif default (`rtkEnabled: true`)
- Bekerja di semua format: OpenAI, Claude, Gemini, Kiro, Codex
- **Fail-open**: error kompresi tidak pernah membatalkan request
- Level kompresi: `off`, `low`, `medium`, `high`, `ultra`

Di v7, kompresi sudah **all-in-one** — tidak perlu install `headroom-ai` Python terpisah.
Kompresi external (Headroom `/v1/compress` di `localhost:8787`) sudah non-aktif default
(`headroomEnabled: false`) karena RTK internal sudah cukup.

### 4. 📊 Penggunaan & Konsol Log

Halaman **Penggunaan** (`/dashboard/usage`) sekarang punya 4 tab:

- **Ikhtisar** — statistik penggunaan API, konsumsi token, request count per periode
- **Konsol Log** — terminal real-time (SSE) untuk memantau error, fallback, dan rate limit
- **Diagnostik** — cek kesehatan gateway, MITM, DNS, dan CA dalam satu halaman
- **Kiro MITM** — intersepsi traffic Kiro IDE (sebelumnya halaman terpisah)

#### Konsol Log real-time

Konsol membedakan baris log dengan ikon warna:

| Ikon | Arti |
|------|------|
| 🔵 INFO | Request normal |
| 🟣 | Error upstream (503, 502) |
| 🟠 | Retry / fallback akun |
| ⚪ | Token saver / RTK |
| ⚠️ WARN | Fallback ke model berikutnya, key di-lock karena rate limit |
| ✗ ERROR | Request gagal permanen |

Contoh yang akan Anda lihat saat MAX jalan:

```
[20:31:40] ℹ️ [CHAT] Combo "auto_free_router" with 11 models (strategy: max)
[20:31:40] ℹ️ [MAX] Model gemini/flash started
[20:31:40] ℹ️ [MAX] Model claude/haiku started
[20:31:42] ✗ [MAX] Model kira/flash RATE_LIMITED (402)
[20:31:45] ✓ [MAX] Model gemini/flash completed (2.4s, 1240 tok)
[20:31:45] ℹ️ [MAX] partial success 3/5
```

- **Jeda/Lanjut** — hentikan stream sementara
- **Filter level** — ALL / INFO / SUCCESS / WARNING / ERROR / DEBUG
- **Filter source** — ALL / MITM / KIRO / GATEWAY / ROUTER
- **Cari** — cari teks, kategori, atau request ID
- **Salin** — copy seluruh log ke clipboard
- **Bersihkan Tampilan** / **Hapus Log**
- Secret (API key, Bearer token) **otomatis di-redact** di sisi server sebelum log ditulis

### 5. 🛡️ Auto Health Monitor & Failover

- Deteksi akun suspended (AWS/Kiro, Google/Gemini) otomatis
- Key di-lock sementara saat kena rate limit (lihat `modelLock_*` di log)
- Cooldown time dihitung dari header `Retry-After`
- Contoh dari log: `⚠️ [AUTH] Key 1 locked modelLock_kira-flash for 120s [402]`

### 6. 🔌 40+ Provider

OpenAI, Anthropic, Google, AWS Bedrock, Azure, Groq, Mistral, xAI, DeepSeek, OpenRouter,
Kiro, Antigravity, Cursor, Windsurf, Codex, OpenCode, Gemini CLI, Grok CLI, Trae, Zed,
Qoder, iFlow, Xiaomi MIMO, Ollama (local), dan lainnya.

### 7. 🎥 Multimodal

Teks, gambar, audio, dokumen. Request otomatis diarahkan ke model yang mendukung
kapabilitas yang dibutuhkan (lihat **Capacity Adaptor** di dashboard).

### 8. ☁️ Cloud Storage Sync

Backup & restore settings + data ke Google Drive atau WebDAV (Nextcloud, Synology,
ownCloud). Dashboard → Penyimpanan Awan.

### 9. 🔐 Kiro MITM

Intersepsi traffic Kiro IDE via local CA, teruskan ke provider Anda sendiri.

**Cara aktivasi (Windows):**

1. Dashboard → **Kiro MITM**
2. Klik **Start** — butuh **Run as Administrator** (port 443 + hosts file)
3. Klik **Install Certificate** jika CA belum terpercaya
4. Aktifkan toggle DNS untuk tool yang mau diintercept
5. Klik **Buka Kiro IDE** — lalu kirim satu prompt

**Syarat:**

- Multiver jalan di port `20222` (default, bisa diubah)
- Port `443` harus bebas (cek: `netstat -ano | findstr :443`)
- Kiro IDE dibuka **setelah** MITM start + CA terpasang

**Troubleshooting MITM:**

| Gejala | Penyebab | Solusi |
|--------|---------|--------|
| `CERT_NOT_TRUSTED` | CA belum di-install | Klik "Install Certificate" di halaman MITM |
| `PORT_443_BUSY` | Port 443 dipakai app lain | Tutup app itu, atau centang "Force kill port 443" |
| Traffic tidak terdeteksi | Kiro dibuka sebelum MITM start | Tutup Kiro, start MITM, buka Kiro lagi |
| `DNS not applied` | Tidak ada admin right | Run as Administrator |
| TLS error di Kiro | `NODE_EXTRA_CA_CERTS` tidak ter-set | Restart Kiro setelah MITM start |

---

## 💾 Lokasi Data

- **Windows**: `%APPDATA%\Multiver\db\data.sqlite`
- **macOS / Linux**: `~/.multiver/db/data.sqlite`

Runtime dependencies (sql.js, better-sqlite3) di self-heal ke `~/.multiver/runtime`.

---

## 🧩 Arsitektur

```
Multiver/
├── cli/                    # CLI launcher (multiver command)
│   ├── cli.js              # Entry point — start server, menu, tray
│   ├── src/cli/            # Terminal UI, menus, utils
│   └── app/                # Standalone Next.js build (output)
├── open-sse/               # Provider-agnostic SSE engine
│   ├── config/             # Provider registry, models, runtime config
│   ├── translator/         # Format conversion (OpenAI ↔ Claude ↔ Gemini...)
│   ├── executors/          # Per-provider upstream callers
│   ├── handlers/           # chat / image / tts / stt / search cores
│   ├── rtk/                # Token saver (compress tool_result)
│   └── services/           # combo, fusion, MAX, token refresh, usage
├── src/
│   ├── app/                # Next.js App Router (dashboard + API routes)
│   │   ├── (dashboard)/    # UI pages
│   │   └── api/            # REST + SSE endpoints
│   ├── lib/                # DB, logger, maxEvents, headroom, tunnel
│   ├── mitm/               # Kiro MITM server (CJS, runs standalone)
│   ├── sse/                # Gateway handlers (chat, tts, image, fetch, search)
│   └── shared/             # Constants, components, utils
├── skills/                 # Agent skills (raw SKILL.md files)
└── tests/                  # Unit tests (vitest)
```

### Request lifecycle (chat)

```
client request
  → src/sse/handlers/chat.js     (combo resolution + strategy dispatch)
  → open-sse/handlers/chatCore.js
  → rtk/ (token saver, in-place)
  → translator (client format → provider format)
  → executors (upstream stream)
  → translator response (provider → client format)
  → SSE out
```

---

## 🧪 Development

```bash
npm install
npm run dev          # Next dev server (port 20222)
npm run build        # Production build
npm run lint         # ESLint
npm --prefix tests run test   # Unit tests
```

Build CLI package (untuk distribusi):

```bash
npm run cli:build       # next build + copy standalone → cli/app
cd cli && npm run link:global  # register `multiver` command locally
```

> **Catatan Windows:** bila server Multiver sedang jalan saat build,
> folder `cli/app` terkunci. Build tetap berhasil (overwrite in place),
> tapi hasilnya baru dipakai setelah server di-restart.

---

## 📦 Update / Upgrade

### Cara otomatis (direkomendasikan)

```bash
multiver update
```

Perintah ini melakukan semuanya otomatis (mode deteksi otomatis):

**Mode git** (bila dijalankan dari clone repo — cara instalasi utama):
1. Cek commit terbaru di `origin/main`
2. Hentikan semua proses Multiver yang masih jalan (termasuk MITM via PID file + port)
3. `git pull --ff-only` (hard reset ke origin bila divergen) + `npm install` + `npm run build`
4. Jalankan ulang Multiver di port yang sama

**Mode npm registry** (fallback, bila terinstal dari registry):
1. Cek versi terbaru dari npm registry
2. `npm i -g multiver@<versi-terbaru> --prefer-online`
3. Jalankan ulang Multiver di port yang sama

> Saat Multiver sedang berjalan dan ada commit baru, menu utama otomatis
> menampilkan **⬆ Update to vX**. Pilih itu — update langsung jalan tanpa
> salin-tempel perintah manual.

Flags tambahan:

```bash
multiver update --force        # Paksa update walau sudah di commit terbaru
multiver update --no-relaunch  # Update tanpa menjalankan ulang
```

### Cara manual (dari source)

```bash
cd Multiver
git pull
npm install
npm run cli:build        # next build + copy standalone → cli/app
node cli/link-global.js  # daftarkan ulang `multiver` global
```

### Cek versi saja

```bash
multiver --version          # versi terpasang
multiver update             # cek + update bila ada commit baru
```

---

## ❓ FAQ

**Q: Kenapa `multiver update` gagal / "npm registry tidak terjangkau"?**

A: Bila dijalankan dari clone repo, `multiver update` memakai **mode git** (bukan npm)
dan tidak butuh registry. Cek koneksi internet + `git remote -v`, lalu coba
`multiver update --force`. Bila tetap gagal, update manual dari source
(lihat **📦 Update / Upgrade** di atas).

**Q: Kenapa `npm install -g multiver` error 404?**

A: Registry npm membutuhkan paket dipublikasikan dulu. Bila belum, gunakan
**Cara 2** (tarball) atau **Cara 3** (source) di bagian Instalasi — hasilnya sama.

Jika registrynya sudah ada tapi masih 404, cache npm menahan versi lama:

```bash
npm cache clean --force
npm install -g multiver
```

**Q: MAX vs Fusion bedanya apa?**

A: **MAX** menjalankan semua model dan **menyimpan semua jawaban**. **Fusion** menjalankan
semua model lalu satu **Judge** menyatukan jadi satu jawaban. MAX + Judge (optional)
mengembalikan kedua-duanya: individual results + hasil judge.

**Q: Berapa cost MAX?**

A: N call (1 per model). Fusion: N+1 (model + judge). MAX + Judge: N+1.

**Q: MAX bisa untuk 50-100 model?**

A: Bisa, tapi gunakan `Max Concurrent Models` (default 6) untuk batasi koneksi paralel.
Semua model tetap masuk antrean eksekusi, hanya concurrency yang dibatasi.

**Q: Kenapa log konsol saya cuma show 1 baris?**

A: Filter level sedang di "ALL"? Coba klik **Jeda** lalu **Lanjut** untuk re-sync.
Jika masih, cek `/api/console-log?limit=200` langsung.

---

## 📄 License

MIT
