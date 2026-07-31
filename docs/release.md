# Release Guide

EdgeEver releases are prepared with a single local command. The command validates
the repository, creates the tracking Issue, updates versions, prepares and audits
native assets in a Draft Release, publishes the Release, and installs the final
macOS DMG matching the maintainer's Mac architecture.

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
  --bump minor \
  --issue-title "Improve the release workflow" \
  --label enhancement \
  --change-en "Run required release checks in parallel." \
  --change-zh "并行执行发布所需检查。"
```

Repeat `--change-en` and `--change-zh` in matching pairs when a Release contains
multiple changes. Repeat `--label` when the tracking Issue needs multiple labels.
Public Release notes contain only user-visible changes, their impact, and any
required upgrade or migration guidance. Type checks, build commands, signing,
notarization, and asset-audit details remain in GitHub Actions and the linked
tracking Issue instead of being repeated in the public notes.

`--bump` is required and must be selected from the user and compatibility impact
of the complete Release:

- `patch` fixes bugs or makes small security, performance, or visual improvements
  without adding a new user workflow.
- `minor` adds a backward-compatible feature or a coherent group of new
  capabilities.
- `major` introduces an incompatible data format, sync protocol, public API, or
  deployment change. Its release notes must describe the compatibility impact
  and migration path.

The command calculates the next stable version and resets lower components:
`1.6.52 + patch` becomes `1.6.53`, `+ minor` becomes `1.7.0`, and `+ major`
becomes `2.0.0`. Commit prefixes may inform the choice, but do not select it
automatically because code scope and product impact are not equivalent.

Use `--dry-run` to inspect the native rebuild plan and generated bilingual notes
without changing local or GitHub state. `--skip-install` skips the post-release
DMG installation and is intended for exceptional or non-macOS runs; normal
maintainer releases should install and launch the published application.

## Release Cadence and Platform Versions

A formal Release represents a coherent stable product batch, not an individual
commit or deployment. Related fixes should normally be grouped into one Patch
Release. A separate Patch is appropriate for urgent crashes, data-loss risks, or
security fixes. Builds between Releases use the Git commit/build label and do not
consume stable version numbers.

The root version and GitHub tag identify the overall product Release. Native
marketing versions change only when that native runtime is rebuilt. Android
`versionCode` and iOS build numbers remain independent, monotonically increasing
store build identifiers.

Stable tags and their GitHub Release titles both use `vX.Y.Z`.

When verified DMGs or an APK are reused, their original filenames and native
versions remain unchanged. Every formal Release contains separate macOS arm64
and x64 DMGs plus architecture-specific updater ZIPs. Desktop and Android update
checks derive the latest applicable version from their corresponding Release
asset instead of comparing against the overall GitHub tag. This prevents an
unchanged native client from repeatedly offering an update for a Web-only or
API-only Release.

## Automated Flow

1. Verify `main`, the working tree, GitHub authentication, the latest formal
   Release, and the local/remote commit relationship.
2. Run Web type checking, mobile type checking, the Web production build, and
   release-planning tests concurrently.
3. Calculate the explicit `patch`, `minor`, or `major` version bump, then use
   `scripts/plan-native-release.mjs` to determine whether desktop and Android
   assets must be rebuilt or can be reused. Only affected native versions are
   updated.
4. Create a bilingual tracking Issue, commit the version changes to `main`, push,
   and create a Draft Release with bilingual notes.
5. Dispatch the desktop and Android asset workflows concurrently. The desktop
   workflow builds arm64 and x64 packages on matching native runners, then
   combines their update metadata. Verify filenames, sizes, and checksums before
   publication.
6. Publish the Release and wait only for the required desktop and Android
   post-publication audits.
7. Print the Demo deployment run or workflow URL. Demo deployment continues in
   the background and does not delay release completion.
8. Link and close the tracking Issue, download the final DMG matching the
   maintainer Mac's architecture, verify its checksum and signature, replace
   `/Applications/EdgeEver.app`, and launch it.

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
