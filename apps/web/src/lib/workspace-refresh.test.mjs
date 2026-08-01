import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  BACKGROUND_WORKSPACE_REFRESH_INTERVAL_MS,
  refreshWorkspaceData,
} from "./workspace-refresh.ts";

describe("refreshWorkspaceData", () => {
  it("uses a shared 30-second background refresh interval", () => {
    assert.equal(BACKGROUND_WORKSPACE_REFRESH_INTERVAL_MS, 30_000);
  });

  it("pushes local changes before pulling and invalidating during a manual refresh", async () => {
    const calls = [];
    const result = await refreshWorkspaceData({
      mode: "manual",
      hasPendingLocalChanges: true,
      pushLocalChanges: async () => calls.push("push"),
      pullRemoteChanges: async () => {
        calls.push("pull");
        return { changed: 2 };
      },
      invalidateWorkspaceQueries: async () => calls.push("invalidate"),
    });

    assert.deepEqual(calls, ["push", "pull", "invalidate"]);
    assert.deepEqual(result, { changed: 2, skipped: false });
  });

  it("skips a background pull while local changes are pending", async () => {
    const calls = [];
    const result = await refreshWorkspaceData({
      mode: "background",
      hasPendingLocalChanges: true,
      pushLocalChanges: async () => calls.push("push"),
      pullRemoteChanges: async () => {
        calls.push("pull");
        return { changed: 1 };
      },
      invalidateWorkspaceQueries: async () => calls.push("invalidate"),
    });

    assert.deepEqual(calls, []);
    assert.deepEqual(result, { changed: 0, skipped: true });
  });

  it("invalidates background queries only when remote changes exist", async () => {
    let invalidations = 0;
    const unchanged = await refreshWorkspaceData({
      mode: "background",
      hasPendingLocalChanges: false,
      pushLocalChanges: async () => undefined,
      pullRemoteChanges: async () => ({ changed: 0 }),
      invalidateWorkspaceQueries: async () => { invalidations += 1; },
    });
    const changed = await refreshWorkspaceData({
      mode: "background",
      hasPendingLocalChanges: false,
      pushLocalChanges: async () => undefined,
      pullRemoteChanges: async () => ({ changed: 3 }),
      invalidateWorkspaceQueries: async () => { invalidations += 1; },
    });

    assert.equal(invalidations, 1);
    assert.deepEqual(unchanged, { changed: 0, skipped: false });
    assert.deepEqual(changed, { changed: 3, skipped: false });
  });
});
