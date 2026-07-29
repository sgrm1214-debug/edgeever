import { describe, expect, test } from "bun:test";

const storage = new Map();
const calls = [];
const events = [];
let completeSave;

globalThis.window = {
  edgeeverDesktop: {
    isAvailable: true,
    apiBaseUrl: "",
    setApiBaseUrl: async (value) => {
      calls.push(["bridge:start", value]);
      if (!value) {
        calls.push(["bridge:complete", value]);
        return value;
      }
      await new Promise((resolve) => {
        completeSave = resolve;
      });
      calls.push(["bridge:complete", value]);
      return value;
    },
  },
  localStorage: {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => {
      calls.push(["storage", value]);
      storage.set(key, value);
    },
    removeItem: (key) => {
      storage.delete(key);
    },
  },
  dispatchEvent: (event) => {
    events.push(event.type);
    return true;
  },
};

const {
  DESKTOP_API_BASE_URL_STORAGE_KEY,
  api,
  cacheDesktopSession,
  getConfiguredDesktopApiBaseUrl,
  getCachedDesktopSession,
  saveDesktopApiBaseUrl,
} = await import("./api.ts");

describe("desktop instance setup", () => {
  test("can retry with a valid URL after invalid input", async () => {
    await expect(saveDesktopApiBaseUrl("not-an-instance")).rejects.toThrow();

    const saving = saveDesktopApiBaseUrl(" https://notes.example.com/ ");
    await Promise.resolve();
    expect(calls).toEqual([["bridge:start", "https://notes.example.com"]]);
    expect(storage.has(DESKTOP_API_BASE_URL_STORAGE_KEY)).toBe(false);

    completeSave();
    await expect(saving).resolves.toBe("https://notes.example.com");
    expect(calls).toEqual([
      ["bridge:start", "https://notes.example.com"],
      ["bridge:complete", "https://notes.example.com"],
      ["storage", "https://notes.example.com"],
    ]);
    expect(storage.get(DESKTOP_API_BASE_URL_STORAGE_KEY)).toBe("https://notes.example.com");
  });

  test("clears the cached session when the login form changes instances", async () => {
    calls.length = 0;
    window.edgeeverDesktop.apiBaseUrl = "https://notes.example.com";
    storage.set(DESKTOP_API_BASE_URL_STORAGE_KEY, "https://notes.example.com");
    cacheDesktopSession({
      authRequired: true,
      authenticated: true,
      demoMode: false,
      sessionToken: "old-instance-session",
      user: { id: "user-1", username: "admin", displayName: null, role: "owner" },
    });
    calls.length = 0;

    const saving = saveDesktopApiBaseUrl("https://other.example.com");
    await Promise.resolve();

    expect(getCachedDesktopSession()).toBeNull();
    expect(calls).toEqual([
      ["bridge:start", "https://other.example.com"],
    ]);

    completeSave();
    await expect(saving).resolves.toBe("https://other.example.com");
    expect(storage.get(DESKTOP_API_BASE_URL_STORAGE_KEY)).toBe("https://other.example.com");
    expect(getConfiguredDesktopApiBaseUrl()).toBe("https://other.example.com");
    window.edgeeverDesktop.apiBaseUrl = "";
  });

  test("preserves the desktop token when refreshing the same authenticated session", () => {
    cacheDesktopSession({
      authRequired: true,
      authenticated: true,
      demoMode: false,
      sessionToken: "desktop-session-token",
      user: { id: "user-1", username: "admin", displayName: null, role: "owner" },
    });

    cacheDesktopSession({
      authRequired: true,
      authenticated: true,
      demoMode: false,
      user: { id: "user-1", username: "admin", displayName: "Owner", role: "owner" },
    });

    expect(getCachedDesktopSession()).toEqual({
      authRequired: true,
      authenticated: true,
      demoMode: false,
      sessionToken: "desktop-session-token",
      user: { id: "user-1", username: "admin", displayName: "Owner", role: "owner" },
    });
  });

  test("does not carry a desktop token into a different account session", () => {
    cacheDesktopSession({
      authRequired: true,
      authenticated: true,
      demoMode: false,
      sessionToken: "user-1-session-token",
      user: { id: "user-1", username: "admin", displayName: null, role: "owner" },
    });

    cacheDesktopSession({
      authRequired: true,
      authenticated: true,
      demoMode: false,
      user: { id: "user-2", username: "member", displayName: null, role: "member" },
    });

    expect(getCachedDesktopSession()?.sessionToken).toBeUndefined();
  });

  test("uses the desktop session token and stops network retries after a 401", async () => {
    calls.length = 0;
    events.length = 0;
    storage.set(DESKTOP_API_BASE_URL_STORAGE_KEY, "https://notes.example.com");
    cacheDesktopSession({
      authRequired: true,
      authenticated: true,
      demoMode: false,
      sessionToken: "desktop-session-token",
      user: { id: "user-1", username: "admin", displayName: null, role: "owner" },
    });

    const requests = [];
    globalThis.fetch = async (url, init) => {
      requests.push({ url, authorization: new Headers(init?.headers).get("Authorization") });
      return new Response(JSON.stringify({ error: { code: "unauthorized", message: "Authentication required" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    };

    await expect(api.syncBootstrap({ limit: 200 })).rejects.toMatchObject({ status: 401 });
    await expect(api.syncBootstrap({ limit: 200 })).rejects.toMatchObject({ status: 401 });

    expect(requests).toEqual([{
      url: "https://notes.example.com/api/v1/sync/bootstrap?limit=200",
      authorization: "Bearer desktop-session-token",
    }]);
    expect(events).toEqual(["edgeever:unauthorized"]);
    expect(getCachedDesktopSession()).toBeNull();

    globalThis.fetch = async (url, init) => {
      requests.push({ url, authorization: new Headers(init?.headers).get("Authorization") });
      return Response.json({
        authRequired: true,
        authenticated: true,
        demoMode: false,
        sessionToken: "replacement-session-token",
        user: { id: "user-1", username: "admin", displayName: null, role: "owner" },
      });
    };

    const replacement = await api.login({ username: "admin", password: "secret" });
    cacheDesktopSession(replacement);
    await api.syncBootstrap({ limit: 200 });

    expect(requests.at(-1)).toEqual({
      url: "https://notes.example.com/api/v1/sync/bootstrap?limit=200",
      authorization: "Bearer replacement-session-token",
    });
  });
});
