# Multiver — Project Context (always included)

Multiver = "Advanced Multi-AI Fusion Router" (formerly 9Router).
Repo: https://github.com/rizki-habibi/multiver (public, MIT).

## Layout

```
/                     Next.js 15 app (App Router, standalone output), port 20222
  src/app             routes: (dashboard)/dashboard/*, login, landing, api/*
  src/app/api         ALL backend REST/SSE routes
  src/shared          client+server shared: components, constants, utils, hooks, services
  src/lib             server-only: db, oauth, tunnel, pxpipe, headroom, updater, usage
  src/sse             in-app SSE handlers (chat / responses / fetch / search)
  src/mitm            MITM proxy server + hosts/DNS management
  src/store           zustand stores
  open-sse/           provider-agnostic SSE engine (see open-sse/AGENTS.md)
  cli/                packaged CLI (tray + terminal UI), builds into cli/app
  tests/              vitest (npm test); unit/ mirrors bug-fix commits by name
```

## Architecture in one paragraph

Client (any OpenAI/Claude/Gemini-format SDK) → `/v1/*` or `/v1beta/*` →
`dashboardGuard.proxy` middleware (auth + loopback gates) → `src/sse/handlers/chat.js`
→ `open-sse/handlers/chatCore.js` → translator (pivot through OpenAI) →
`executors/<provider>.execute()` upstream → translate SSE back to client format.

## Conventions (from open-sse/AGENTS.md + repo)

- Config-driven, DRY, camelCase. Never hardcode models/blocks/roles — `config/` + `schema/`.
- Translators self-register via `register(from, to, reqFn, resFn)` as import side-effect;
  new translator files MUST be added to `translator/index.js` imports.
- `rtk/`, `headroom.js`, `pxpipe` mutate body in-place and are **fail-open** (return null, never throw).
- RTK for `cursor` runs pre-translate; every other provider post-translate.
- OpenAI bridge is lossy (thinking, non-base64 images, tool ids, is_error) — prefer direct routes.
- `registry/index.js` is auto-generated — regenerate, don't hand-edit.
- Every non-trivial bug fix ships with a named test in `tests/unit/` (e.g. `codex-image-fetch.test.js`).

## Build / test / run

```bash
npm run dev          # next dev -p 20222
npm run build        # next build
npm run cli:build    # npm --prefix cli run build
npm test             # vitest run (tests/)
```

Windows: PowerShell. Use `;` not `&&`. Long-running (dev servers) → manual terminal.

## Auth model (do not break)

- `dashboardGuard.js` = middleware. Deny-by-default for `/api/*`, public allow-list in
  `PUBLIC_API_PATHS` / `PUBLIC_PREFIXES` (`/v1`, `/v1beta`, `/codex`, `/responses`).
  LLM API routes do their own API-key auth (`validateApiKey`).
- `LOCAL_ONLY_PATHS` (spawn/host-secret routes) require loopback + auth or CLI token.
- `custom-server.js` stamps `x-mv-real-ip` + `x-mv-peer-token`; never trust client-supplied
  `x-forwarded-for` / `x-mv-*` headers — the wrapper drops them.
- Fresh install default password "123456" is NOT accepted remotely (no JWT issued until rotated).
- `.kiro/settings/mcp.json` may contain secrets → it is gitignored, never commit it.
