# MULTIVER MAX

**Advanced Multi-AI Fusion Router — semua model jalan, semua hasil ditampilkan.**

![Version](https://img.shields.io/badge/version-11.1.0-0969DA)
[![License](https://img.shields.io/npm/l/multiver.svg)](https://github.com/rizki-habibi/multiver/blob/main/LICENSE)

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

## ✨ Fitur

- **MAX** – semua model paralel, hasil dipertahankan.
- **RTK Token Saver** – kompresi hasil otomatis.
- **Provider‑agnostic SSE engine** – 40+ provider.
- **Cloud Sync** – backup ke Google Drive / WebDAV.
- **MITM** – intersepsi traffic Kiro IDE (Windows).

---

## 📁 Struktur Folder ( terbaru)
```
multiver/
├── cli/                        # CLI launcher
│   ├── cli.js
│   └── link-global.js
├── open-sse/                   # Provider engine
│   ├── config/                 # registry, constants
│   ├── executors/              # per‑provider adapters
│   └── handlers/               # chat / image / tts / stt
├── src/
│   ├── app/                    # Next.js UI
│   ├── lib/                    # DB, logger, utils
│   ├── mitm/                   # Kiro MITM server
│   └── shared/                 # UI components
├── tests/                      # Vitest tests
├── custom-server.js
└── next.config.mjs
```

- **skills/** dihapus – hanya markdown untuk dokumentasi, tidak diperlukan runtime.
- **public/providers/*.png** dihapus – UI kini menggunakan fallback teks untuk ikon provider.
- **src/lib/db/adapters/** menambahkan MySQL adapter (`mysqlAdapter.js`, `mysqlWorker.mjs`).

---

## 📋 Perubahan Lokal Tak Ter‑commit

- Dependensi `mysql2` ditambahkan.
- MySQL adapter source di `src/lib/db/adapters/`.
- File `.dev-*.mjs` dihapus.

---

## 📄 License

MIT – lihat file LICENSE.

---

## 📜 Changelog

### v11.1.0
- Perbaikan gateway MAX hanya memanggil model chat‑capable.
- Filter log konsol ditingkatkan.
- UI ikon provider diganti fallback teks.
- Penambahan MySQL adapter.

