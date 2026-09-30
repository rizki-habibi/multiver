# MULTIVER MAX

**Advanced Multi-AI Fusion Router — semua model jalan, semua hasil ditampilkan.**

![Version](https://img.shields.io/github/package-json/v/rizki-habibi/multiver)
[![License](https://img.shields.io/npm/l/multiver.svg)](https://github.com/rizki-habibi/multiver/blob/main/LICENSE)
[![GitHub release](https://img.shields.io/github/v/release/rizki-habibi/multiver)](https://github.com/rizki-habibi/multiver/releases)

Multiver Max menjalankan **semua model** dalam combo secara bersamaan, mempertahankan hasil masing-masing model.

---

## 🚀 Instalasi

### npm global (rekomendasi)

```bash
npm install -g multiver
multiver
```

### Tarball lokal

```bash
npm pack --prefix cli   # hasil: cli/multiver-<versi>.tgz
npm install -g cli/multiver-12.1.0.tgz
multiver
```

### Instalasi global tanpa menyimpan source di `C:\\Users\\rizki\\multiver`

Jika hanya ingin menjalankan Multiver sebagai aplikasi global, source repository tidak perlu disimpan permanen. Perintah Windows CMD berikut mengambil folder CLI secara sparse ke folder sementara, memasangnya secara global, lalu menghapus folder sementara:

```bat
set "M=%TEMP%\\multiver-install" && if exist "%M%" rmdir /s /q "%M%" && git clone --depth 1 --filter=blob:none --sparse https://github.com/rizki-habibi/multiver.git "%M%" && cd /d "%M%" && git sparse-checkout set cli && npm install -g "%M%\\cli" --force && rmdir /s /q "%M%" && multiver --version && multiver
```

Setelah instalasi global selesai, folder kerja repository di `C:\\Users\\rizki\\multiver` boleh dihapus **selama tidak dipakai untuk pengembangan**. Data runtime Multiver tetap berada di lokasi data pengguna, bukan di folder source tersebut.

### Source (development)

```bash
git clone https://github.com/rizki-habibi/multiver.git
cd multiver
npm install
node cli/link-global.js
```

Perintah `node cli/link-global.js` mendaftarkan perintah `multiver` ke npm global tanpa publikasi.

---

## 🔄 Update ke Versi Terbaru

Multiver punya **auto-update bawaan**. Versi baru dipublikasikan otomatis setiap kali ada commit
ke `main` (lihat bagian [CI/CD](#-cicd-otomatis) di bawah).

### Cara 1 — `multiver update` (paling mudah)

```bash
multiver update
```

Perintah ini akan:
1. Cek versi terbaru dari repo/registry
2. **Menghentikan semua proses Multiver lama** (termasuk MITM) — *Run as Administrator* dianjurkan di Windows
3. `git pull` (atau `npm i -g multiver@latest`) + `npm install` + build ulang
4. Menjalankan ulang Multiver di port yang sama secara otomatis

**Paksa update** walau sudah di versi terbaru:

```bash
multiver update --force
```

**Update tanpa relaunch otomatis:**

```bash
multiver update --no-relaunch
```

> Di Windows, jalankan terminal sebagai **Administrator** (klik kanan → Run as administrator)
> agar proses lama bisa dihentikan dan port dilepas.

### Cara 2 — Manual via npm

```bash
npm install -g multiver@latest
multiver
```

### Cara 3 — Manual via git (untuk install dari source)

```bash
cd multiver
git pull
npm install
npm run build
multiver
```

### Cara 4 — Hapus versi lama dulu, lalu install ulang

Kalau update bermasalah (versi campuran, EBUSY, atau config corrupt):

```bash
# Hapus instalasi lama
npm uninstall -g multiver

# Windows: bersihkan sisa proses
taskkill /F /IM node.exe /FI "WINDOWTITLE eq multiver*"

# Install ulang versi terbaru
npm install -g multiver@latest
multiver
```

### Cek versi yang terinstal

```bash
multiver --version
```

---

## Diagnostik, Konsol Log, dan Token

Multiver menyatukan status request, error provider, penggunaan token, dan aktivitas penghemat token ke satu Konsol Log. Error menampilkan status HTTP, provider/model, dan sebab upstream yang sudah disanitasi. Secret seperti API key, Bearer token, cookie, dan password tidak ditampilkan.

### Sinkron token dan penghemat token

- RTK: memadatkan hasil tool besar; log menampilkan byte yang berkurang dan perkiraan token.
- Headroom: kompresi melalui proxy Headroom bila diaktifkan; log menampilkan token sebelum/sesudah yang dilaporkan proxy.
- PXPIPE: memadatkan konteks Claude besar; angka penghematan diberi label estimasi.
- CAVEMAN dan PONYTAIL: mode instruksi tambahan; dicatat sebagai mode aktif, bukan klaim penghematan token terukur.
- Usage provider IN/OUT/TOTAL dan cache bila tersedia masuk ke Usage DB sekaligus Konsol Log.
- Terminal internal dan dashboard memakai event log yang sama sehingga informasi tidak berjalan di jalur terpisah.

### Chat Semua Layanan

Chat Semua Layanan menemukan model dari koneksi aktif, menguji setiap model yang ditemukan dengan request nyata, lalu menampilkan hasil per model. Concurrency dibatasi agar pengujian tidak menembakkan semua model sekaligus. Jika akun/kunci gagal pada kondisi yang dapat di-fallback, routing melanjutkan ke akun/kunci berikutnya.

Pengaturan yang tersedia melalui environment:
- MULTIVER_CHAT_ALL_TIMEOUT_MS: timeout tiap pengujian provider.
- MULTIVER_CHAT_ALL_MODEL_CONCURRENCY: jumlah model yang diuji paralel, default 2.
- MULTIVER_CHAT_ALL_MODEL_DISCOVERY_TIMEOUT_MS: timeout discovery endpoint models.
- MULTIVER_MAX_ACCOUNT_FALLBACKS: batas percobaan akun/kunci per model, default 20 dan dibatasi maksimum 32.

### Kemampuan AI

Multiver adalah gateway/router multi-provider. Kemampuan akhirnya mengikuti provider dan model yang aktif. Arsitektur saat ini mencakup:

| Kemampuan | Keterangan |
|---|---|
| Chat teks | Single model, combo, MAX, Fusion, dan fallback |
| Multi-model | Pengujian dan eksekusi banyak model dengan concurrency terkontrol |
| Routing | Alias, mapping model, transport, dan fallback akun |
| Token | IN/OUT/TOTAL, cache bila tersedia, riwayat dan statistik |
| Penghemat token | RTK, Headroom, PXPIPE, CAVEMAN, PONYTAIL |
| Tool calling | Translasi dan deduplikasi tool sesuai adapter |
| Vision/media | Mengikuti capability provider/model |
| Streaming | SSE dan JSON non-streaming |
| Format API | OpenAI/Responses, Claude, Gemini/Antigravity, Kiro, dan format adapter lain |
| MITM Kiro | Intersepsi dan routing traffic Kiro melalui alias ke gateway |
| Diagnostik | Konsol log realtime, status MITM/Gateway/Kiro, dan detail error |
| Data | Riwayat penggunaan, detail request, statistik provider/model/akun |
| Integrasi | API-compatible, local/self-hosted, dan adapter provider yang tersedia |

Catatan: daftar model, quota, kemampuan media, dan token usage bergantung pada konfigurasi, kredensial, endpoint, dan respons provider saat runtime.

## ✨ Fitur

- **Smart Combo** – analisis capability, context, tools, kompleksitas tugas, dan tier sebelum fallback.
- **MAX** – semua model paralel, hasil dipertahankan masing-masing.
- **Fusion** – panel model + judge untuk sintesis jawaban terbaik.
- **RTK Token Saver** – kompresi hasil otomatis.
- **Provider-agnostic SSE engine** – 40+ provider.
- **Cloud Sync** – backup ke Google Drive / WebDAV.
- **MITM** – intersepsi traffic Kiro IDE (Windows).

### MITM Kiro: startup dan routing

MITM Multiver ditujukan hanya untuk Kiro. Gateway default berada di port `20222`, sedangkan MITM berada di `443`.

- `mitmEnabled`: mengizinkan MITM digunakan.
- `mitmAutoStart`: mengatur apakah MITM otomatis dijalankan saat Multiver start. Default `false`.
- `MULTIVER_MITM_PORT`: port MITM, default `443`.
- `MULTIVER_PORT`: port gateway, default `20222`.
- `MITM_KIRO_STRICT`: default `true`; jika alias Kiro tidak ditemukan, request dihentikan dengan `ALIAS_NOT_FOUND` agar tidak silent passthrough.

Alur yang diharapkan:

```text
Kiro → MITM :443 → aliases.json → Gateway :20222 → provider → response Kiro
```

Alias cache disinkronkan dari database sebelum auto-start MITM. Cache ditulis secara atomic menggunakan temporary file unik agar concurrent write tidak saling menimpa.
- **Riwayat Percakapan** – simpan prompt + respons + parameter per request.
- **Konsol Log CMD** – monitoring realtime bergaya terminal hitam.
- **Sidebar collapsible** – buka/tutup biar layar lega.

---

## 📁 Struktur Folder (terbaru)

```
multiver/
├── .github/workflows/          # CI/CD: auto-version + publish
├── cli/                        # CLI launcher
│   ├── cli.js
│   ├── src/cli/commands/       # termasuk update.js
│   └── link-global.js
├── open-sse/                   # Provider engine
│   ├── config/                 # registry, constants
│   ├── executors/              # per-provider adapters
│   ├── handlers/               # chat / image / tts / stt
│   ├── services/combo.js       # Smart / MAX / Fusion / fallback
│   └── services/comboPlanner.js # analisis + ranking Smart Combo
├── src/
│   ├── app/                    # Next.js UI
│   │   ├── (dashboard)/dashboard/
│   │   │   ├── conversations/  # Riwayat Percakapan
│   │   │   ├── usage/          # Ikhtisar, Detail, Konsol Log, MITM
│   │   │   ├── providers/      # manajemen provider
│   │   │   └── combos/         # kombinasi model
│   │   └── api/
│   │       └── usage/conversations/   # API riwayat
│   ├── lib/                    # DB, logger, utils
│   │   └── db/adapters/        # SQLite + MySQL
│   ├── mitm/                   # Kiro MITM server
│   └── shared/                 # UI components
├── tests/                      # Vitest tests
├── custom-server.js
└── next.config.mjs
```

---

## 🤖 CI/CD Otomatis

Dua workflow GitHub Actions berjalan otomatis di setiap push ke `main`:

### 1. `auto-version.yml` — Bump versi + tag + release

- Push ke `main` → versi di `package.json` & `cli/package.json` naik **+1 patch** otomatis
- Commit bump dikirim dengan `[skip version]` (tidak memicu loop)
- GitHub **tag `vX.Y.Z`** dan **Release** dibuat otomatis
- `paths-ignore` untuk `*.md` dan `.github/**` — update dokumen tidak memicu bump

Versi naik dari `12.0.0` → `12.0.1` → ...

### 2. `release.yml` — Build + publish npm

Dipicu saat tag `v*` dibuat:

- `npm run cli:build` (esbuild bundle CLI)
- Verifikasi bundle (`cli/cli.js`, `cli/app/package.json`)
- `npm publish --prefix cli` ke registry (butuh `NPM_TOKEN` secret)
- Upload tarball sebagai artifact

### Setup yang perlu dilakukan sekali

1. **NPM_TOKEN** — buat token publish di https://www.npmjs.com/settings/\<user\>/tokens
   (Access: Read and write), lalu tambahkan sebagai repository secret:
   `Settings → Secrets and variables → Actions → New repository secret`
2. **Environment** — buat environment bernama `publish`:
   `Settings → Environments → New environment`

Setelah itu, setiap push ke `main` otomatis: **bump versi → tag → release → publish npm**.

---

## 🧪 Pengembangan

```bash
npm install              # install dependencies
npm run dev              # dev server di http://localhost:20222
npm run build            # production build
npm run cli:build        # build CLI bundle
npm test                 # jalankan unit tests
```

Aktifkan observability (untuk Riwayat Percakapan & detail request):

```bash
# .env
ENABLE_REQUEST_LOGS=true
```

---

## 🔧 Perbaikan Data Layanan Otomatis

Multiver sekarang memiliki **perbaikan data layanan kompatibel otomatis**. Layanan yang sebelumnya tersimpan sebagai **Anthropic Compatible** atau **OpenAI/ChatGPT Compatible** tetap mempertahankan transport internalnya, tetapi metadata pengguna diseragamkan sebagai **API Keys Kompatibel**.

### Yang diperbaiki otomatis

- Metadata kompatibilitas diseragamkan menjadi `compatibility: compatible`.
- Protokol internal tetap dicatat sebagai `openai` atau `anthropic` agar routing tidak rusak.
- Base URL yang tidak sengaja berisi `/models`, `/messages`, `/chat/completions`, `/responses`, atau slash berlebih dinormalisasi.
- `prefix`, `baseUrl`, `apiType`, dan nama node disinkronkan ke koneksi layanan kompatibel.
- **API Key tidak diubah, tidak dipindahkan, tidak dihapus, dan tidak ditampilkan.**
- Perbaikan otomatis **tidak memanggil layanan AI**, sehingga tidak menambah latency jaringan atau penggunaan kuota.
- Hanya data yang perlu diubah yang ditulis kembali, sehingga tetap ringan untuk jumlah layanan yang besar.

### Perbaikan manual

Endpoint yang tersedia:

```text
POST /api/providers/repair
```

Saat Multiver berjalan di komputer sendiri:

```bat
curl -X POST http://localhost:20222/api/providers/repair
```

Perbaikan data tidak mengganti Base URL atau API Key dengan nilai tebakan. Setelah data rapi, gunakan **Uji Semua Layanan** atau **Chat Semua Layanan** untuk pemeriksaan koneksi nyata.

### Menambah layanan baru

Layanan baru tetap boleh ditambahkan dengan Base URL dan API Key masing-masing. Multiver memakai istilah **Kompatibel** pada metadata pengguna, tetapi tetap menyimpan protokol internal yang dibutuhkan mesin routing.

## 🧠 Smart Combo

Smart Combo terinspirasi dari pola fallback bertingkat 9Router, tetapi Multiver menambahkan ranking deterministik berdasarkan capability, context window, tools, kompleksitas request, tipe tugas, tier, dan urutan combo. Detail arsitektur ada di `docs/SMART-COMBO.md`.

Smart Combo tidak mengklaim quota atau health provider secara prediktif. Executor fallback tetap menjadi sumber kebenaran ketika request benar-benar dikirim ke provider.

## ❓ FAQ

**Q: Kenapa `multiver update` gagal / "npm registry tidak terjangkau"?**

A: Cek koneksi internet, lalu coba `multiver update --force`. Bila tetap gagal,
update manual dari source (lihat bagian **🔄 Update ke Versi Terbaru** di atas).

**Q: Kenapa `npm install -g multiver` error 404?**

A: Paket ini belum dipublikasikan ke npm registry. Gunakan `node cli/link-global.js`
setelah clone repo. Ini mendaftarkan `multiver` sebagai global command dari folder lokal.

**Q: MAX vs Fusion bedanya apa?**

A: **MAX** menjalankan semua model dan **menyimpan semua jawaban**. **Fusion** menjalankan
semua model lalu satu **Judge** menyatukan jadi satu jawaban. MAX + Judge (optional)
mengembalikan kedua-duanya: individual results + hasil judge.

**Q: Berapa cost MAX?**

A: N call (1 per model). Fusion: N+1 (model + judge). MAX + Judge: N+1.

**Q: MAX bisa untuk 50-100 model?**

A: Bisa, tapi gunakan `Max Concurrent Models` (default 12) untuk batasi koneksi paralel.
Semua model tetap masuk antrean eksekusi, hanya concurrency yang dibatasi.

**Q: Kenapa log konsol saya cuma show 1 baris?**

A: Filter level sedang di "SEMUA LEVEL"? Coba klik **Jeda** lalu **Lanjut** untuk re-sync.
Jika masih, cek `/api/console-log?limit=200` langsung.

---

## 📄 License

MIT — lihat file LICENSE.

---

## 📜 Changelog

### v11.1.0
- Perbaikan gateway MAX hanya memanggil model chat-capable.
- Filter log konsol ditingkatkan.
- UI ikon provider diganti fallback teks.
- Penambahan MySQL adapter.

### v12.1.0

- Menstabilkan startup MITM Kiro dan sinkronisasi alias cache.
- Menjadikan auto-start MITM sebagai pengaturan terpisah dan opt-in.
- Menambahkan strict Kiro alias routing dan health diagnostics.
- Menyelaraskan workflow versioning ke Node.js 22.

### v12.0.0
- **Update langsung dari dashboard**: tombol "Pasang & Mulai Ulang" menjalankan
  installer otomatis (npm i -g multiver@latest), mematikan server, lalu
  memulai ulang tanpa intervensi manual.
- Cek versi terbaru kini membaca tag git repo (sebelumnya npm registry yang
  selalu 404), sehingga notifikasi "Versi baru tersedia" tidak pernah muncul.
- Bump versi 11.1.1 → 12.0.0.

### v11.2.0
- Fitur **Riwayat Percakapan** (tabel prompt/respons/parameter + drawer detail).
- Fix bug `operationalItems` undefined di Sidebar (dashboard crash).
- Combo MAX 4× lebih cepat (timeout 120s→30s, concurrency 6→12).
- Terjemahan label EN→ID di seluruh halaman Penggunaan.
- CI/CD auto-version + npm publish otomatis.
