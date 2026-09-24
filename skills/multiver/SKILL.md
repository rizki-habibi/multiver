---
name: Multiver
description: Entry point for Multiver — local/remote AI gateway with OpenAI-compatible REST for chat, image, TTS, embeddings, web search, web fetch. Use when the user mentions Multiver, MULTIVER_URL, or wants AI without writing provider boilerplate. This skill covers setup + indexes capability skills; fetch the relevant capability SKILL.md from the URLs below when needed.
---

# Multiver

Local/remote AI gateway exposing OpenAI-compatible REST. One key, many providers, auto-fallback.

## Setup

```bash
export MULTIVER_URL="http://localhost:20222"      # or VPS / tunnel URL
export MULTIVER_KEY="sk-..."                      # from Dashboard ? Keys (only if requireApiKey=true)
```

All requests: `${MULTIVER_URL}/v1/...` with header `Authorization: Bearer ${MULTIVER_KEY}` (omit if auth disabled).

Verify: `curl $MULTIVER_URL/api/health` ? `{"ok":true}`

## Discover models

```bash
curl $MULTIVER_URL/v1/models                  # chat/LLM (default)
curl $MULTIVER_URL/v1/models/image            # image-gen
curl $MULTIVER_URL/v1/models/tts              # text-to-speech
curl $MULTIVER_URL/v1/models/embedding        # embeddings
curl $MULTIVER_URL/v1/models/web              # web search + fetch (entries have `kind` field)
curl $MULTIVER_URL/v1/models/stt              # speech-to-text
curl $MULTIVER_URL/v1/models/image-to-text    # vision
```

Use `data[].id` as `model` field in requests. Combos appear with `owned_by:"combo"`.

Response shape:
```json
{ "object": "list", "data": [
  { "id": "openai/gpt-5", "object": "model", "owned_by": "openai", "created": 1735000000 },
  { "id": "tavily/search", "object": "model", "kind": "webSearch", "owned_by": "tavily", "created": 1735000000 }
]}
```

## Capability skills

When the user needs a specific capability, fetch that skill's `SKILL.md` from its raw URL:

| Capability | Raw URL |
|---|---|
| Chat / code-gen | https://raw.githubusercontent.com/decolua/Multiver/refs/heads/master/skills/Multiver-chat/SKILL.md |
| Image generation | https://raw.githubusercontent.com/decolua/Multiver/refs/heads/master/skills/Multiver-image/SKILL.md |
| Text-to-speech | https://raw.githubusercontent.com/decolua/Multiver/refs/heads/master/skills/Multiver-tts/SKILL.md |
| Speech-to-text | https://raw.githubusercontent.com/decolua/Multiver/refs/heads/master/skills/Multiver-stt/SKILL.md |
| Embeddings | https://raw.githubusercontent.com/decolua/Multiver/refs/heads/master/skills/Multiver-embeddings/SKILL.md |
| Web search | https://raw.githubusercontent.com/decolua/Multiver/refs/heads/master/skills/Multiver-web-search/SKILL.md |
| Web fetch (URL ? markdown) | https://raw.githubusercontent.com/decolua/Multiver/refs/heads/master/skills/Multiver-web-fetch/SKILL.md |

## Errors

- 401 ? set/refresh `MULTIVER_KEY` (Dashboard ? Keys)
- 400 `Invalid model format` ? check `model` exists in `/v1/models/<kind>`
- 503 `All accounts unavailable` ? wait `retry-after` or add another provider account
