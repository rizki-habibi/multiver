# Multiver — Advanced Multi-AI Fusion Router

**Multi-AI Fusion Engine — jalankan semua provider paralel, gabungkan jawaban terbaik.**

**Hubungkan semua AI code tool (Claude Code, Cursor, Antigravity, Copilot, Codex, Gemini,
OpenCode, Cline...) ke 40+ provider & 100+ model.**

[![Version](https://img.shields.io/badge/version-10.0.0-0969DA)]
[![License](https://img.shields.io/npm/l/multiver.svg)](https://github.com/rizki-habibi/multiver/blob/main/LICENSE)

---

## 🚀 Instalasi (siap pakai)

```bash
npm install -g multiver
multiver
```

Selesai. Server mulai di `http://localhost:20222/dashboard`.

Runtime dependency (SQLite) otomatis diunduh ke `~/.multiver/runtime` saat pertama jalan.

### Opsi menjalankan

```bash
multiver                    # Default, buka browser
multiver --port 8080        # Port custom
multiver --host 127.0.0.1   # Lokal saja
multiver --no-browser       # Jangan buka browser
multiver --tray             # Mode system tray (background)
multiver --skip-update      # Lewati cek update
multiver --help             # Semua opsi
multiver --version          # Versi terpasang
```

### Update

```bash
multiver update             # cek + update otomatis
multiver update --force     # paksa update
```

---

## ✨ Fitur

- **🔀 MAX — All Models Parallel** — jalankan semua model combo sekaligus, simpan
  semua hasil untuk dibandingkan (opsional Judge untuk fusion)
- **🔀 Combo Routing** — Fallback / Round-Robin / MAX / Fusion
- **💰 Token Saver (RTK)** — kompresi `tool_result` otomatis, hemat 20-40% token
- **🛡️ Auto Health Monitor** — deteksi akun suspended, failover otomatis, cooldown
  dari header `Retry-After`
- **📊 Penggunaan & Konsol Log** — dashboard real-time: Ikhtisar, Konsol Log,
  Diagnostik, Kiro MITM
- **🔐 Kiro MITM** — intersepsi traffic Kiro IDE via local CA
- **☁️ Cloud Sync** — backup/restore ke Google Drive atau WebDAV
- **🔌 40+ Provider** — OpenAI, Anthropic, Google, AWS Bedrock, Azure, Groq, Mistral,
  xAI, DeepSeek, OpenRouter, Kiro, Antigravity, Cursor, Windsurf, Codex, OpenCode,
  Gemini CLI, Grok CLI, Trae, Zed, Qoder, iFlow, Xiaomi MIMO, Ollama (local), dll.

---

## 💾 Lokasi Data

- **Windows**: `%APPDATA%\Multiver\db\data.sqlite`
- **macOS / Linux**: `~/.multiver/db/data.sqlite`

Runtime deps di self-heal ke `~/.multiver/runtime`.

---

## 🧪 Development

```bash
git clone https://github.com/rizki-habibi/multiver.git
cd multiver
npm install
npm run dev                 # Next dev server (port 20222)
npm run cli:build           # build paket CLI (next build + standalone → cli/app)
npm --prefix tests run test # unit tests
```

---

## 📄 License

MIT
