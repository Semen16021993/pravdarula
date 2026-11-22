#!/usr/bin/env bash
set -euo pipefail
umask 077
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
confirm() {
  local answer
  [[ -t 0 ]] || { echo 'Interactive approval required; no writes allowed.' >&2; exit 1; }
  read -r -p "$1 Type DEPLOY to continue: " answer
  [[ "$answer" == DEPLOY ]] || { echo 'Cancelled.'; exit 1; }
}
for tool in git node npm yc curl; do command -v "$tool" >/dev/null || { echo "$tool required" >&2; exit 1; }; done
[[ "$(git branch --show-current)" == main ]] || { echo 'Deploy from main'; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Commit local changes first'; exit 1; }
git fetch origin
git pull --ff-only origin main
CONFIG="${DEPLOY_CONFIG:-.deploy-yandex.env}"
[[ -f "$CONFIG" ]] || { echo "Missing $CONFIG"; exit 1; }
set -a
# shellcheck disable=SC1090
source "$CONFIG"
set +a
: "${YC_BUCKET:=pravdarula.ru}" "${YC_FUNCTION_ID:?}" "${YC_GATEWAY_ID:?}" "${YC_RUNTIME_SA_ID:?}" "${YC_AUTH_SECRET_ID:?}"
: "${YDB_CONNECTION_STRING:?}" "${APP_BASE_URL:?}" "${YANDEX_PAY_ENV:=sandbox}" "${POSTBOX_FROM_EMAIL:=no-reply@auth.pravdarula.ru}"
export YC_BUCKET APP_BASE_URL
node -e 'if (Number(process.versions.node.split(".")[0]) < 22) throw Error("Node.js 22+ required")'
[[ "$APP_BASE_URL" == https://* ]] || { echo 'HTTPS required'; exit 1; }
# State and backups stay outside the repository so clean-tree checks remain meaningful.
TARGET="$(printf '%s' "$APP_BASE_URL/$YC_BUCKET" | shasum -a 256 | cut -c1-16)"
STATE="${XDG_CACHE_HOME:-$HOME/.cache}/pravdarula-releases/$TARGET"
mkdir -p "$STATE"
mkdir "$STATE/lock" 2>/dev/null || { echo "Release lock held: $STATE/lock"; exit 1; }
SUCCESS=0
trap 'r=$?; rmdir "$STATE/lock"; if [[ "$SUCCESS" != 1 ]]; then echo "Not marked successful. Review $STATE/pending.json and backups; never auto-rollback YDB." >&2; fi; exit "$r"' EXIT
echo '== Read-only resource and health checks =='
yc serverless function get "$YC_FUNCTION_ID" --format json > "$STATE/function-before.json"
yc serverless api-gateway get "$YC_GATEWAY_ID" --format json > "$STATE/gateway-before.json"
curl --fail --silent --show-error "${APP_BASE_URL%/}/api/health"
yc serverless function version list --function-id "$YC_FUNCTION_ID" --format json > "$STATE/versions-before.json"
CURRENT_VERSION="$(node -e 'const v=require(process.argv[1]); const list=Array.isArray(v)?v:v.versions; if(!Array.isArray(list)||!list.length) throw Error("Existing function version baseline unavailable"); list.sort((a,b)=>String(b.createdAt||b.created_at||"").localeCompare(String(a.createdAt||a.created_at||""))); if(!list[0].id) throw Error("Existing version ID missing"); console.log(list[0].id)' "$STATE/versions-before.json")"
yc serverless function version get "$CURRENT_VERSION" --format json > "$STATE/version-before.json"
node scripts/release-cli.mjs plan "$STATE/current.json" "$STATE/plan.json"
flag() { node -e 'process.exit(require(process.argv[1])[process.argv[2]] ? 0 : 1)' "$STATE/plan.json" "$1"; }
[[ -f "$STATE/current.json" ]] || confirm 'No verified release baseline: review first full release.'
echo '== Reproducible dependencies and tests; no production writes yet =='
if [[ -f package-lock.json ]]; then npm ci; else command -v bun >/dev/null || { echo 'Bun required for bun.lock'; exit 1; }; bun install --frozen-lockfile; fi
npm ci --prefix yandex-api
npm test
node --test scripts/*.test.mjs yandex-api/migration-engine.test.mjs
if flag frontend; then
  npm run build:yandex
  [[ -f .output/public/_shell.html ]] || { echo 'SPA shell missing'; exit 1; }
  cp .output/public/_shell.html .output/public/index.html
  node scripts/release-cli.mjs assets .output/public "$STATE/assets.json"
fi
if flag backend; then ./yandex-api/build.sh; fi
if flag gateway; then
  node -e 'const s=require("fs").readFileSync("yandex-api/api-gateway.yaml","utf8"); for (const [k,v] of [["bucket",process.env.YC_BUCKET],["function_id",process.env.YC_FUNCTION_ID],["service_account_id",process.env.YC_RUNTIME_SA_ID]]) if ([...s.matchAll(new RegExp(k+":\\s*([^\\s]+)","g"))].some(m=>m[1]!==v)) throw Error("Gateway resource mismatch: "+k);'
fi
node yandex-api/migrate.mjs check | tee "$STATE/migrations-check.txt"
if flag backend; then
  # Refuse to silently drop unrecognized live environment settings or secret bindings.
  node scripts/verify-function-config.mjs "$STATE/version-before.json"
  echo 'Gateway uses $latest: publishing a function can immediately activate API changes. Verify old/new UI/API compatibility.'
  confirm 'Separate approval for API version activation; no tag or infrastructure migration is performed.'
fi
confirm 'Review exact commit, update plan and migration approvals. Publish?'
cp "$STATE/plan.json" "$STATE/pending.json"
COMMIT="$(git rev-parse HEAD)"
yc storage s3 cp --recursive "s3://${YC_BUCKET}/" "$STATE/backup-$COMMIT/"
node yandex-api/migrate.mjs apply > "$STATE/migrations-applied.json"
export RELEASE_MIGRATIONS="$(cat "$STATE/migrations-applied.json")"
if flag backend; then
  ENVIRONMENT="YDB_CONNECTION_STRING=${YDB_CONNECTION_STRING},POSTBOX_FROM_EMAIL=${POSTBOX_FROM_EMAIL},YANDEX_PAY_ENV=${YANDEX_PAY_ENV},APP_BASE_URL=${APP_BASE_URL}"
  [[ -z "${APP_ORIGINS:-}" ]] || ENVIRONMENT="${ENVIRONMENT},APP_ORIGINS=${APP_ORIGINS}"
  [[ -z "${APP_PREVIEW_ORIGIN:-}" ]] || ENVIRONMENT="${ENVIRONMENT},APP_PREVIEW_ORIGIN=${APP_PREVIEW_ORIGIN}"
  [[ -z "${YANDEX_PAY_MERCHANT_ID:-}" ]] || ENVIRONMENT="${ENVIRONMENT},YANDEX_PAY_MERCHANT_ID=${YANDEX_PAY_MERCHANT_ID}"
  ARGS=(yc serverless function version create --function-id "$YC_FUNCTION_ID" --runtime nodejs22 --entrypoint index.handler --memory 256m --execution-timeout 30s --service-account-id "$YC_RUNTIME_SA_ID" --source-path yandex-api/pravdarula-api.zip --environment "$ENVIRONMENT" --secret "id=${YC_AUTH_SECRET_ID},key=AUTH_SECRET,environment-variable=AUTH_SECRET" --description "Pravdarula commit $COMMIT" --format json)
  if [[ -n "${YC_PAY_SECRET_ID:-}" ]]; then
    if [[ "$YANDEX_PAY_ENV" == live ]]; then PAY_KEY=YANDEX_PAY_API_KEY; else PAY_KEY=YANDEX_PAY_SANDBOX_API_KEY; fi
    ARGS+=(--secret "id=${YC_PAY_SECRET_ID},key=${PAY_KEY},environment-variable=${PAY_KEY}")
  fi
  "${ARGS[@]}" > "$STATE/function-created.json"
  export RELEASE_FUNCTION_VERSION="$(node -e 'const v=require(process.argv[1]); if(!v.id) throw Error("Version ID missing"); console.log(v.id)' "$STATE/function-created.json")"
fi
if flag gateway; then yc serverless api-gateway update "$YC_GATEWAY_ID" --spec yandex-api/api-gateway.yaml > "$STATE/gateway-updated.txt"; fi
if flag frontend; then
  # Upload resources before the entry HTML; retain old hashed resources for recovery.
  yc storage s3 cp --recursive --exclude 'index.html' --exclude '_shell.html' --cache-control 'public,max-age=300' .output/public "s3://${YC_BUCKET}/"
  for ext in js css jpg jpeg; do
    case "$ext" in js) type='application/javascript';; css) type='text/css';; *) type='image/jpeg';; esac
    for file in .output/public/assets/*."$ext"; do
      [[ -f "$file" ]] || continue
      yc storage s3 cp "$file" "s3://${YC_BUCKET}/assets/${file##*/}" --content-type "$type" --cache-control 'public,max-age=31536000,immutable' --only-show-errors
    done
  done
  yc storage s3 cp .output/public/index.html "s3://${YC_BUCKET}/index.html" --content-type 'text/html; charset=utf-8' --cache-control 'no-cache,max-age=0' --only-show-errors
fi
curl --fail --silent --show-error "${APP_BASE_URL%/}/api/health"
curl --fail --silent --show-error "${APP_BASE_URL%/}/" -o "$STATE/published-index.html"
curl --fail --silent --show-error "${APP_BASE_URL%/}/api/auth/me" > "$STATE/signed-out-check.json"
node -e 'if (JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).user !== null) throw Error("Signed-out auth invariant failed")' "$STATE/signed-out-check.json"
export RELEASE_ASSETS="$STATE/assets.json"
export RELEASE_PREVIOUS_VERSION="$CURRENT_VERSION"
node scripts/release-cli.mjs complete "$STATE/plan.json" "$STATE/completed.json"
mv "$STATE/completed.json" "$STATE/current.json"
rm "$STATE/pending.json"
SUCCESS=1
echo "Released $COMMIT. Manifest and recovery files: $STATE"