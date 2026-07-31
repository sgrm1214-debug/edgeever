import { describe, expect, test } from "bun:test";

const { requiresRemoteMemoForStandaloneMobileEditor } = await import("./mobile-editor.ts");

describe("standalone mobile editor handoff", () => {
  test("requires a server memo before opening the web mobile editor", () => {
    expect(requiresRemoteMemoForStandaloneMobileEditor({
      mobileViewport: true,
      desktopRuntime: false,
    })).toBe(true);
  });

  test("keeps desktop and wide web creation on their repositories", () => {
    expect(requiresRemoteMemoForStandaloneMobileEditor({
      mobileViewport: false,
      desktopRuntime: false,
    })).toBe(false);
    expect(requiresRemoteMemoForStandaloneMobileEditor({
      mobileViewport: true,
      desktopRuntime: true,
    })).toBe(false);
  });
});
