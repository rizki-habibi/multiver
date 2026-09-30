#!/usr/bin/env bash
set -euo pipefail

# Multiver: do not consume a Vercel deployment for the automatic
# version-only commit created by Auto Version & Tag.
MESSAGE="$(git log -1 --pretty=%B 2>/dev/null || true)"

if printf '%s' "$MESSAGE" | grep -q '\[skip version\]'; then
  echo "Multiver auto-version commit detected; skipping Vercel build."
  exit 0
fi

echo "Application change detected; continue with Vercel build."
exit 1
