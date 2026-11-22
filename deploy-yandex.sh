#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
# Make locally installed tools available regardless of how Terminal was opened.
export PATH="$HOME/.bun/bin:$HOME/yandex-cloud/bin:$HOME/ydb/bin:$PATH"
for tool in git node npm bun yc ydb curl zip; do
  command -v "$tool" >/dev/null || { echo "$tool required" >&2; exit 1; }
done
[[ "$(git branch --show-current)" == main ]] || { echo 'Deploy from main'; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit local changes first'; exit 1; }
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) throw Error("Node.js 22+ required")'
# Local source synchronization only; cloud writes happen in the checked runner AFTER approvals.
git fetch origin
git pull --ff-only origin main
CONFIG="${DEPLOY_CONFIG:-.deploy-yandex.env}"
[[ -f "$CONFIG" ]] || { echo "Missing $CONFIG"; exit 1; }
set -a
# shellcheck disable=SC1090
source "$CONFIG"
set +a
: "${YC_BUCKET:=pravdarula.ru}" "${APP_BASE_URL:=https://pravdarula.ru}"
export YC_BUCKET APP_BASE_URL
# Deterministic dependencies; these steps never write to production.
if [[ -f package-lock.json ]]; then npm ci; else bun install --frozen-lockfile; fi
npm ci --prefix yandex-api
npm test
node --test scripts/*.test.mjs yandex-api/migration-engine.test.mjs yandex-api/schema-check.test.mjs
# One command: build, publish UI + API + validated migrations, verify, and auto-recover on failure.
node scripts/release-runner.mjs
