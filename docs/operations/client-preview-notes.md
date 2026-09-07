# Test installers

Download `.deb` or `.AppImage` for Linux x64, `.dmg` for Apple Silicon macOS, or
`-android-arm64-debug.apk` for Android ARM64. The source archives are not installers.
The attached `client-release.json` records the exact source and server environment;
both environments authenticate at `aven.id`. `SHA256SUMS` covers every installer.

These builds are for testing. The Mac app is ad-hoc signed, not notarized, and may
be blocked by Gatekeeper. Android uses a debug certificate; builds from another
runner may require uninstalling the previous app, which deletes its local data.
Use browser/device-code sign-in, not native Android passkey authentication with a
disposable debug certificate. Linux packages are unsigned.

These downloads are not App Store releases or a signed production distribution.
Intel Mac and iOS are not included. Do not overwrite a production installation.
