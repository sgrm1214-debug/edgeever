import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

const workspaceSource = readFileSync(
  new URL("../apps/mobile/src/screens/WorkspaceScreen.tsx", import.meta.url),
  "utf8"
);
const memoDetailSource = readFileSync(
  new URL("../apps/mobile/src/screens/WorkspaceMemoDetail.tsx", import.meta.url),
  "utf8"
);
const notesViewSource = readFileSync(
  new URL("../apps/mobile/src/screens/WorkspaceNotesView.tsx", import.meta.url),
  "utf8"
);
const mobileDomSource = readFileSync(
  new URL("../apps/mobile/src/lib/mobile-dom.ts", import.meta.url),
  "utf8"
);
const appJson = JSON.parse(
  readFileSync(new URL("../apps/mobile/app.json", import.meta.url), "utf8")
) as {
  expo: {
    ios?: {
      infoPlist?: Record<string, unknown>;
      supportsTablet?: boolean;
    };
  };
};
const accountSecuritySource = readFileSync(
  new URL("../apps/mobile/src/screens/AccountSecurityModal.tsx", import.meta.url),
  "utf8"
);

describe("mobile app scope", () => {
  test("keeps workspace administration out of the native app", () => {
    for (const removedCapability of [
      "ApiTokensModal",
      "ResourcesModal",
      "TagsManagerModal",
      "createApiToken",
      "deleteApiToken",
      "mergeMemos",
    ]) {
      expect(workspaceSource).not.toContain(removedCapability);
    }
  });

  test("does not initialize a hidden WebView during workspace startup", () => {
    expect(workspaceSource).not.toContain("EditorRuntimePrewarm");
    expect(workspaceSource).not.toContain("editorRuntimeWarm");
  });

  test("limits account security to the signed-in user", () => {
    for (const removedCapability of ["createUser", "listUsers", "updateUser"]) {
      expect(accountSecuritySource).not.toContain(removedCapability);
    }
  });

  test("keeps version history reachable from an active note", () => {
    expect(memoDetailSource).toMatch(
      /\{memo && !memo\.isDeleted \? \(\s*<Pressable\s+accessibilityLabel="版本历史"/
    );
    expect(memoDetailSource).toContain('syncStatus === "conflict"');
    expect(memoDetailSource).toContain("onResolveSyncConflict");
  });

  test("renders note detail body with the shared read-only TipTap viewer", () => {
    expect(memoDetailSource).toContain('mode="viewer"');
    expect(memoDetailSource).toContain("LocalTiptapEditor");
    expect(memoDetailSource).not.toContain("react-native-markdown-display");
  });

  test("keeps memo list free of Reanimated layout transitions that crash Fabric text layout", () => {
    expect(notesViewSource).not.toContain("FadeInDown");
    expect(notesViewSource).not.toContain("FadeOutUp");
    expect(notesViewSource).not.toContain("LinearTransition");
    expect(notesViewSource).not.toContain("entering=");
    expect(notesViewSource).not.toContain("layout={LinearTransition");
  });

  test("hardens DOM/WebView hosts against media capture probes during App Review", () => {
    expect(mobileDomSource).toContain('mediaCapturePermissionGrantType: "deny"');
    expect(mobileDomSource).toContain("mediaPlaybackRequiresUserAction: true");
    expect(workspaceSource).toContain("SAFE_DOM_WEBVIEW_PROPS");
    expect(memoDetailSource).toContain("SAFE_DOM_WEBVIEW_PROPS");
  });

  test("declares iOS privacy strings and full-screen phone-on-iPad presentation", () => {
    const infoPlist = appJson.expo.ios?.infoPlist ?? {};
    expect(appJson.expo.ios?.supportsTablet).toBe(false);
    expect(infoPlist.UIRequiresFullScreen).toBe(true);
    expect(String(infoPlist.NSMicrophoneUsageDescription ?? "")).toMatch(/microphone/i);
    expect(String(infoPlist.NSCameraUsageDescription ?? "")).toMatch(/camera/i);
  });
});
