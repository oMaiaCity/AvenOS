#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
platform=${1:-linux}
case "$platform" in
  linux|mac) ;;
  *) echo "usage: bun run local:app -- [linux|mac]" >&2; exit 2 ;;
esac

curl --fail --silent http://127.0.0.1:13100/api/health/ready >/dev/null || {
  echo "The local identity service is not ready. Run: bun run local:up" >&2
  exit 1
}
curl --fail --silent http://127.0.0.1:13000/health/live >/dev/null || {
  echo "The local facade is not ready. Run: bun run local:up" >&2
  exit 1
}

export AVEN_IDENTITY_BASE_URL=http://localhost:13100
export AVEN_PASSKEY_ORIGIN=http://localhost:13100
export AVEN_PASSKEY_RP_ID=localhost
export AVEN_API_BASE_URL=http://localhost:13000

cd "$root"
exec bun run "dev:app:$platform"
