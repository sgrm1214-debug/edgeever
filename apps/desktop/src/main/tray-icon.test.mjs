import { describe, expect, test } from "bun:test";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { trayIconPath } from "./tray-icon.mjs";

describe("trayIconPath", () => {
  test("uses the macOS template icon during development", () => {
    expect(trayIconPath({
      isPackaged: false,
      platform: "darwin",
      projectRoot: "/project",
      resourcesPath: "/resources",
    })).toBe("/project/apps/desktop/assets/trayTemplate.png");
  });

  test("uses the packaged macOS template icon", () => {
    expect(trayIconPath({
      isPackaged: true,
      platform: "darwin",
      projectRoot: "/project",
      resourcesPath: "/resources",
    })).toBe("/resources/tray/trayTemplate.png");
  });

  test("keeps the existing cross-platform icon outside macOS", () => {
    expect(trayIconPath({
      isPackaged: true,
      platform: "win32",
      projectRoot: "/project",
      resourcesPath: "/resources",
    })).toBe("/resources/web/pwa-192x192.png");
  });

  test.each([
    ["trayTemplate.png", 16, 72],
    ["trayTemplate@2x.png", 32, 144],
  ])("%s is a correctly sized transparent PNG", async (name, size, density) => {
    const path = fileURLToPath(new URL(`../../assets/${name}`, import.meta.url));
    const metadata = await sharp(path).metadata();

    expect(metadata).toMatchObject({
      width: size,
      height: size,
      density,
      format: "png",
      hasAlpha: true,
    });
  });
});
