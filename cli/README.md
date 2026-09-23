# Multiver - Advanced Multi-AI Fusion Router

**Multi-AI Fusion Engine — run all providers in parallel, fuse the best answer.**

**Connect All AI Code Tools (Claude Code, Cursor, Antigravity, Copilot, Codex, Gemini, OpenCode, Cline, OpenClaw...) to 40+ AI Providers & 100+ Models.**

[![License](https://img.shields.io/npm/l/multiver.svg)](https://github.com/rizki-habibi/multiver/blob/main/LICENSE)

---

## 🚀 Quick Start

```bash
# Run directly with npx
npx multiver

# Or clone and run
git clone https://github.com/rizki-habibi/multiver.git
cd multiver
npm install
npm run dev
```

Server starts at `http://localhost:20222`

---

## ✨ Features

- **🔀 Multi-AI Fusion (Mode 4)** — Dispatch to all compatible providers in parallel, fuse the best response
- **🛡️ Auto Health Monitor** — Detects suspended accounts (AWS/Kiro, Google/Gemini) and fails over automatically
- **🔀 Smart Combo Routing** — Fallback / Round-Robin / Fusion strategies
- **💰 Token Saver (RTK)** — Auto-compress tool_result, save 20-40% tokens
- **🔌 40+ Providers** — OpenAI, Anthropic, Google, AWS Bedrock, Azure, Groq, Mistral, local Ollama...

---

## 💻 Usage

```bash
multiver                    # Start with default settings
multiver --port 8080        # Custom port
multiver --no-browser       # Don't open browser
multiver --skip-update      # Skip auto-update check
multiver --help             # Show all options
```

### Multi-AI Fusion Mode

Send a chat request with the header `x-mv-mode: fusion-all` to dispatch to **all**
compatible providers in parallel and fuse the best answer via a judge model.

---

## 💾 Data Location

- **macOS/Linux**: `~/.multiver/db/data.sqlite`
- **Windows**: `%APPDATA%/multiver/db/data.sqlite`

---

## 📚 Documentation

- **GitHub**: https://github.com/rizki-habibi/multiver
- **Issues**: https://github.com/rizki-habibi/multiver/issues

---

## 📄 License

MIT
