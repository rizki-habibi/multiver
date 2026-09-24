# Multiver — Bugfix Checklist (always included)

Recurring failure classes found in this codebase. Check before opening a PR.
Items marked FIXED are already repaired — keep the note so regressions are caught fast.

## 1. SSE routes MUST clean up on client disconnect — FIXED

Next.js does not reliably call `ReadableStream.cancel()`. The pattern used by
`api/translator/console-logs/stream/route.js` is the correct one:

```js
request.signal.addEventListener("abort", cleanup, { once: true });
```

`api/usage/stream/route.js` had the leak (EventEmitter listener leak + `setInterval`
keepalive running forever after the browser closed the tab). It now wires
`request.signal` abort + `cancel()` + a shared `cleanup()` that clears the keepalive in
both paths. Follow that pattern for every long-lived SSE route. One-shot POST routes
(`api/translator/send`) do not need it.

## 2. Client fetch paths must match an existing route — FIXED

`grep -r "fetch(\"/api/" src/` and confirm each path resolves to a file under
`src/app/api/`. `BasicChatPageClient` called `/api/dashboard/chat/completions`, which
never had a route (404, chat broken). It now calls `/api/v1/chat/completions` with a
`Bearer` key fetched from `/api/keys` (same pattern as the media-providers example
cards). Dynamic routes resolve too: `/api/oauth/xai/manual-code` is served by
`api/oauth/[provider]/[action]/route.js` (action `manual-code`) — do not "fix" that one.

`scripts/check-fetch-paths.mjs` is the audit tool for this.

## 3. Don't leak the internal error message into HTML — FIXED

`renderXiaomiMimoResultPage(success, message)` interpolated `message` UNescaped
(`renderCodexResultPage` correctly calls `escapeHtml`). Upstream text reaching an HTML
page = stored XSS. Both now escape via the shared `escapeHtml` in the same file.

## 4. `dangerouslySetInnerHTML` needs sanitized input — FIXED

`ChangelogModal` renders `marked.parse(md)` from a remote changelog. `marked` v18 has no
XSS sanitizer built in. It now pipes through `DOMPurify.sanitize` (already a
dependency). Same class: any `dangerouslySetInnerHTML`.

## 5. Hardcoded fallback secrets — FIXED

`src/shared/utils/apiKey.js` had `API_KEY_SECRET = process.env.API_KEY_SECRET ||
"endpoint-proxy-api-key-secret"`. The fallback was public in the repo → an attacker
could forge the CRC of any API key and impersonate a machine. It now falls back to a
random per-process secret (kept on `globalThis.__MV_API_KEY_SECRET__`), so the public
constant can no longer be used to forge keys. Set `API_KEY_SECRET` in the environment
to keep generated keys valid across restarts.

## 6. json parse of `e.data` in EventSource handlers must be try/caught — FIXED

`ConsoleLogClient` did `JSON.parse(e.data)` with no guard — a single malformed
keepalive/comment frame killed the whole message handler. It now follows `UsageStats`
(try/catch + early return).

## 7. Auto-refresh intervals must be cleared on unmount AND on visibility change

`ProviderLimits/index.js` is the model: clear in effect cleanup + on `visibilitychange`.
`TokenSaverClient` polls `/api/headroom/extras` every 1.5s — its interval is cleared on
unmount (`useEffect(() => () => stopLogPolling(), ...)`). Do not regress it.

## 8. Secrets must never appear in a response body — FIXED

`/api/settings` strips `password`/`oidcClientSecret` (CWE-915 mass-assignment guard
`PROTECTED_SETTING_KEYS`), but the GET/PATCH responses still echoed `mitmSudoEncrypted`
(the encrypted sudo password for the MITM proxy). Both paths now strip it and expose a
boolean `mitmSudoConfigured` instead. Keep that list complete when adding new secret
fields. `/api/keys` returns full key values on GET — by design for the dashboard, but it
is protected auth, do not relax it.

## 9. `.kiro/settings/mcp.json` contains live tokens — FIXED

`.gitignore` now ignores `.kiro/settings/`. Never paste a token into a file that is not
gitignored, and never commit `.kiro/`.

## 10. Peer-trust headers must match between prod and tests — FIXED

The 9Router→Multiver rename moved prod to `x-mv-real-ip` / `x-mv-peer-token` /
`x-mv-cli-token` (stamped by `custom-server.js`, checked by `trustedPeer.js`), but three
test files still asserted the legacy `x-9r-*` names, so every peer-trust test failed
against prod code. After any header rename, update `tests/unit/dashboard-guard.test.js`,
`tests/unit/local-request-peer-trust-3294.test.js`, and
`tests/unit/custom-server-peer-headers.test.js` in the same commit.

## 11. `sanitizeHeaders` must strip process trust secrets — FIXED

`requestDetailsRepo.sanitizeHeaders` dropped `authorization`/`x-api-key`/`cookie`/`token`
but NOT `x-mv-peer-token` / `x-mv-cli-token`, so the per-process peer secret leaked into
persisted request details (rendered in the dashboard, uploaded by cloud sync). The
denylist now includes both `x-mv-*` and legacy `x-9r-*` trust headers.
