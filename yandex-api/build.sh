#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
if [[ ! -x yandex-api/node_modules/.bin/esbuild ]]; then
  npm ci --prefix yandex-api
fi
mkdir -p yandex-api/dist
./yandex-api/node_modules/.bin/esbuild yandex-api/index.ts --bundle --platform=node --target=node22 --format=cjs --outfile=yandex-api/dist/index.js
printf '{"type":"commonjs"}\n' > yandex-api/dist/package.json
# Stable ZIP timestamps/metadata keep exact-commit compatibility evidence reusable on reruns.
TZ=UTC touch -t 198001010000 yandex-api/dist/index.js yandex-api/dist/package.json
(cd yandex-api/dist && zip -X -q -j -FS ../pravdarula-api.zip index.js package.json)
echo "Built yandex-api/pravdarula-api.zip"
