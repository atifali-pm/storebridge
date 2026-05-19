#!/usr/bin/env bash
# Thin wrapper around the Railway GraphQL API. Reads RAILWAY_TOKEN from the
# environment. Do NOT commit the token. Intended to be sourced by other scripts.
#
# Usage:
#   source scripts/railway-api.sh
#   rw_query "{ me { id } }"
#   rw_mutation "mutation { ... }"

set -euo pipefail

RAILWAY_GRAPHQL="https://backboard.railway.app/graphql/v2"

if [[ -z "${RAILWAY_TOKEN:-}" ]]; then
  echo "RAILWAY_TOKEN env var is required" >&2
  return 1 2>/dev/null || exit 1
fi

rw_call() {
  local query="$1"
  local payload
  payload=$(python3 -c 'import json,sys; print(json.dumps({"query": sys.argv[1]}))' "$query")
  curl -sS -X POST "$RAILWAY_GRAPHQL" \
    -H "Authorization: Bearer ${RAILWAY_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$payload"
}

rw_query() { rw_call "$1"; }
rw_mutation() { rw_call "$1"; }
