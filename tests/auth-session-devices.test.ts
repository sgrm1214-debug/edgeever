import { describe, expect, test } from "bun:test";
import { LoginSchema } from "@edgeever/shared";
import {
  groupLoginDeviceSessions,
  resolveSessionDeviceId,
  type LoginDeviceSessionRow,
} from "../apps/api/src/auth-session-devices";

describe("login device sessions", () => {
  test("accepts an optional stable client device id", () => {
    expect(LoginSchema.parse({ username: "owner", password: "secret", deviceId: "web-device-123456" }).deviceId)
      .toBe("web-device-123456");
    expect(LoginSchema.parse({ username: "owner", password: "secret" }).deviceId).toBeUndefined();
    expect(() => LoginSchema.parse({ username: "owner", password: "secret", deviceId: "short" })).toThrow();
  });

  test("falls back to a stable legacy user-agent device id", () => {
    expect(resolveSessionDeviceId(undefined, "EdgeEver/1.4.0", "sess_new"))
      .toBe("legacy-ua:EdgeEver/1.4.0");
    expect(resolveSessionDeviceId(undefined, null, "sess_new")).toBe("legacy-session:sess_new");
  });

  test("groups repeated sessions from the same device and preserves the current session", () => {
    const rows: LoginDeviceSessionRow[] = [
      {
        id: "sess_latest",
        device_id: "mobile-installation-1",
        user_agent: "EdgeEver/1.4.0",
        created_at: "2026-07-20T00:00:00.000Z",
        last_seen_at: "2026-07-22T04:00:00.000Z",
        expires_at: "2027-07-20T00:00:00.000Z",
      },
      {
        id: "sess_current",
        device_id: "mobile-installation-1",
        user_agent: "EdgeEver/1.4.0",
        created_at: "2026-07-18T00:00:00.000Z",
        last_seen_at: "2026-07-21T04:00:00.000Z",
        expires_at: "2027-07-18T00:00:00.000Z",
      },
    ];

    expect(groupLoginDeviceSessions(rows, "sess_current")).toEqual([
      {
        id: "sess_current",
        userAgent: "EdgeEver/1.4.0",
        isCurrent: true,
        createdAt: "2026-07-18T00:00:00.000Z",
        lastSeenAt: "2026-07-22T04:00:00.000Z",
        expiresAt: "2027-07-18T00:00:00.000Z",
      },
    ]);
  });
});
