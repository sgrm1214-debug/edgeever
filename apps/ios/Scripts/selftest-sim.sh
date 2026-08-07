#!/usr/bin/env bash
# Simulator smoke self-test for EdgeEver iOS (agent / CI local loop).
# Usage: from apps/ios: ./Scripts/selftest-sim.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DEST="${SIM_DEST:-}"
if [[ -z "$DEST" ]]; then
  DEST="$(xcrun simctl list devices booted | grep -E 'iPhone' | head -1 | sed -E 's/.*\(([A-F0-9-]+)\).*/\1/' || true)"
fi
if [[ -z "$DEST" ]]; then
  echo "No booted simulator. Boot one first." >&2
  exit 1
fi

echo "== unit tests on $DEST =="
xcodegen generate
xcodebuild -project EdgeEver.xcodeproj -scheme EdgeEver \
  -destination "platform=iOS Simulator,id=$DEST" \
  -only-testing:EdgeEverTests/EditorBundleTests \
  -only-testing:EdgeEverTests/ChromeParityTests \
  -only-testing:EdgeEverTests/MemoCreateCommitTests \
  test

APP="$(find ~/Library/Developer/Xcode/DerivedData -path '*/Build/Products/Debug-iphonesimulator/EdgeEver.app' 2>/dev/null | head -1)"
if [[ -z "$APP" || ! -d "$APP" ]]; then
  echo "EdgeEver.app not found after test build" >&2
  exit 1
fi

HTML="$APP/index.html"
if [[ ! -f "$HTML" ]]; then
  HTML="$(find "$APP" -name index.html | head -1 || true)"
fi
SIZE=0
[[ -f "$HTML" ]] && SIZE=$(wc -c <"$HTML" | tr -d ' ')
echo "packaged editor html: ${HTML:-MISSING} size=$SIZE"
if [[ "$SIZE" -lt 100000 ]]; then
  echo "FAIL: TipTap index.html missing or too small (would use plain-text fallback)" >&2
  exit 1
fi

echo "OK selftest-sim unit+package checks passed"
echo "Tip: full UI path is driven by the agent with simctl+cliclick screenshots."
