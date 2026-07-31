import { describe, expect, test } from "bun:test";
import extensionPackage from "./package.json";
import {
  buildExtensionManifest,
  FIREFOX_ADDON_ID,
  FIREFOX_ANDROID_MIN_VERSION,
  FIREFOX_MIN_VERSION,
} from "./manifest.ts";

describe("extension manifests", () => {
  test("keeps shared permissions and package version across targets", () => {
    for (const target of ["chromium", "firefox"]) {
      const manifest = buildExtensionManifest(target, extensionPackage.version);
      expect(manifest.version).toBe(extensionPackage.version);
      expect(manifest.permissions).toEqual(["activeTab", "scripting", "storage"]);
      expect(manifest.optional_host_permissions).toContain("https://*/*");
    }
  });

  test("uses a service worker for Chromium", () => {
    const manifest = buildExtensionManifest("chromium", extensionPackage.version);
    expect(manifest.background).toEqual({
      service_worker: "assets/background.js",
      type: "module",
    });
    expect("browser_specific_settings" in manifest).toBe(false);
  });

  test("uses an event-page module and required AMO disclosures for Firefox", () => {
    const manifest = buildExtensionManifest("firefox", extensionPackage.version);
    expect(manifest.background).toEqual({
      scripts: ["assets/background.js"],
      type: "module",
    });
    expect(manifest.browser_specific_settings).toEqual({
      gecko: {
        id: FIREFOX_ADDON_ID,
        strict_min_version: FIREFOX_MIN_VERSION,
        data_collection_permissions: {
          required: [
            "authenticationInfo",
            "browsingActivity",
            "websiteContent",
          ],
        },
      },
      gecko_android: {
        strict_min_version: FIREFOX_ANDROID_MIN_VERSION,
      },
    });
  });
});
