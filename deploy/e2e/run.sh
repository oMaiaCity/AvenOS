#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
compose="$root/deploy/e2e/docker-compose.yml"
project=${COMPOSE_PROJECT_NAME:-aven-e2e-$$}
built_images=""
key_dir=$(mktemp -d)
hardening="$key_dir/hardening.json"
bun "$root/deploy/e2e/render-hardening.ts" "$hardening"
openssl genpkey -algorithm ED25519 -out "$key_dir/tenant-private.pem" >/dev/null 2>&1
openssl pkey -in "$key_dir/tenant-private.pem" -pubout -out "$key_dir/tenant-public.pem" >/dev/null 2>&1
E2E_TENANT_PRIVATE_KEY=$(sed ':a;N;$!ba;s/\n/\\n/g' "$key_dir/tenant-private.pem")
E2E_TENANT_PUBLIC_KEY=$(sed ':a;N;$!ba;s/\n/\\n/g' "$key_dir/tenant-public.pem")
export E2E_TENANT_PRIVATE_KEY E2E_TENANT_PUBLIC_KEY

# Do not contend with an interactive local stack or another worktree's E2E.
# Docker keeps the internal service ports fixed; only disposable host bindings
# and the public browser origins vary.
ports=$(bun -e '
  const servers = Array.from({ length: 7 }, () =>
    Bun.listen({ hostname: "127.0.0.1", port: 0, socket: { data() {} } })
  )
  console.log(servers.map((server) => server.port).join(" "))
  for (const server of servers) server.stop(true)
')
set -- $ports
E2E_IDENTITY_HOST_PORT=$1
E2E_CHECKOUT_HOST_PORT=$2
E2E_API_HOST_PORT=$3
E2E_DATABASE_HOST_PORT=$4
E2E_STATIC_HOST_PORT=$5
E2E_MAILPIT_HOST_PORT=$6
E2E_ARTIFACT_STORE_HOST_PORT=$7
export E2E_IDENTITY_HOST_PORT E2E_CHECKOUT_HOST_PORT E2E_API_HOST_PORT
export E2E_DATABASE_HOST_PORT E2E_STATIC_HOST_PORT E2E_MAILPIT_HOST_PORT
export E2E_ARTIFACT_STORE_HOST_PORT

# Only explicit provider configuration may send repository OCR fixtures outside
# this disposable stack. Chat/voice remains deterministic in either lane.
E2E_LLM_MODELS_JSON=$(bun "$root/deploy/e2e/llm-catalog.ts")
export E2E_LLM_MODELS_JSON

teardown() {
  docker compose --project-name "$project" --file "$compose" --file "$hardening" --profile hosting down --volumes --remove-orphans >/dev/null 2>&1 || true
}
finish() {
  status=$?
  trap - EXIT INT TERM
  if [ "$status" -ne 0 ]; then
    docker compose --project-name "$project" --file "$compose" --file "$hardening" --profile hosting ps --all || true
    docker compose --project-name "$project" --file "$compose" --file "$hardening" --profile hosting logs --no-color --tail=200 || true
  fi
  teardown
  rm -rf "$key_dir"
  if [ -n "$built_images" ]; then
    for image in $built_images; do
      docker image rm "$image" >/dev/null 2>&1 || true
    done
  fi
  exit "$status"
}
trap finish EXIT INT TERM

teardown

if [ -z "${NODE_AUTH_TOKEN:-}" ]; then
  NODE_AUTH_TOKEN=$(sed -n 's#^//npm.pkg.github.com/:_authToken=##p' "$HOME/.npmrc" 2>/dev/null | tail -n 1)
  export NODE_AUTH_TOKEN
fi
if [ -z "${NODE_AUTH_TOKEN:-}" ] || [ "$NODE_AUTH_TOKEN" = "undefined" ]; then
  echo "NODE_AUTH_TOKEN with read:packages is required to build checkout." >&2
  exit 1
fi

# Build the real desktop application against this run's disposable origins.
# The E2E flag only suppresses opening a second unmanaged browser window and
# exposes the fixture through the production ingest function.
VITE_AVEN_E2E=true bun run --cwd "$root/app" build
# Provision the pinned runtime before Cargo evaluates Tauri resources. This
# deliberately exercises the packaged-resource lookup used by the installed
# Linux app; relying on a developer's pre-existing ignored runtime would make a
# clean checkout compile and then panic before its first window opened.
AVEN_SPEECH_GPU=cpu bun "$root/scripts/fetch-onnxruntime.ts"
AVEN_IDENTITY_BASE_URL="http://localhost:$E2E_IDENTITY_HOST_PORT" \
AVEN_API_BASE_URL="http://127.0.0.1:$E2E_API_HOST_PORT" \
cargo build --locked --release --features custom-protocol,e2e-voice-proof --manifest-path "$root/app/src-tauri/Cargo.toml" --bin aven-os-app
E2E_TAURI_APPLICATION="$root/target/rust/release/aven-os-app"
E2E_TAURI_DRIVER=${TAURI_DRIVER_BIN:-$HOME/.cargo/bin/tauri-driver}
E2E_TAURI_FIXTURE="$root/deploy/e2e/fixtures/e2e-document.txt"
if [ ! -x "$E2E_TAURI_APPLICATION" ] || [ ! -x "$E2E_TAURI_DRIVER" ]; then
  echo "The Tauri application and tauri-driver must both be executable." >&2
  exit 1
fi
export E2E_TAURI_APPLICATION E2E_TAURI_DRIVER E2E_TAURI_FIXTURE

E2E_AVEN_CEO_IPV4="192.0.2.10"
E2E_AVEN_CEO_IPV6=""
export E2E_AVEN_CEO_IPV4 E2E_AVEN_CEO_IPV6

if [ "${E2E_SKIP_IMAGE_BUILD:-false}" != "true" ]; then
  E2E_DATABASE_IMAGE="aven-e2e-database:$project"
  E2E_PROXY_IMAGE="aven-e2e-proxy:$project"
  export E2E_DATABASE_IMAGE E2E_PROXY_IMAGE
  E2E_IDENTITY_IMAGE="aven-e2e-identity:$project"
  E2E_API_IMAGE="aven-e2e-api:$project"
  E2E_CHECKOUT_IMAGE="aven-e2e-checkout:$project"
  E2E_PLATFORM_PROVISIONER_IMAGE="aven-e2e-platform-provisioner:$project"
  E2E_INTENT_SERVICE_IMAGE="aven-e2e-intent-service:$project"
  E2E_ACTOR_RUNNER_IMAGE="aven-e2e-actor-runner:$project"
  E2E_ARTIFACT_STORE_IMAGE="aven-e2e-artifact-store:$project"
  E2E_STATIC_SITE_HOST_IMAGE="aven-e2e-static-site-host:$project"
  export E2E_IDENTITY_IMAGE E2E_API_IMAGE E2E_CHECKOUT_IMAGE
  export E2E_PLATFORM_PROVISIONER_IMAGE E2E_INTENT_SERVICE_IMAGE E2E_ACTOR_RUNNER_IMAGE
  export E2E_ARTIFACT_STORE_IMAGE E2E_STATIC_SITE_HOST_IMAGE
  built_images="$E2E_IDENTITY_IMAGE $E2E_API_IMAGE $E2E_CHECKOUT_IMAGE $E2E_PLATFORM_PROVISIONER_IMAGE $E2E_INTENT_SERVICE_IMAGE $E2E_ACTOR_RUNNER_IMAGE $E2E_ARTIFACT_STORE_IMAGE $E2E_STATIC_SITE_HOST_IMAGE"
  built_images="$built_images $E2E_DATABASE_IMAGE $E2E_PROXY_IMAGE"
  docker build --file "$root/deploy/database/Dockerfile" --tag "$E2E_DATABASE_IMAGE" "$root"
  docker build --file "$root/deploy/proxy/Dockerfile" --tag "$E2E_PROXY_IMAGE" "$root"
  docker build --secret id=npm_token,env=NODE_AUTH_TOKEN --file "$root/services/identity/Dockerfile" --tag "$E2E_IDENTITY_IMAGE" "$root"
  docker build --secret id=npm_token,env=NODE_AUTH_TOKEN --file "$root/services/aven-api/Dockerfile" --tag "$E2E_API_IMAGE" "$root"
  docker build --secret id=npm_token,env=NODE_AUTH_TOKEN --file "$root/services/checkout/Dockerfile" --tag "$E2E_CHECKOUT_IMAGE" "$root"
  docker build --secret id=npm_token,env=NODE_AUTH_TOKEN --build-arg "SOURCE_REVISION=$(git -C "$root" rev-parse HEAD)" --file "$root/services/platform-provisioner/Dockerfile" --tag "$E2E_PLATFORM_PROVISIONER_IMAGE" "$root"
  docker build --secret id=npm_token,env=NODE_AUTH_TOKEN --file "$root/services/intent-service/Dockerfile" --tag "$E2E_INTENT_SERVICE_IMAGE" "$root"
  docker build --secret id=npm_token,env=NODE_AUTH_TOKEN --file "$root/services/actor-runner/Dockerfile" --tag "$E2E_ACTOR_RUNNER_IMAGE" "$root"
  docker build --file "$root/services/artifact-store/Dockerfile" --tag "$E2E_ARTIFACT_STORE_IMAGE" "$root"
  docker build --file "$root/services/static-site-host/Dockerfile" --tag "$E2E_STATIC_SITE_HOST_IMAGE" "$root"
fi

# Registry access is needed by image builds only. Customer fixtures and tests receive no token.
unset NODE_AUTH_TOKEN

docker compose --project-name "$project" --file "$compose" --file "$hardening" config --quiet
if [ -n "$built_images" ]; then
  # Internally generated, whitespace-free image names; deliberate word splitting.
  # shellcheck disable=SC2086
  bash "$root/scripts/scan-container-os.sh" $built_images
fi
docker compose --project-name "$project" --file "$compose" --file "$hardening" --profile hosting up --detach --wait --wait-timeout 360

E2E_SILENT_VOICE_FIXTURE=$(cargo run --quiet --locked \
  --manifest-path "$root/libs/aven-voice-runtime/Cargo.toml" \
  --features silent-audio-e2e \
  --example silent_audio_fixture)
E2E_SILENT_DUPLEX_FIXTURE=$(cargo run --quiet --locked \
  --manifest-path "$root/libs/aven-voice-runtime/Cargo.toml" \
  --features silent-audio-e2e \
  --example silent_duplex_conversation)
export E2E_SILENT_VOICE_FIXTURE E2E_SILENT_DUPLEX_FIXTURE

TEST_ACTOR_RUNNER_DATABASE_URL="postgres://postgres:platform-admin-e2e@127.0.0.1:$E2E_DATABASE_HOST_PORT/postgres" \
TEST_ARTIFACT_STORE_BASE_URL="http://127.0.0.1:$E2E_ARTIFACT_STORE_HOST_PORT" \
TEST_ARTIFACT_STORE_BEARER_TOKEN="artifact-store-runtime-conformance-token" \
TEST_ARTIFACT_STORE_SCOPE_ID="99999999-9999-4999-8999-999999999999" \
bun run --cwd "$root/services/actor-runner" test:e2e:persistence

TEST_ADMIN_DATABASE_URL="postgres://postgres:platform-admin-e2e@127.0.0.1:$E2E_DATABASE_HOST_PORT/postgres" \
bun run --cwd "$root/services/checkout" test

TEST_IDENTITY_ADMIN_DATABASE_URL="postgres://postgres:platform-admin-e2e@127.0.0.1:$E2E_DATABASE_HOST_PORT/postgres" \
bun run --cwd "$root/services/identity" test

E2E_IDENTITY_ORIGIN="http://127.0.0.1:$E2E_IDENTITY_HOST_PORT" \
E2E_IDENTITY_BROWSER_ORIGIN="http://localhost:$E2E_IDENTITY_HOST_PORT" \
E2E_CHECKOUT_ORIGIN="http://127.0.0.1:$E2E_CHECKOUT_HOST_PORT" \
E2E_CHECKOUT_BROWSER_ORIGIN="http://localhost:$E2E_CHECKOUT_HOST_PORT" \
E2E_API_ORIGIN="http://127.0.0.1:$E2E_API_HOST_PORT" \
E2E_STATIC_ORIGIN="http://127.0.0.1:$E2E_STATIC_HOST_PORT" \
E2E_MAILPIT_ORIGIN="http://127.0.0.1:$E2E_MAILPIT_HOST_PORT" \
E2E_DATABASE_URL="postgres://postgres:platform-admin-e2e@127.0.0.1:$E2E_DATABASE_HOST_PORT/postgres" \
E2E_TAURI_APPLICATION="$E2E_TAURI_APPLICATION" \
E2E_TAURI_DRIVER="$E2E_TAURI_DRIVER" \
E2E_TAURI_FIXTURE="$E2E_TAURI_FIXTURE" \
E2E_SILENT_VOICE_FIXTURE="$E2E_SILENT_VOICE_FIXTURE" \
E2E_SILENT_DUPLEX_FIXTURE="$E2E_SILENT_DUPLEX_FIXTURE" \
bunx playwright test --config "$root/deploy/e2e/playwright.config.ts"

docker compose --project-name "$project" --file "$compose" --file "$hardening" ps
bun run --cwd "$root" test:runtime-install
