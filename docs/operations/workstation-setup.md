# Workstation setup

Status: authoritative

Prepare a Linux or macOS workstation once, then use the same repository commands on
both platforms. The local server stack needs Docker; the Rust desktop client also
needs the native Tauri toolchain for the host operating system.

## Shared requirements

Install:

- Git;
- Bun 1.3.13;
- Rust through `rustup` (the repository pins Rust 1.93.1);
- Docker Engine with the Compose v2 plugin, or Docker Desktop;
- OpenSSL and `curl`; and
- a GitHub Packages token with `read:packages` for `@myavenceo` packages.

Keep the package token outside the repository. Either export it as
`NODE_AUTH_TOKEN` for the current shell or configure it in the user-level
`~/.npmrc`. The tracked `.npmrc` contains only the registry mapping. Docker builds
receive the token through a BuildKit secret and do not copy `.npmrc` into an image.

Verify the shared tools:

```sh
git --version
bun --version
rustc --version
docker version
docker compose version
openssl version
```

Then install the workspace from the repository root:

```sh
bun install --frozen-lockfile
```

## macOS

Install Xcode Command Line Tools and Docker Desktop:

```sh
xcode-select --install
```

The macOS desktop client uses WKWebView and the system passkey APIs. Full Xcode is
required only for iOS development and App Store builds; the desktop development path
needs the command-line tools.

Verify the native desktop build with:

```sh
bun run check
cargo check --locked --manifest-path app/src-tauri/Cargo.toml
```

The complete Linux WebDriver E2E release gate is not supported on macOS. Run it in
GitHub Actions or on a prepared Linux workstation.

## Linux

The Tauri client needs WebKitGTK, GTK, DBus, ALSA, and related development headers.
On Ubuntu or Debian:

```sh
sudo apt update
sudo apt install -y \
  pkg-config \
  libasound2-dev \
  libdbus-1-dev \
  libgtk-3-dev \
  librsvg2-dev \
  libsoup-3.0-dev \
  libwebkit2gtk-4.1-dev \
  libayatana-appindicator3-dev \
  build-essential \
  curl \
  wget \
  file \
  libssl-dev
```

On Fedora:

```sh
sudo dnf install \
  pkgconf-pkg-config \
  alsa-lib-devel \
  dbus-devel \
  gtk3-devel \
  librsvg2-devel \
  libsoup3-devel \
  webkit2gtk4.1-devel \
  libappindicator-gtk3-devel \
  openssl-devel \
  curl \
  wget \
  file \
  gcc-c++
```

For the complete E2E release gate, also install `webkit2gtk-driver`, Xvfb, and the
Tauri WebDriver bridge:

```sh
sudo apt install -y webkit2gtk-driver xvfb libxdo-dev patchelf
cargo install tauri-driver --locked
```

The release gate currently uses Linux-specific tools such as Xvfb and `getent`.

## Package authentication

Local service images require the package token at build time. Prefer a temporary shell
export sourced from a password manager:

```sh
export NODE_AUTH_TOKEN='<GitHub Packages read token>'
```

Do not add the token to the repository `.npmrc`, an `.env` file, shell history, Docker
build arguments, or documentation.

## Ready check

The workstation is ready when these commands succeed:

```sh
bun install --frozen-lockfile
bun run check
docker compose version
```

Continue with [Build and test](build-and-test.md) or start the
[local full stack](local-stack.md).
