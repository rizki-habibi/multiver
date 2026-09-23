# Multiver

Advanced Multi-AI Fusion Router. Formerly known as 9Router Proxy.

## Features

- **Multi-AI Fusion (Combo Mode 4)**: Send requests to multiple AI providers simultaneously and fuse the best response using a judge model.
- **Auto-Failover & Health Monitoring**: Automatically detects suspended accounts (AWS Bedrock/Kiro, Google Vertex/Gemini) and switches to healthy credentials.
- **Universal Provider Support**: Compatible with OpenAI, Anthropic, Google, AWS, Azure, Groq, Mistral, and local models (Ollama/Llama.cpp).
- **Port Conflict Free**: Runs on port `20222` by default.

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

## License

MIT