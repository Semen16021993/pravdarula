#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

command -v git >/dev/null || { echo 'git is required.' >&2; exit 1; }
if [[ "$(git branch --show-current)" != "main" ]]; then
  echo "Deploy from the main branch (Lovable default). Current branch: $(git branch --show-current)" >&2
  exit 1
fi
if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree has local changes. Commit or stash them before deploying." >&2
  exit 1
fi

echo '== Sync latest Lovable changes from GitHub main =='
git fetch origin
git pull --ff-only origin main

CONFIG="${DEPLOY_CONFIG:-.deploy-yandex.env}"
if [[ ! -f "$CONFIG" ]]; then echo "Missing $CONFIG. Copy .deploy-yandex.env.example and fill the Yandex Cloud resource IDs." >&2; exit 1; fi
# shellcheck disable=SC1090
source "$CONFIG"
: "${YC_BUCKET:=pravdarula.ru}"
: "${YC_FUNCTION_ID:?Set YC_FUNCTION_ID in $CONFIG}"
: "${YC_GATEWAY_ID:?Set YC_GATEWAY_ID in $CONFIG}"
: "${YC_RUNTIME_SA_ID:?Set YC_RUNTIME_SA_ID in $CONFIG}"
: "${YC_AUTH_SECRET_ID:?Set YC_AUTH_SECRET_ID in $CONFIG}"
: "${YDB_CONNECTION_STRING:?Set YDB_CONNECTION_STRING in $CONFIG}"
: "${APP_BASE_URL:?Set APP_BASE_URL in $CONFIG}"
: "${YANDEX_PAY_ENV:=sandbox}"
: "${POSTBOX_FROM_EMAIL:=no-reply@auth.pravdarula.ru}"
command -v yc >/dev/null || { echo 'yc CLI is required.' >&2; exit 1; }
command -v npm >/dev/null || { echo 'npm is required.' >&2; exit 1; }
echo '== Build static SPA =='
npm run build:yandex
if [[ ! -f .output/public/_shell.html ]]; then echo 'SPA shell .output/public/_shell.html was not generated.' >&2; exit 1; fi
cp .output/public/_shell.html .output/public/index.html
echo '== Upload static files to Object Storage =='
yc storage s3 cp --recursive --cache-control 'public,max-age=300' .output/public "s3://${YC_BUCKET}/"
yc storage s3 cp .output/public/index.html "s3://${YC_BUCKET}/index.html" --content-type 'text/html; charset=utf-8' --cache-control 'no-cache,max-age=0' --only-show-errors
shopt -s nullglob
for file in .output/public/assets/*.js; do name="${file##*/}"; yc storage s3 cp "$file" "s3://${YC_BUCKET}/assets/$name" --content-type 'application/javascript' --cache-control 'public,max-age=31536000,immutable' --only-show-errors; done
for file in .output/public/assets/*.css; do name="${file##*/}"; yc storage s3 cp "$file" "s3://${YC_BUCKET}/assets/$name" --content-type 'text/css; charset=utf-8' --cache-control 'public,max-age=31536000,immutable' --only-show-errors; done
for file in .output/public/assets/*.jpg .output/public/assets/*.jpeg; do name="${file##*/}"; yc storage s3 cp "$file" "s3://${YC_BUCKET}/assets/$name" --content-type 'image/jpeg' --cache-control 'public,max-age=31536000,immutable' --only-show-errors; done
for file in .output/public/fonts/*.ttf; do name="${file##*/}"; yc storage s3 cp "$file" "s3://${YC_BUCKET}/fonts/$name" --content-type 'font/ttf' --cache-control 'public,max-age=31536000,immutable' --only-show-errors; done
echo '== Build Cloud Function =='
./yandex-api/build.sh
echo '== Publish Cloud Function version =='
ENVIRONMENT="YDB_CONNECTION_STRING=${YDB_CONNECTION_STRING},POSTBOX_FROM_EMAIL=${POSTBOX_FROM_EMAIL},YANDEX_PAY_ENV=${YANDEX_PAY_ENV},APP_BASE_URL=${APP_BASE_URL}"
if [[ -n "${APP_ORIGINS:-}" ]]; then ENVIRONMENT="${ENVIRONMENT},APP_ORIGINS=${APP_ORIGINS}"; fi
if [[ -n "${YANDEX_PAY_MERCHANT_ID:-}" ]]; then ENVIRONMENT="${ENVIRONMENT},YANDEX_PAY_MERCHANT_ID=${YANDEX_PAY_MERCHANT_ID}"; fi
ARGS=(yc serverless function version create --function-id "$YC_FUNCTION_ID" --runtime nodejs22 --entrypoint index.handler --memory 256m --execution-timeout 30s --service-account-id "$YC_RUNTIME_SA_ID" --source-path yandex-api/pravdarula-api.zip --environment "$ENVIRONMENT" --secret "id=${YC_AUTH_SECRET_ID},key=AUTH_SECRET,environment-variable=AUTH_SECRET" --description "Pravdo Rulya deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)")
if [[ -n "${YC_PAY_SECRET_ID:-}" ]]; then
  if [[ "${YANDEX_PAY_ENV}" == "live" ]]; then
    ARGS+=(--secret "id=${YC_PAY_SECRET_ID},key=YANDEX_PAY_API_KEY,environment-variable=YANDEX_PAY_API_KEY")
  else
    ARGS+=(--secret "id=${YC_PAY_SECRET_ID},key=YANDEX_PAY_SANDBOX_API_KEY,environment-variable=YANDEX_PAY_SANDBOX_API_KEY")
  fi
fi
"${ARGS[@]}"
echo '== Update API Gateway =='
yc serverless api-gateway update "$YC_GATEWAY_ID" --spec yandex-api/api-gateway.yaml
if [[ -n "${APP_BASE_URL:-}" ]]; then
  echo '== Production-domain health check =='
  curl --fail --silent --show-error "${APP_BASE_URL%/}/api/health"
  echo
  echo "Deployed: ${APP_BASE_URL%/}/"
fi
