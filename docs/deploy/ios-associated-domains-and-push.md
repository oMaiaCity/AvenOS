# iOS: Associated Domains + Push Notifications (after enabling on App ID)

You enabled **`Associated Domains`** and **`Push Notifications`** on App ID **`ceo.aven.os`**. The repo now mirrors that in Xcode entitlements and Info merge.

## 1. Regenerate your **App Store distribution** provisioning profile

After changing App ID capabilities, Apple expects a **fresh** profile:

1. [Profiles](https://developer.apple.com/account/resources/profiles/list) → create or edit your **App Store Connect** / **distribution** profile for **`ceo.aven.os`**.
2. Download and use it locally / in CI (`tauri ios build` / Xcode archiving).

Stale profiles are a common signing error after toggling capabilities.

## 2. Associated domains (source of truth in repo)

Committed template (not under `gen/apple`):  
[`app/src-tauri/ios-template/aven-os-app_iOS.entitlements`](../../app/src-tauri/ios-template/aven-os-app_iOS.entitlements)

Because **`gen/apple/` is gitignored**, after **`tauri ios init`** copy it into the Xcode tree:

```bash
cp app/src-tauri/ios-template/aven-os-app_iOS.entitlements \
  app/src-tauri/gen/apple/aven-os-app_iOS/aven-os-app_iOS.entitlements
```

### The entitlements must be applied at signing time — the script does this

`tauri ios build --archive-only` (manual CI signing) leaves the archived `.app` **unsigned**, so
`xcodebuild -exportArchive` signs it from scratch with only what the provisioning profile
implies (`application-identifier`, `team-identifier`, `beta-reports-active`, `get-task-allow`).
The entitlements file is silently ignored — the shipped iOS binary had **no**
`com.apple.developer.associated-domains`, which made native passkeys fail with
"Application with identifier … is not associated with domain aven.id"
(while the macOS pipeline, which codesigns with `--entitlements` explicitly, worked).

`scripts/tauri-ios-asc.ts` therefore codesigns the archived `.app` with the full entitlements
(template + `application-identifier`/`team-identifier`, `$(AppIdentifierPrefix)` resolved) before
export, and **fails the release** if the exported `.ipa` does not carry
`com.apple.developer.associated-domains` / `webcredentials:aven.id` / `aps-environment`.
To check a build by hand:

```bash
unzip -q avenOS.ipa -d /tmp/ipa && codesign -d --entitlements - --xml /tmp/ipa/Payload/avenOS.app
```

Defaults:

- **`applinks:aven.ceo`** — Universal Links under `https://aven.ceo/…`
- **`webcredentials:aven.id`** — the only passkey relying-party domain

Ship the appropriate association document over HTTPS on both declared hosts:

- `https://aven.id/.well-known/apple-app-site-association` is served by
  `aven-identity` and authorizes `2P6VCHVJWB.ceo.aven.os` for web credentials;
- `https://aven.ceo/.well-known/apple-app-site-association` belongs in the
  static public-site artifact when Universal Links are enabled.

If Universal Links instead use a dedicated host (for example **`link.aven.ceo`**), edit the plist and host AASA on that subdomain instead.

### AASA sanity check

Serve JSON at `apple-app-site-association` **without** `.json` suffix, correct `application/json`/`application/pkcs7-mime`, and paths that reference team + bundle (`ceo.aven.os`). Use Apple’s **Universal Links validator** tooling / documentation when iterating.

## 3. Push entitlements (`aps-environment`)

Same entitlements file sets **`aps-environment` → `production`**, aligned with App Store Connect / distribution signing.

If local **development** provisioning fails with an APNS-environment mismatch:

- Temporary: change the value to **`development`** for device debug builds signed with development profiles only, **or**
- Prefer Xcode Signing & Capabilities to manage entitlement variants once you consolidate manual overrides.

Production TestFlight uploads should ultimately use **`production`** with App Store provisioning.

## 4. Background remote notifications

Merged via [`app/src-tauri/Info.ios.plist`](../../app/src-tauri/Info.ios.plist): **`UIBackgroundModes`** includes **`remote-notification`**.

Rust/Tauri/Jazz still needs to **call `UIApplication.registerForRemoteNotifications`**, persist the device token to your backend/APNs helpers, etc.—this markdown only satisfies **capability + plist plumbing**. Wire app code when implementing push delivery/handler logic.

### App Store Connect

Create an **APNs key** (**Keys** tab) if you authenticate push through Apple’s endpoints, attach it to the app record where required, and keep tokens out of Git.

---

**Regeneration:** Running `tauri ios init` overwrites Xcode output under `gen/apple/`; re‑run the `cp … ios-template …` step above afterward.
