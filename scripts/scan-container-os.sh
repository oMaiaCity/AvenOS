#!/usr/bin/env bash
set -euo pipefail
umask 077
if [[ $# -eq 0 ]]; then echo 'Provide one or more exact image references to scan.' >&2; exit 64; fi
if [[ "$(uname -s):$(uname -m)" != Linux:x86_64 ]]; then
  echo 'The production-image audit runs on Linux x86_64, like the release builder.' >&2; exit 64
fi
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
curl --fail --silent --show-error --location --max-time 120 \
  https://github.com/aquasecurity/trivy/releases/download/v0.74.0/trivy_0.74.0_Linux-64bit.tar.gz \
  --output "$temporary/tool.tar.gz"
actual=$(sha256sum "$temporary/tool.tar.gz" | cut -d' ' -f1)
[[ "$actual" == 2ae6fe3ee734b7fdf11335663e18c75ea12dccc76062f09f164a3b0f8be4371a ]] || {
  echo 'Container scanner checksum mismatch.' >&2; exit 1
}
tar -xzf "$temporary/tool.tar.gz" -C "$temporary" trivy
# Bun/Rust and secret gates own their separate scopes. Unfixed findings remain
# visible; only fixable high/critical OS findings block the release.
status=0
for image in "$@"; do
  [[ "$image" != -* && "$image" != *$'\n'* ]] || { echo 'Invalid image reference.' >&2; exit 64; }
  "$temporary/trivy" image --scanners vuln --pkg-types os --timeout 5m \
    --format json --output "$temporary/report.json" "$image" || exit 1
  jq -r --arg image "$image" '
    [.Results[]?.Vulnerabilities[]? | select(.Severity == "HIGH" or .Severity == "CRITICAL")] as $v |
    "\($image): \($v|length) high/critical OS findings (\([$v[]|select((.FixedVersion//"")!="")]|length) fixable)",
    ($v[] | "  \(.VulnerabilityID) \(.PkgName) \(.InstalledVersion) → \(.FixedVersion // "upstream fix unavailable")")
  ' "$temporary/report.json"
  if ! jq -e '[.Results[]?.Vulnerabilities[]? | select((.Severity == "HIGH" or .Severity == "CRITICAL") and (.FixedVersion//"")!="")] | length == 0' "$temporary/report.json" >/dev/null; then status=1; fi
done
exit "$status"
