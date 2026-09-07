#!/usr/bin/env bash
set -euo pipefail
umask 077
root=$(cd -- "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
temporary=$(mktemp -d)
trap 'rm -rf "$temporary"' EXIT
case "$(uname -s):$(uname -m)" in
  Linux:x86_64) platform=linux_x64; digest=551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb ;;
  Linux:aarch64) platform=linux_arm64; digest=e4a487ee7ccd7d3a7f7ec08657610aa3606637dab924210b3aee62570fb4b080 ;;
  Darwin:arm64) platform=darwin_arm64; digest=b40ab0ae55c505963e365f271a8d3846efbc170aa17f2607f13df610a9aeb6a5 ;;
  Darwin:x86_64) platform=darwin_x64; digest=dfe101a4db2255fc85120ac7f3d25e4342c3c20cf749f2c20a18081af1952709 ;;
  *) echo 'Unsupported secret-scanner host.' >&2; exit 64 ;;
esac
# Pinned upstream release plus a committed digest; no remote installer is executed.
curl --fail --silent --show-error --location --max-time 60 \
  "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_${platform}.tar.gz" \
  --output "$temporary/tool.tar.gz"
actual=$(shasum -a 256 "$temporary/tool.tar.gz" | cut -d' ' -f1)
[[ "$actual" == "$digest" ]] || { echo 'Secret-scanner checksum mismatch.' >&2; exit 1; }
tar -xzf "$temporary/tool.tar.gz" -C "$temporary" gitleaks
scanner="$temporary/gitleaks"
canary="ghp_$(openssl rand -hex 18)"
if printf '//npm.pkg.github.com/:_authToken=%s\n' "$canary" | "$scanner" stdin --config "$root/.gitleaks.toml" --redact=100 --no-banner --report-format json --report-path "$temporary/self-test.json" >/dev/null 2>&1; then
  echo 'Secret scanner failed its synthetic canary self-test.' >&2; exit 1
else
  result=$?
  [[ "$result" == 1 ]] || { echo 'Secret scanner could not run its self-test.' >&2; exit 1; }
fi
CANARY_REPORT="$temporary/self-test.json" bun -e 'const findings=await Bun.file(process.env.CANARY_REPORT).json();for(const rule of ["github-pat","npm-registry-token"])if(!findings.some(f=>f.RuleID===rule))throw new Error("Secret scanner missed a synthetic credential category.")'
unset canary
mkdir "$temporary/source"
cd "$root"
git ls-files --cached --others --exclude-standard -z | while IFS= read -r -d '' source_file; do
  if [[ -f "$source_file" || -L "$source_file" ]]; then printf '%s\0' "$source_file"; fi
done | \
  tar --null --no-recursion -T - -cf - | tar -xf - -C "$temporary/source"
result=0
"$scanner" dir "$temporary/source" --config "$root/.gitleaks.toml" --redact=100 --no-banner --report-format json --report-path "$temporary/source-findings.json" || result=$?
SCAN_REPORT="$temporary/source-findings.json" bun -e 'for(const f of await Bun.file(process.env.SCAN_REPORT).json())console.log(JSON.stringify({file:f.File,line:f.StartLine,rule:f.RuleID,fingerprint:f.Fingerprint}))'
# A reviewed baseline is scoped to individual historical findings, never whole paths.
"$scanner" git "$root" --config "$root/.gitleaks.toml" --gitleaks-ignore-path "$root/.gitleaksignore" --redact=100 --no-banner --log-opts='--all' --report-format json --report-path "$temporary/history-findings.json" || result=$?
SCAN_REPORT="$temporary/history-findings.json" bun -e 'for(const f of await Bun.file(process.env.SCAN_REPORT).json())console.log(JSON.stringify({file:f.File,line:f.StartLine,rule:f.RuleID,fingerprint:f.Fingerprint,commit:f.Commit}))'
exit "$result"
