#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

cd "$(dirname "${BASH_SOURCE[0]}")/.."
repo_root=$PWD
deb=(dist/client-release/*.deb)
image=(dist/client-release/*.AppImage)
test "${#deb[@]}" -eq 1
test "${#image[@]}" -eq 1
appimage="$repo_root/${image[0]}"
scratch=$(mktemp -d)
trap 'rm -rf "$scratch"' EXIT

test "$(dpkg-deb --field "${deb[0]}" Architecture)" = amd64
dpkg-deb --contents "${deb[0]}" > "$scratch/deb-contents.txt"
grep -q 'onnxruntime/libonnxruntime.so' "$scratch/deb-contents.txt"
chmod +x "$appimage"
(cd "$scratch" && "$appimage" --appimage-extract >/dev/null)
test -x "$scratch/squashfs-root/usr/bin/aven-os-app"
test -n "$(find "$scratch/squashfs-root" -name libonnxruntime.so -print -quit)"

# Desktop services must inherit this test's display instead of reusing the
# hosted runner's existing session bus. Keep the normal startup deadline.
TAURI_DRIVER_BIN="${TAURI_DRIVER_BIN:-$HOME/.cargo/bin/tauri-driver}" \
  xvfb-run --auto-servernum dbus-run-session -- bun scripts/smoke-client-linux.ts "$appimage"
