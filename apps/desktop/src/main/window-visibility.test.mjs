import { describe, expect, test } from "bun:test";
import { showWindow } from "./window-visibility.mjs";

const createWindow = ({ destroyed = false, minimized = false } = {}) => {
  const calls = [];
  return {
    calls,
    isDestroyed: () => destroyed,
    isMinimized: () => minimized,
    restore: () => calls.push("restore"),
    show: () => calls.push("show"),
    focus: () => calls.push("focus"),
  };
};

describe("desktop window visibility", () => {
  test("shows and focuses an existing hidden window", () => {
    const window = createWindow();

    expect(showWindow(window)).toBe(true);
    expect(window.calls).toEqual(["show", "focus"]);
  });

  test("restores a minimized window before showing it", () => {
    const window = createWindow({ minimized: true });

    expect(showWindow(window)).toBe(true);
    expect(window.calls).toEqual(["restore", "show", "focus"]);
  });

  test("ignores a missing or destroyed window", () => {
    const destroyedWindow = createWindow({ destroyed: true });

    expect(showWindow(null)).toBe(false);
    expect(showWindow(destroyedWindow)).toBe(false);
    expect(destroyedWindow.calls).toEqual([]);
  });
});
