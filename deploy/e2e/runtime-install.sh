#!/usr/bin/env bash
set -euo pipefail

root=$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
project="aven-runtime-proof-$$"
keys=(DATABASE API PLATFORM_PROVISIONER INTENT_SERVICE ACTOR_RUNNER ARTIFACT_STORE)
files=(deploy/database services/aven-api services/platform-provisioner services/intent-service services/actor-runner services/artifact-store)
built_images=()
cleanup() {
  if ((${#built_images[@]})); then docker image rm "${built_images[@]}" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT
case "${E2E_SKIP_IMAGE_BUILD:-false}" in
  true)
    # The workflow validates the complete manifest and source revision before setting these values.
    for key in "${keys[@]}"; do
      variable="E2E_${key}_IMAGE"
      [[ -n "${!variable:-}" && "${!variable}" != -* ]] || { echo "$variable is required" >&2; exit 64; }
      docker pull "${!variable}"
    done
    ;;
  false)
    [[ -n "${NODE_AUTH_TOKEN:-}" && "$NODE_AUTH_TOKEN" != undefined ]] || {
      echo 'NODE_AUTH_TOKEN with read:packages is required to build runtime images.' >&2; exit 64;
    }
    revision=$(git -C "$root" rev-parse HEAD)
    for index in "${!keys[@]}"; do
      key=${keys[$index]}
      image="$project-${key,,}:local"
      built_images+=("$image")
      export "E2E_${key}_IMAGE=$image"
      arguments=(--build-arg "OS_SECURITY_REFRESH=$project")
      case "$key" in DATABASE|ARTIFACT_STORE) ;; *) arguments+=(--secret id=npm_token,env=NODE_AUTH_TOKEN) ;; esac
      if [[ "$key" == PLATFORM_PROVISIONER ]]; then arguments+=(--build-arg "SOURCE_REVISION=$revision"); fi
      docker build "${arguments[@]}" --file "$root/${files[$index]}/Dockerfile" --tag "$image" "$root"
    done
    ;;
  *) echo 'E2E_SKIP_IMAGE_BUILD must be true or false' >&2; exit 64 ;;
esac

# Runtime fixtures receive no package credential. The operations image is built or
# pulled and scanned by test-start.py before any installation begins.
unset NODE_AUTH_TOKEN
if ((${#built_images[@]})); then bash "$root/scripts/scan-container-os.sh" "${built_images[@]}"; fi
bun run --cwd "$root" test:runtime-install
