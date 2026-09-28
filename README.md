# MULTIVER MAX

**Advanced Multi-AI Fusion Router — semua model jalan, semua hasil ditampilkan.**

![Version](https://img.shields.io/badge/version-11.1.0-0969DA)
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
npm install -g cli/multiver-11.1.0.tgz
multiver
```

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

## ✨ Fitur

- **MAX** – semua model paralel, hasil dipertahankan masing-masing.
- **Fusion** – panel model + judge untuk sintesis jawaban terbaik.
- **RTK Token Saver** – kompresi hasil otomatis.
- **Provider-agnostic SSE engine** – 40+ provider.
- **Cloud Sync** – backup ke Google Drive / WebDAV.
- **MITM** – intersepsi traffic Kiro IDE (Windows).
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
│   └── services/combo.js       # MAX / Fusion / fallback
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

Versi naik dari `11.1.0` → `11.1.1` → `11.1.2` → ...

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

## 📄 License

MIT — lihat file LICENSE.

---

## 📜 Changelog

### v11.1.0
- Perbaikan gateway MAX hanya memanggil model chat-capable.
- Filter log konsol ditingkatkan.
- UI ikon provider diganti fallback teks.
- Penambahan MySQL adapter.

### v11.2.0
- Fitur **Riwayat Percakapan** (tabel prompt/respons/parameter + drawer detail).
- Fix bug `operationalItems` undefined di Sidebar (dashboard crash).
- Combo MAX 4× lebih cepat (timeout 120s→30s, concurrency 6→12).
- Terjemahan label EN→ID di seluruh halaman Penggunaan.
- CI/CD auto-version + npm publish otomatis.
