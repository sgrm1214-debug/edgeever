import { describe, expect, test } from "bun:test";
import { detectWebClientKind } from "./client-environment.ts";

describe("web client kind detection", () => {
  test("prefers the native desktop bridge over browser display modes", () => {
    expect(
      detectWebClientKind({
        desktopBridgeAvailable: true,
        displayModeStandalone: true,
        navigatorStandalone: false,
      }),
    ).toBe("desktopApp");
  });

  test("detects installed PWAs from the display mode", () => {
    expect(
      detectWebClientKind({
        desktopBridgeAvailable: false,
        displayModeStandalone: true,
        navigatorStandalone: false,
      }),
    ).toBe("pwa");
  });

  test("detects installed iOS PWAs from navigator.standalone", () => {
    expect(
      detectWebClientKind({
        desktopBridgeAvailable: false,
        displayModeStandalone: false,
        navigatorStandalone: true,
      }),
    ).toBe("pwa");
  });

  test("falls back to the web client", () => {
    expect(
      detectWebClientKind({
        desktopBridgeAvailable: false,
        displayModeStandalone: false,
        navigatorStandalone: false,
      }),
    ).toBe("web");
  });
});
