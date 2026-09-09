#!/usr/bin/env bash
set -euo pipefail

sudo apt-get update
sudo apt-get install --yes build-essential libwebkit2gtk-4.1-dev libsoup-3.0-dev libasound2-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf libfuse2 libxdo-dev webkit2gtk-driver xvfb dbus
cargo install tauri-driver --version 2.0.6 --locked
