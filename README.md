# Multiver

Advanced Multi-AI Fusion Router. Formerly known as 9Router Proxy.

## Features

- **Multi-AI Fusion (Combo Mode 4)**: Send requests to multiple AI providers simultaneously and fuse the best response using a judge model.
- **Auto-Failover & Health Monitoring**: Automatically detects suspended accounts (AWS Bedrock/Kiro, Google Vertex/Gemini) and switches to healthy credentials.
- **Universal Provider Support**: Compatible with OpenAI, Anthropic, Google, AWS, Azure, Groq, Mistral, and local models (Ollama/Llama.cpp).
- **Port Conflict Free**: Runs on port `20222` by default.
- **Cloud Storage Sync (v3)**: Back up and restore settings and data to Google Drive or any WebDAV server, so your configuration follows you across machines and is ready for VPS deployment.

## Installation

```bash
npm install -g multiver
multiver start
```

Or clone and run locally:

```bash
git clone https://github.com/rizki/multiver.git
cd multiver
npm install
npm run dev
```

## Configuration

Edit `src/shared/constants/config.js` to change ports or provider defaults.

### Cloud storage sync

Open **Dashboard → Cloud Storage** and connect a provider:

- **Google Drive** — OAuth, needs `CLOUD_GOOGLE_CLIENT_ID` / `CLOUD_GOOGLE_CLIENT_SECRET` in `.env`.
- **WebDAV** — any WebDAV server (Nextcloud, Synology, ownCloud, box) with server URL + basic auth.

Use **Backup** to push `multiver-settings.json`, `multiver-data.sqlite`, and a timestamped
snapshot to the provider's `Multiver` folder. Use **Pulihkan** to overwrite local settings with
the remote copy (auth secrets are never imported).

> Proton Drive has no public third-party file-write API, so it is listed as unsupported.

## License

MIT