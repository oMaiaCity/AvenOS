# Client downloads

Status: authoritative

**Client installers** builds Linux DEB/AppImage packages, an Apple Silicon macOS
DMG, and an ARM64 Android APK. It attaches them to one GitHub prerelease, with
`SHA256SUMS` and a `client-release.json` manifest recording the source commit,
API origin, identity origin, sizes, and signing status. GitHub's automatically
generated source archives are not installers.

## Current signing limits

These are test downloads, not a signed production distribution. Linux packages
are unsigned. The Mac app is ad-hoc signed and not notarized; Gatekeeper may
block it. Android uses the build host's debug key. Do not distribute these builds
as production installers or replace a production installation with them.

An Android build made with another debug key cannot update an existing installation
signed by the previous key. Uninstalling that application deletes its local data.
Direct Android passkey authentication also requires the exact signing fingerprint in
identity's `ANDROID_APP_CERT_SHA256_FINGERPRINTS`. Do not add disposable debug
fingerprints to production identity; use browser/device-code sign-in for these tests.
Renaming a passkey on the identity dashboard changes its account label, not its
password-manager entry or signing identity.

Durable Android signing and a Developer ID Application certificate plus Apple
notarization are prerequisites for a future stable download workflow. Existing
App Store distribution certificates are not interchangeable with Developer ID.
Keep App Store/TestFlight uploads on their separate path. See
[Apple's distribution guidance](https://developer.apple.com/documentation/xcode/creating-distribution-signed-code-for-the-mac/)
and [Tauri's Android signing requirements](https://v2.tauri.app/distribute/sign/android/).

## Publish a test download

1. Complete the [release gate](build-and-test.md#full-stack-e2e-release-gate) and
   promote the reviewed change to protected `next`, then to `prod` when appropriate.
2. Open **Actions → Client installers → Run workflow**. Choose `next` for
   `api.next.aven.ceo` or `prod` for `api.aven.ceo`. Both use `aven.id`.
3. Wait for both desktop jobs and Android. The publish job refuses a missing,
   stale, unexpected, or incorrectly formatted installer. It publishes only
   after all build jobs and package checks pass.
4. Open **Releases**, choose the new **test installers** prerelease, and download
   the package matching your operating system and architecture. Read its signing
   limitations before installing. Compare its SHA-256 with `SHA256SUMS`.

Use the releases listing for these prereleases; GitHub's `/releases/latest` link
selects stable releases and does not select a test prerelease. Existing source-only
releases remain unchanged. Intel Mac and iOS installers are not part of this workflow.

The only repository secret read by these builds is `PACKAGE_READ_TOKEN`, through
the shared temporary registry-authentication step. No deployment Environment or
server credentials are used. The publishing job alone receives `contents: write`.
Every build checks out the workflow's exact commit, uses frozen JavaScript dependencies
and locked Cargo dependencies, and selects deployment origins explicitly.

## Retry and verification

If building fails, rerun the failed jobs of the same workflow. No public release is
created until all installers exist. If uploading fails, the release remains a draft;
retry accepts only a draft naming the same source commit. It never replaces an
already published release. A new workflow run creates a new version.

Package verification checks Linux architecture and runtime contents, launches the
AppImage with a fresh profile to verify WebKit and the native sign-in screen, checks the Mac disk
image and application signature, and Android signature, alignment, minimum SDK,
ABI, package name, and version code. The normal full-stack E2E checks the Linux
client's account, document, invoice, and chat flows; it does not establish macOS or
Android runtime compatibility. Those platforms still need native smoke testing.

## Local packaging

On a prepared native build host, install frozen dependencies and run from the root:

```bash
CLIENT_RELEASE_VERSION=26.9.7-next.1 \
CLIENT_ANDROID_VERSION_CODE=30000001 \
AVEN_API_BASE_URL=https://api.next.aven.ceo \
bun scripts/build-client-release.ts linux-x64
```

Use `macos-arm64` on an Apple Silicon Mac. For `android-arm64`, use Linux x64 with
JDK 17, Android SDK 36, NDK `27.2.12479018`, and the `aarch64-linux-android` Rust target.
Set `JAVA_HOME`, `ANDROID_HOME`, and `NDK_HOME` to those installations. Output is
`dist/client-release/`. The build removes only its platform's previous bundle output
before collecting new files; it does not remove application data.

The version values above are local examples, not a published release identity. The
workflow supplies a unique version and monotonically increasing Android version code.
