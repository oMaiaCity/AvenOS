# Android APK

AvenOS targets Android 9 (API 28) and newer. This floor is required by the native
passkey flow and by the AAudio backend used for native voice input/output.

## Prerequisites

Install Bun, Rust, a full JDK 17, and Android Studio. In Android Studio's SDK
Manager install Android SDK Platform 36, Android SDK Build-Tools, Platform-Tools,
and an Android NDK. Set `ANDROID_HOME` if the SDK is not at `~/Android/Sdk`.
The build script discovers an installed NDK and ensures it uses a JDK containing
`javac` rather than a JRE-only installation.

The generated Android Studio project is checked in at
`app/src-tauri/gen/android` because it contains application permissions, signing,
and the API 28 floor. Do not rerun `tauri android init` unless intentionally
regenerating and reviewing that project.

## Build and run

From the repository root:

```sh
bun install --frozen-lockfile
bun run build:app:android
```

The default is an ARM64, debug-signed APK suitable for installation and local QA.
It is copied to `dist/android/`. Use an attached device or running emulator for
development:

```sh
bun run dev:app:android
ANDROID_DEVICE=<adb-serial> bun run dev:app:android
```

Additional build options are passed to the script:

```sh
bun run build:app:android -- --release
bun run build:app:android -- --release --aab
bun run build:app:android -- --target=x86_64
```

## Release signing

Generate or obtain the upload keystore as described in the
[Digital Asset Links operations guide](android-digital-asset-links.md), then create the ignored file
`app/src-tauri/gen/android/keystore.properties`:

```properties
storeFile=/secure/path/upload-keystore.jks
storePassword=change-me
keyAlias=avenos-upload
keyPassword=change-me
```

`storeFile` may be absolute; a relative path is resolved from
`app/src-tauri/gen/android`. A release build without this file is deliberately
left unsigned. Keep the keystore and passwords outside Git and in the release
secret store.

Obtain the signing certificate fingerprint for every certificate that may sign an
installed production build (direct distribution and Google Play App Signing as
applicable):

```sh
keytool -list -v -keystore /secure/path/upload-keystore.jks -alias avenos-upload
```

Set the Aven API environment variable to the comma-separated SHA-256 values:

```text
ANDROID_APP_CERT_SHA256_FINGERPRINTS=AA:BB:...:FF,11:22:...:00
```

Never add a debug certificate to a production identity environment. If native
passkeys must be tested from a debug build, associate that certificate only with a
non-production identity deployment.

See the [Digital Asset Links operations guide](android-digital-asset-links.md) for
the complete GitHub Actions setup, published JSON contract, verification commands,
and safe certificate-rotation procedure.

After deploying the API, verify that
`https://aven.id/.well-known/assetlinks.json` returns HTTP 200, no
redirect, `application/json`, package `ceo.aven.os`, and each current signing
fingerprint. Android Credential Manager uses this Digital Asset Link to let the
native app make passkey assertions for `aven.id`. Better Auth also
trusts the corresponding `android:apk-key-hash:...` WebAuthn origins.

## Android platform integration

- Passkeys use AndroidX Credential Manager and Google Play Services Auth. The RP
  ID is pinned to `aven.id`; the browser approval flow remains the
  fallback when Credential Manager cannot provide a credential.
- `INTERNET`, `RECORD_AUDIO`, and `MODIFY_AUDIO_SETTINGS` are declared. Voice
  preparation requests Android microphone permission at runtime.
- App backup is disabled so local identity/session material is not migrated by
  Android backup. Tauri's FileProvider remains scoped and non-exported.
- Release cleartext traffic is disabled; debug builds permit it for local
  development. Production identity URLs must use HTTPS.
- Launcher icons and adaptive foreground/background assets are included for all
  generated density buckets.

Before distributing, smoke-test on at least one physical Android 9 device and a
current Android device: first launch, passkey selection and cancellation, browser
fallback, microphone allow/deny/retry, voice input/output, file selection, system
back, rotation, offline/reconnect, and large local-model storage pressure. Also
verify the final artifact with the SDK's `apksigner verify --verbose` and test the
Play-signed build separately because its signing fingerprint differs from the
upload certificate.

## Continuous integration and releases

`.github/workflows/android-ci.yml` builds, verifies, and retains an ARM64
debug APK for Android-related pull requests and pushes to `main`. It is isolated
from the existing platform jobs and uses the same root build command as local
development.

The old combined `release-next` workflow was removed with the monolith. A future
application-release workflow may attach a signed ARM64 APK to a GitHub release,
but it must remain separate from the identity/platform service deployment.
Configure the following in the protected release environment when that workflow
is introduced:

- Optional variable `ANDROID_PLAY_APP_CERT_SHA256_FINGERPRINTS`, containing the
  Google Play App Signing certificate when Play distribution is enabled. CI
  derives the direct-release certificate from the upload keystore.
- Secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`.

Release CI must derive the upload certificate fingerprint from the protected
keystore, construct the mandatory Digital Asset Links allowlist for
`aven-identity`, and verify the exact public association before building the
APK. Until that gate exists, signed Android distribution is a documented manual
operation, not part of `platform-deploy`.
