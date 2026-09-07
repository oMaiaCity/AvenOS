#!/usr/bin/env bash
set -euo pipefail

host_kind=${1:-}
operation=${2:-ps}
if [[ "$host_kind" != identity && "$host_kind" != platform ]] ||
   [[ "$operation" != ps && "$operation" != logs && "$operation" != status && "$operation" != check ]]; then
  echo "usage: $0 identity|platform ps|logs|status|check" >&2
  exit 64
fi
: "${PULUMI_STACK:?PULUMI_STACK is required}"
: "${PULUMI_BACKEND:?PULUMI_BACKEND is required}"

root=$(cd -- "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
source "$root/deploy/release/ssh-staging.sh"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT
pulumi login "$PULUMI_BACKEND" >/dev/null
pulumi stack select "$PULUMI_STACK" --cwd "$root/infrastructure/platform" >/dev/null
output() { pulumi stack output "$1" --show-secrets --cwd "$root/infrastructure/platform"; }

ip=$(output "${host_kind}Ipv4Address")
host_key=$(output "${host_kind}HostPublicKey")
private_key=$(output "${host_kind}ObservePrivateKey")
prepare_ssh_staging "$scratch"
printf '%s\n' "$private_key" > "$scratch/key"
printf '%s %s\n' "$ip" "$host_key" > "$scratch/known_hosts"
exec ssh \
  -i "$scratch/key" \
  -o IdentitiesOnly=yes \
  -o BatchMode=yes \
  -o UserKnownHostsFile="$scratch/known_hosts" \
  -o StrictHostKeyChecking=yes \
  "aven-observe@$ip" "sudo /usr/local/sbin/aven-observe '$host_kind' '$operation'"
