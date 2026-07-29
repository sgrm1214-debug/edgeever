# Mobile Store Delivery

GitHub Releases and mobile store delivery are separate operations:

- `bun run release` creates and audits the GitHub Release. It never contacts
  Google Play or App Store Connect.
- `bun run publish:stores` dispatches a manual store-delivery workflow for one
  existing formal Release tag.
- Store publication remains a separate decision. Google Play production uploads
  remain Drafts, and iOS uploads stop at App Store Connect/TestFlight.

## Safety Model

The workflow checks out the immutable Release tag rather than `main`. Before any
store build starts, it verifies that:

- the tag belongs to a formal, non-prerelease GitHub Release;
- the Release target and Git tag resolve to the same commit;
- the audited range since the previous formal Release contains mobile runtime
  changes;
- root and mobile app versions both match the Release tag;
- Android `versionCode` increased;
- a Google Play production request repeats the exact Release tag as confirmation.

A Release that reused the previous mobile binary is intentionally rejected. It
does not represent a new store binary and should not be uploaded again.

## Prerequisites

Configure these GitHub repository secrets:

- `EXPO_TOKEN`
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

Upload the Google Play service-account key to the Android application's EAS
Submit credentials. Configure the iOS distribution credentials and App Store
Connect API key in EAS. Credentials and private keys must remain outside the
repository.

Create these GitHub Environments:

- `store-delivery` for Internal/Alpha/Beta and TestFlight delivery.
- `store-production` for Google Play production delivery. Configure required
  reviewers on this environment.

EAS Submit requires the application to exist in each store and Google Play API
submission requires the service account to have access to the application.
Follow the official
[EAS Android submission guide](https://docs.expo.dev/submit/android/) and
[EAS Submit configuration reference](https://docs.expo.dev/submit/eas-json/).

## Commands

Deliver both platforms to Google Play Internal and App Store Connect/TestFlight:

```sh
bun run publish:stores -- --release v1.7.0
```

Deliver only Android to a closed testing track:

```sh
bun run publish:stores -- \
  --release v1.7.0 \
  --platform android \
  --android-track beta
```

Prepare a Google Play production Draft:

```sh
bun run publish:stores -- \
  --release v1.7.0 \
  --platform android \
  --android-track production \
  --confirm-production v1.7.0
```

Use `--dry-run` to print the GitHub workflow dispatch without starting it.

## Platform Behavior

### Google Play

The self-hosted release runner builds a signed AAB from the selected tag,
verifies its signature and R8 mapping, preserves both as GitHub Actions
artifacts, and uploads the AAB through EAS Submit.

Internal, Alpha, and Beta profiles use a completed release on the selected
testing track. Production uses `releaseStatus: draft` and
`changesNotSentForReview: true`; completing review and rollout remains a manual
Google Play Console action.

### App Store Connect

EAS Build creates the signed iOS archive from the selected tag and increments
the remote iOS build number. EAS Submit uploads that exact build to App Store
Connect, where it becomes available to TestFlight after Apple finishes
processing it. The workflow does not select the build for an App Store version
or submit it for App Review.
