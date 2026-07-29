import { describe, expect, test } from "bun:test";
import { nativeReleaseAssetsReady } from "./check-native-release-assets.mjs";

describe("native release asset readiness", () => {
  test("accepts one reused Android APK but requires the current name after a rebuild", () => {
    const reused = ["edgeever-android-v1.6.30-arm64-v8a.apk"];
    expect(
      nativeReleaseAssetsReady({
        platform: "mobile",
        rebuild: false,
        currentTag: "v1.6.35",
        assetNames: reused,
      }),
    ).toBe(true);
    expect(
      nativeReleaseAssetsReady({
        platform: "mobile",
        rebuild: true,
        currentTag: "v1.6.35",
        assetNames: reused,
      }),
    ).toBe(false);
  });

  test("rejects duplicate Android APKs", () => {
    expect(
      nativeReleaseAssetsReady({
        platform: "mobile",
        rebuild: false,
        currentTag: "v1.6.35",
        assetNames: [
          "edgeever-android-v1.6.30-arm64-v8a.apk",
          "edgeever-android-v1.6.35-arm64-v8a.apk",
        ],
      }),
    ).toBe(false);
  });

  test("accepts a matching reused desktop asset set", () => {
    expect(
      nativeReleaseAssetsReady({
        platform: "desktop",
        rebuild: false,
        currentTag: "v1.6.35",
        desktopVersion: "1.6.35",
        assetNames: [
          "EdgeEver-1.6.33-mac-arm64.dmg",
          "EdgeEver-1.6.33-mac-arm64.dmg.blockmap",
          "latest-mac.yml",
        ],
      }),
    ).toBe(true);
  });

  test("requires current, complete desktop assets after a rebuild", () => {
    const current = [
      "EdgeEver-1.6.35-mac-arm64.dmg",
      "EdgeEver-1.6.35-mac-arm64.dmg.blockmap",
      "latest-mac.yml",
    ];
    expect(
      nativeReleaseAssetsReady({
        platform: "desktop",
        rebuild: true,
        currentTag: "v1.6.35",
        desktopVersion: "1.6.35",
        assetNames: current,
      }),
    ).toBe(true);
    expect(
      nativeReleaseAssetsReady({
        platform: "desktop",
        rebuild: true,
        currentTag: "v1.6.35",
        desktopVersion: "1.6.35",
        assetNames: current.slice(0, 2),
      }),
    ).toBe(false);
  });
});
