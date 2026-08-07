# EdgeEver iOS (Swift)

Native SwiftUI client for EdgeEver. This replaces the React Native / Expo iOS target.

**Design document:** [`docs/ios-swift-rewrite.md`](../../docs/ios-swift-rewrite.md)

## Status

UI/interaction is aligned with the Android RN app (`apps/mobile`):

- Login / session (Keychain with UserDefaults fallback) / device id
- GRDB local mirror + bootstrap / incremental sync
- SQLite outbox (create/update, create-absorbs-update, conflict/retry)
- Workspace chrome: notebook title picker, search (250ms debounce), filter chips, list options (sort/density/batch), FAB create, long-press multi-select, swipe pin/delete
- Memo detail + create/edit autosave, share link, revisions, soft delete
- EditorBundle (WKWebView body + toolbar)
- Image pick + materialize-for-upload (K24) + protected resource blob loading
- Settings: general / account / tags / API tokens / devices / users (owner) / about
- Share Extension (text/URL → App Group → new draft)
- Locale (system/zh/en) + theme + list density

Android remains Expo / React Native in `apps/mobile`. Do not retire EAS iOS builds until a shippable TestFlight build exists.

## Motion / animations

- **Native SwiftUI** springs for layout, search bar, filter chips, list content changes
- **[Pow](https://github.com/EmergeTools/Pow)** (Emerge Tools) for polished micro-interactions:
  - create button ping / jump on sync
  - filter chip ping when activated
  - selection / error haptics + shake
  - pin shine, list card transitions

Shared curves live in `EdgeEver/DesignSystem/Motion.swift` (card press timing matches Android Reanimated: 0.985 @ 100ms / release 160ms).

## Requirements

- Xcode 16+ (Xcode 27 beta OK for local dev)
- iOS 17+ deployment target
- [XcodeGen](https://github.com/yonaskolb/XcodeGen) to regenerate the project

```sh
brew install xcodegen
```

## Generate & open

```sh
cd apps/ios
xcodegen generate
open EdgeEver.xcodeproj
```

## Tests

```sh
# Unit + live API tests (live tests skip if local server is down)
xcodebuild test \
  -project EdgeEver.xcodeproj \
  -scheme EdgeEver \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro'
```

Live API tests login to `http://127.0.0.1:8787` using `EDGE_EVER_AUTH_PASSWORD` or monorepo `.env.wrangler.generated.local`.

## Simulator auto-login (QA)

With local `bun run dev` running:

```sh
xcrun simctl launch booted org.edgeever.mobile \
  -EdgeEverAutoLoginURL "http://127.0.0.1:8787" \
  -EdgeEverAutoLoginUser admin \
  -EdgeEverAutoLoginPassword "$EDGE_EVER_AUTH_PASSWORD"
```

## Versioning

| Field | File | Notes |
| --- | --- | --- |
| `MARKETING_VERSION` | `Config/Version.xcconfig` | Align with monorepo release `X.Y.Z` on store submissions |
| `CURRENT_PROJECT_VERSION` | `Config/Version.xcconfig` | Monotonic build number for every TestFlight / App Store upload |

## Regenerating the Xcode project

Edit `project.yml`, then:

```sh
xcodegen generate
```
