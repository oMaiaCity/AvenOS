#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
base="$root/deploy/e2e/docker-compose.yml"
override="$root/deploy/local/docker-compose.yml"
project=aven-local
key_dir=$(mktemp -d)
trap 'rm -rf "$key_dir"' EXIT
openssl genpkey -algorithm ED25519 -out "$key_dir/tenant-private.pem" >/dev/null 2>&1
openssl pkey -in "$key_dir/tenant-private.pem" -pubout -out "$key_dir/tenant-public.pem" >/dev/null 2>&1
E2E_TENANT_PRIVATE_KEY=$(sed ':a;N;$!ba;s/\n/\\n/g' "$key_dir/tenant-private.pem")
E2E_TENANT_PUBLIC_KEY=$(sed ':a;N;$!ba;s/\n/\\n/g' "$key_dir/tenant-public.pem")
export E2E_TENANT_PRIVATE_KEY E2E_TENANT_PUBLIC_KEY

if [ -n "${LOCAL_LLM_MODEL:-}" ] && [ -n "${LLM_GATEWAY_MODELS_JSON:-}" ]; then
  echo "Set LOCAL_LLM_MODEL or LLM_GATEWAY_MODELS_JSON, not both." >&2
  exit 2
fi
if [ -n "${LOCAL_LLM_MODEL:-}" ]; then
  LLM_GATEWAY_MODELS_JSON=$(bun "$root/deploy/local/llm-catalog.ts")
  local_llm_description="local OpenAI-compatible model ${LOCAL_LLM_MODEL}"
elif [ -n "${LLM_GATEWAY_MODELS_JSON:-}" ]; then
  local_llm_description="custom OpenAI-compatible catalog"
else
  LLM_GATEWAY_MODELS_JSON='[{"id":"deepseek/deepseek-v4-flash-0731","label":"Deterministic local chat","capabilities":["text-generation","streaming","tool-calling"],"baseUrl":"http://llm-mock:8090/v1","upstreamModel":"e2e-chat","profile":"generic-json","authMode":"none"}]'
  local_llm_description="deterministic built-in mock"
fi
if [ -z "${LLM_GATEWAY_CREDENTIALS_JSON:-}" ]; then
  LLM_GATEWAY_CREDENTIALS_JSON='{}'
fi
LLM_GATEWAY_ENABLED=${LLM_GATEWAY_ENABLED:-true}
LLM_GATEWAY_TIMEOUT_SECONDS=${LLM_GATEWAY_TIMEOUT_SECONDS:-180}
LLM_GATEWAY_ALLOW_INSECURE_HTTP=${LLM_GATEWAY_ALLOW_INSECURE_HTTP:-true}
export LLM_GATEWAY_ENABLED LLM_GATEWAY_MODELS_JSON LLM_GATEWAY_CREDENTIALS_JSON
export LLM_GATEWAY_TIMEOUT_SECONDS LLM_GATEWAY_ALLOW_INSECURE_HTTP

if [ -n "${POLAR_API_KEY:-}" ]; then
  if [ "${POLAR_SERVER:-sandbox}" != "sandbox" ]; then
    echo "The interactive local stack only accepts POLAR_SERVER=sandbox." >&2
    exit 2
  fi
  if [ -z "${POLAR_WEBHOOK_SECRET:-}" ] || [ -z "${AVEN_TIER_NAME:-}" ]; then
    echo "POLAR_WEBHOOK_SECRET and AVEN_TIER_NAME are required with POLAR_API_KEY." >&2
    exit 2
  fi
  ALLOW_FAKE_PAYMENTS=false
else
  ALLOW_FAKE_PAYMENTS=true
fi
export ALLOW_FAKE_PAYMENTS

if [ -z "${NODE_AUTH_TOKEN:-}" ]; then
  NODE_AUTH_TOKEN=$(sed -n 's#^//npm.pkg.github.com/:_authToken=##p' "$HOME/.npmrc" 2>/dev/null | tail -n 1)
  export NODE_AUTH_TOKEN
fi
if [ -z "${NODE_AUTH_TOKEN:-}" ] || [ "$NODE_AUTH_TOKEN" = "undefined" ]; then
  echo "NODE_AUTH_TOKEN with read:packages is required to build the local services." >&2
  exit 1
fi

docker build --file "$root/deploy/database/Dockerfile" --tag aven-e2e-database:local "$root"
docker build --secret id=npm_token,env=NODE_AUTH_TOKEN --file "$root/services/identity/Dockerfile" --tag aven-e2e-identity:local "$root"
docker build --secret id=npm_token,env=NODE_AUTH_TOKEN --file "$root/services/aven-api/Dockerfile" --tag aven-e2e-api:local "$root"
docker build --secret id=npm_token,env=NODE_AUTH_TOKEN --file "$root/services/checkout/Dockerfile" --tag aven-e2e-checkout:local "$root"
docker build --secret id=npm_token,env=NODE_AUTH_TOKEN --file "$root/services/platform-provisioner/Dockerfile" --tag aven-e2e-platform-provisioner:local "$root"
docker build --secret id=npm_token,env=NODE_AUTH_TOKEN --file "$root/services/intent-service/Dockerfile" --tag aven-e2e-intent-service:local "$root"
docker build --secret id=npm_token,env=NODE_AUTH_TOKEN --file "$root/services/actor-runner/Dockerfile" --tag aven-e2e-actor-runner:local "$root"
docker build --file "$root/services/artifact-store/Dockerfile" --tag aven-e2e-artifact-store:local "$root"
docker build --file "$root/services/static-site-host/Dockerfile" --tag aven-e2e-static-site-host:local "$root"

docker compose --project-name "$project" --file "$base" --file "$override" config --quiet
docker compose --project-name "$project" --file "$base" --file "$override" up --detach --wait --wait-timeout 360

echo "Local platform is ready:"
echo "  identity  http://localhost:13100"
echo "  checkout  http://localhost:13200"
echo "  facade    http://localhost:13000"
echo "  mail      http://localhost:18025"
echo "  llm       $local_llm_description"
echo "Create a local account with: bun run local:account -- you@example.test"
