#!/usr/bin/env bash
# Sets env vars on Railway services + creates the worker service for StoreBridge.
#
# Prerequisites:
#   1. Project exists on Railway (created out-of-band).
#   2. Web service exists (deployed from GitHub). DEPLOY_SERVICE_ID_WEB is its id.
#   3. Postgres and Redis add-ons exist (added via Railway UI). Their DATABASE_URL
#      and REDIS_URL are already available as shared-reference variables.
#   4. Env vars below: RAILWAY_TOKEN, PROJECT_ID, ENVIRONMENT_ID,
#      SERVICE_ID_WEB, (optional) APP_URL, SHOPIFY_API_KEY, SHOPIFY_API_SECRET.
#
# This script is idempotent: variableUpsert replaces existing values.

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/railway-api.sh"

: "${PROJECT_ID:?PROJECT_ID is required}"
: "${ENVIRONMENT_ID:?ENVIRONMENT_ID is required}"
: "${SERVICE_ID_WEB:?SERVICE_ID_WEB is required}"
: "${APP_URL:?APP_URL is required (e.g. https://<project>.up.railway.app)}"
: "${APP_ENCRYPTION_KEY:?APP_ENCRYPTION_KEY is required (openssl rand -base64 32)}"

SHOPIFY_API_KEY="${SHOPIFY_API_KEY:-placeholder_set_after_partner_app_created}"
SHOPIFY_API_SECRET="${SHOPIFY_API_SECRET:-placeholder_min_16_chars_set_later}"
SHOPIFY_SCOPES="${SHOPIFY_SCOPES:-read_products,write_products,read_inventory,write_inventory}"
SHOPIFY_API_VERSION="${SHOPIFY_API_VERSION:-2025-01}"
LOG_LEVEL="${LOG_LEVEL:-info}"

echo "==> Setting env vars on web service ($SERVICE_ID_WEB)"
set_var() {
  local name="$1" value="$2"
  rw_mutation "mutation { variableUpsert(input: { projectId: \"$PROJECT_ID\", environmentId: \"$ENVIRONMENT_ID\", serviceId: \"$SERVICE_ID_WEB\", name: \"$name\", value: \"$value\" }) }" >/dev/null
  echo "    $name"
}

set_var "NODE_ENV" "production"
set_var "APP_URL" "$APP_URL"
set_var "SHOPIFY_APP_URL" "$APP_URL"
set_var "SHOPIFY_API_KEY" "$SHOPIFY_API_KEY"
set_var "SHOPIFY_API_SECRET" "$SHOPIFY_API_SECRET"
set_var "SHOPIFY_SCOPES" "$SHOPIFY_SCOPES"
set_var "SHOPIFY_API_VERSION" "$SHOPIFY_API_VERSION"
set_var "APP_ENCRYPTION_KEY" "$APP_ENCRYPTION_KEY"
set_var "LOG_LEVEL" "$LOG_LEVEL"
# DATABASE_URL and REDIS_URL are referenced from the Postgres/Redis add-ons —
# Railway injects these automatically once those services exist in the project.

echo
echo "==> Creating worker service from same GitHub repo"
WORKER_RESP=$(rw_mutation "mutation { serviceCreate(input: { projectId: \"$PROJECT_ID\", environmentId: \"$ENVIRONMENT_ID\", name: \"worker\", source: { repo: \"atifali-pm/storebridge\" }, branch: \"main\" }) { id name } }")
SERVICE_ID_WORKER=$(echo "$WORKER_RESP" | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['serviceCreate']['id'])")
echo "    worker service id: $SERVICE_ID_WORKER"

echo
echo "==> Setting env vars on worker service"
SERVICE_ID_FOR_VARS="$SERVICE_ID_WORKER"
set_var_worker() {
  local name="$1" value="$2"
  rw_mutation "mutation { variableUpsert(input: { projectId: \"$PROJECT_ID\", environmentId: \"$ENVIRONMENT_ID\", serviceId: \"$SERVICE_ID_WORKER\", name: \"$name\", value: \"$value\" }) }" >/dev/null
  echo "    $name"
}
set_var_worker "NODE_ENV" "production"
set_var_worker "APP_URL" "$APP_URL"
set_var_worker "SHOPIFY_APP_URL" "$APP_URL"
set_var_worker "SHOPIFY_API_KEY" "$SHOPIFY_API_KEY"
set_var_worker "SHOPIFY_API_SECRET" "$SHOPIFY_API_SECRET"
set_var_worker "SHOPIFY_SCOPES" "$SHOPIFY_SCOPES"
set_var_worker "SHOPIFY_API_VERSION" "$SHOPIFY_API_VERSION"
set_var_worker "APP_ENCRYPTION_KEY" "$APP_ENCRYPTION_KEY"
set_var_worker "LOG_LEVEL" "$LOG_LEVEL"
# Worker needs a different start command:
set_var_worker "RAILWAY_RUN_COMMAND" "pnpm worker"

echo
echo "==> Triggering redeploy of web service"
rw_mutation "mutation { serviceInstanceRedeploy(serviceId: \"$SERVICE_ID_WEB\", environmentId: \"$ENVIRONMENT_ID\") }" >/dev/null
echo "    web redeploy queued"

echo
echo "Done."
echo "Project:  https://railway.com/project/$PROJECT_ID"
echo "Web:      $APP_URL"
echo "Worker:   id $SERVICE_ID_WORKER (no public URL, background only)"
