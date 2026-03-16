#!/usr/bin/env bash
# Run all CI checks locally before pushing.
# Usage: bash check.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"

echo "==> Install (root — covers worker workspace too)"
pnpm install --frozen-lockfile

echo ""
echo "==> Typecheck frontend"
pnpm typecheck

echo ""
echo "==> Test frontend"
pnpm test

echo ""
echo "==> Typecheck worker"
(cd "$ROOT/worker" && pnpm typecheck)

echo ""
echo "==> Build frontend (smoke test)"
VITE_BASE_PATH=/ \
VITE_GOOGLE_CLIENT_ID=placeholder \
VITE_API_URL=http://localhost:8787 \
VITE_PUBLIC_URL=http://localhost:5173 \
pnpm build

echo ""
echo "All checks passed."
