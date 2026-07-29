# Release Guide

EdgeEver releases are prepared with a single local command. The command validates
the repository, creates the tracking Issue, updates versions, prepares and audits
native assets in a Draft Release, publishes the Release, and installs the final
macOS DMG.

This process does not perform mobile store delivery. Google Play and App Store
Connect delivery is a separate, explicit operation documented in
[Mobile Store Delivery](store-delivery.md).

## Prerequisites

- Run the command on macOS from a clean `main` branch that exactly matches
  `origin/main`.
- Authenticate GitHub CLI with access to `tianma-if/edgeever`.
- Commit all user-facing changes before starting the release.
- Ensure every English change bullet has a corresponding Chinese bullet.

## Command

```bash
bun run release -- \
  --issue-title "Improve the release workflow" \
  --label enhancement \
  --change-en "Run required release checks in parallel." \
  --change-zh "并行执行发布所需检查。"
```

Repeat `--change-en` and `--change-zh` in matching pairs when a Release contains
multiple changes. Repeat `--label` when the tracking Issue needs multiple labels.

Use `--dry-run` to inspect the native rebuild plan and generated bilingual notes
without changing local or GitHub state. `--skip-install` skips the post-release
DMG installation and is intended for exceptional or non-macOS runs; normal
maintainer releases should install and launch the published application.

## Automated Flow

1. Verify `main`, the working tree, GitHub authentication, the latest formal
   Release, and the local/remote commit relationship.
2. Run Web type checking, mobile type checking, the Web production build, and
   release-planning tests concurrently.
3. Use `scripts/plan-native-release.mjs` to determine whether desktop and Android
   assets must be rebuilt or can be reused. Only affected native versions are
   updated.
4. Create a bilingual tracking Issue, commit the version changes to `main`, push,
   and create a Draft Release with bilingual notes.
5. Dispatch the desktop and Android asset workflows concurrently, wait for both,
   and verify filenames, sizes, and checksums before publication.
6. Publish the Release and wait only for the required desktop and Android
   post-publication audits.
7. Print the Demo deployment run or workflow URL. Demo deployment continues in
   the background and does not delay release completion.
8. Link and close the tracking Issue, download the final DMG, verify its checksum
   and signature, replace `/Applications/EdgeEver.app`, and launch it.

No Release step builds a Play AAB, starts an EAS iOS build, or uploads to a
mobile store.

The release version commit includes the standard GitHub Actions skip marker.
Draft asset workflows are dispatched explicitly, so this avoids an unnecessary
push-triggered Android build without skipping required release builds.

## Failure and Resume Behavior

- A validation or Draft asset failure leaves the Release unpublished.
- If the process stops after the version commit and Draft creation, rerun the
  same command. A Draft whose version and target match the current `main` commit
  is resumed instead of creating another Issue, commit, or Release.
- A failed post-publication native audit attempts to return the Release to Draft
  and leaves the Issue open for correction.
- A failed application replacement restores the previous app from the macOS
  Trash backup when possible.
- Demo deployment status is intentionally independent of Release completion;
  use the printed Actions URL to inspect or retry it.
