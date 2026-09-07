#!/usr/bin/env bash
set -euo pipefail

host_kind=${1:-}
local_port=${2:-55432}
if [[ "$host_kind" != identity && "$host_kind" != platform ]]; then
  echo "usage: $0 identity|platform [local-port]" >&2
  exit 64
fi
[[ "$local_port" =~ ^[0-9]+$ ]] && ((local_port >= 1024 && local_port <= 65535)) || {
  echo "local port must be 1024..65535" >&2
  exit 64
}
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
private_key=$(output "${host_kind}TunnelPrivateKey")
prepare_ssh_staging "$scratch"
printf '%s\n' "$private_key" > "$scratch/key"
printf '%s %s\n' "$ip" "$host_key" > "$scratch/known_hosts"

echo "Opening read-only access rail on 127.0.0.1:$local_port; database credentials remain separate."
exec ssh -N -T \
  -i "$scratch/key" \
  -o IdentitiesOnly=yes \
  -o BatchMode=yes \
  -o ExitOnForwardFailure=yes \
  -o UserKnownHostsFile="$scratch/known_hosts" \
  -o StrictHostKeyChecking=yes \
  -L "127.0.0.1:$local_port:127.0.0.1:5432" \
  "aven-tunnel@$ip"
