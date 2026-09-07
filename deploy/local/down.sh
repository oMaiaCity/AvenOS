#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
export E2E_TENANT_PRIVATE_KEY=${E2E_TENANT_PRIVATE_KEY:-unused-local-teardown-key}
export E2E_TENANT_PUBLIC_KEY=${E2E_TENANT_PUBLIC_KEY:-unused-local-teardown-key}
export LLM_GATEWAY_ENABLED=${LLM_GATEWAY_ENABLED:-true}
if [ -z "${LLM_GATEWAY_MODELS_JSON:-}" ]; then
  LLM_GATEWAY_MODELS_JSON='[]'
fi
if [ -z "${LLM_GATEWAY_CREDENTIALS_JSON:-}" ]; then
  LLM_GATEWAY_CREDENTIALS_JSON='{}'
fi
export LLM_GATEWAY_MODELS_JSON LLM_GATEWAY_CREDENTIALS_JSON
export LLM_GATEWAY_ALLOW_INSECURE_HTTP=${LLM_GATEWAY_ALLOW_INSECURE_HTTP:-true}
docker compose \
  --project-name aven-local \
  --file "$root/deploy/e2e/docker-compose.yml" \
  --file "$root/deploy/local/docker-compose.yml" \
  down --volumes --remove-orphans
