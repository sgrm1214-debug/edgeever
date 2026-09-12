import { describe, expect, test } from "bun:test";
import { computePosition } from "@floating-ui/react-dom";
import { attachmentResourceMenuPosition } from "./attachment-resource-menu.ts";

const menuSize = { width: 300, height: 42 };
const viewport = { x: 0, y: 0, width: 1024, height: 768 };

const positionMenu = (reference) => computePosition({}, {}, {
  ...attachmentResourceMenuPosition,
  platform: {
    getElementRects: () => ({ reference, floating: { x: 0, y: 0, ...menuSize } }),
    getClippingRect: () => viewport,
    getDimensions: () => menuSize,
    getOffsetParent: () => null,
    isElement: () => false,
    getDocumentElement: () => ({}),
    isRTL: () => false,
  },
});

const expectOutsideToolbar = (position, toolbar) => {
  expect(
    position.y + menuSize.height <= toolbar.y - 8 ||
    position.y >= toolbar.y + toolbar.height + 8,
  ).toBe(true);
  expect(position.x).toBeGreaterThanOrEqual(12);
  expect(position.x + menuSize.width).toBeLessThanOrEqual(viewport.width - 12);
};

describe("attachment resource menu positioning", () => {
  test("keeps actions above the toolbar instead of covering open-external", async () => {
    const toolbar = { x: 200, y: 240, width: 680, height: 48 };
    const position = await positionMenu(toolbar);
    expect(position.placement).toBe("top-end");
    expect(position.y + menuSize.height).toBeLessThanOrEqual(toolbar.y - 8);
    expectOutsideToolbar(position, toolbar);
  });

  test("flips below a toolbar near the top of the viewport", async () => {
    const toolbar = { x: 200, y: 8, width: 680, height: 48 };
    const position = await positionMenu(toolbar);
    expect(position.placement.startsWith("bottom")).toBe(true);
    expect(position.y).toBeGreaterThanOrEqual(toolbar.y + toolbar.height + 8);
    expectOutsideToolbar(position, toolbar);
  });

  test("stays within horizontal bounds on a compact card", async () => {
    for (const toolbar of [
      { x: 0, y: 240, width: 320, height: 48 },
      { x: 700, y: 240, width: 320, height: 48 },
    ]) {
      expectOutsideToolbar(await positionMenu(toolbar), toolbar);
    }
  });
});
