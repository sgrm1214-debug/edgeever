import { expect, test } from "bun:test";
import { hasMobileSyncCursorRewound, hasMobileSyncIdentityChanged, isMobileSyncMetadataInitialized, splitMobileBootstrapWriteBatches } from "./mobile-sync-protocol";

test("rebuilds the mobile mirror when the server change cursor rewinds", () => {
  expect(hasMobileSyncCursorRewound(42, 7)).toBe(true);
  expect(hasMobileSyncCursorRewound(42, 42)).toBe(false);
  expect(hasMobileSyncCursorRewound(42, 64)).toBe(false);
});

test("keeps compatibility with servers that do not report their current cursor", () => {
  expect(hasMobileSyncCursorRewound(42)).toBe(false);
});

test("rebuilds the mobile mirror when the server data identity changes", () => {
  expect(hasMobileSyncIdentityChanged("workspace-created-at-a", "workspace-created-at-b")).toBe(true);
  expect(hasMobileSyncIdentityChanged("workspace-created-at-a", "workspace-created-at-a")).toBe(false);
});

test("keeps compatibility with servers that do not report a data identity", () => {
  expect(hasMobileSyncIdentityChanged("legacy")).toBe(false);
});

test("waits for a complete local mirror before rendering an empty notebook", () => {
  expect(isMobileSyncMetadataInitialized("42", "workspace-a")).toBe(true);
  expect(isMobileSyncMetadataInitialized(null, "workspace-a")).toBe(false);
  expect(isMobileSyncMetadataInitialized("42", null)).toBe(false);
  expect(isMobileSyncMetadataInitialized("not-a-number", "workspace-a")).toBe(false);
});

test("splits the initial mirror into progressive write batches", () => {
  const items = Array.from({ length: 123 }, (_, index) => index);
  expect(splitMobileBootstrapWriteBatches(items, 50).map((batch) => batch.length)).toEqual([50, 50, 23]);
  expect(splitMobileBootstrapWriteBatches([], 50)).toEqual([[]]);
});
