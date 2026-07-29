import { afterEach, describe, expect, test } from "bun:test";
import {
  DEFAULT_SYNC_INTERVAL_MS,
  DESKTOP_FOCUS_MODE_STORAGE_KEY,
  SYNC_INTERVAL_STORAGE_KEY,
  readSyncIntervalPreference,
  readDesktopFocusModePreference,
  writeSyncIntervalPreference,
  writeDesktopFocusModePreference,
} from "./app-helpers.ts";

const originalWindow = globalThis.window;

const installLocalStorage = (initialValue = null) => {
  const values = new Map();
  if (initialValue !== null) {
    values.set(DESKTOP_FOCUS_MODE_STORAGE_KEY, initialValue);
  }

  globalThis.window = {
    localStorage: {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, String(value)),
    },
  };

  return values;
};

afterEach(() => {
  globalThis.window = originalWindow;
});

describe("desktop focus mode preference", () => {
  test("defaults to disabled and only accepts an explicit true value", () => {
    installLocalStorage();
    expect(readDesktopFocusModePreference()).toBe(false);

    installLocalStorage("false");
    expect(readDesktopFocusModePreference()).toBe(false);

    installLocalStorage("true");
    expect(readDesktopFocusModePreference()).toBe(true);
  });

  test("persists enabled and disabled values", () => {
    const values = installLocalStorage();

    writeDesktopFocusModePreference(true);
    expect(values.get(DESKTOP_FOCUS_MODE_STORAGE_KEY)).toBe("true");

    writeDesktopFocusModePreference(false);
    expect(values.get(DESKTOP_FOCUS_MODE_STORAGE_KEY)).toBe("false");
  });

  test("fails closed when local storage is unavailable", () => {
    globalThis.window = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
        setItem: () => {
          throw new Error("blocked");
        },
      },
    };

    expect(readDesktopFocusModePreference()).toBe(false);
    expect(() => writeDesktopFocusModePreference(true)).not.toThrow();
  });
});

describe("automatic sync interval preference", () => {
  test("defaults to 30 seconds", () => {
    installLocalStorage();
    expect(readSyncIntervalPreference()).toBe(DEFAULT_SYNC_INTERVAL_MS);
    expect(DEFAULT_SYNC_INTERVAL_MS).toBe(30_000);
  });

  test("reads and writes sync intervals", () => {
    const values = installLocalStorage();

    writeSyncIntervalPreference("30s");
    expect(values.get(SYNC_INTERVAL_STORAGE_KEY)).toBe("30s");
    expect(readSyncIntervalPreference()).toBe(30_000);

    writeSyncIntervalPreference("5m");
    expect(values.get(SYNC_INTERVAL_STORAGE_KEY)).toBe("5m");
    expect(readSyncIntervalPreference()).toBe(300_000);
  });

  test("preserves the legacy preference stored under the old key", () => {
    const values = installLocalStorage();
    values.set("edgeever.autoSaveInterval", "15m");
    expect(readSyncIntervalPreference()).toBe(900_000);
  });

  test("migrates the former one-minute default to 30 seconds", () => {
    const values = installLocalStorage();
    values.set(SYNC_INTERVAL_STORAGE_KEY, "1m");
    expect(readSyncIntervalPreference()).toBe(30_000);
  });

  test("falls back to the default for unknown or unavailable storage", () => {
    const values = installLocalStorage();
    values.set(SYNC_INTERVAL_STORAGE_KEY, "unexpected");
    expect(readSyncIntervalPreference()).toBe(30_000);

    globalThis.window = {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    };
    expect(readSyncIntervalPreference()).toBe(30_000);
  });
});
