import { afterEach, describe, expect, test } from "bun:test";
import { IDBKeyRange, indexedDB } from "fake-indexeddb";

globalThis.indexedDB = indexedDB;
globalThis.IDBKeyRange = IDBKeyRange;

const { localDb } = await import("./local-db.ts");
const { api } = await import("./api.ts");
const { createWebRepository } = await import("./repository.ts");
const { createLocalMemo } = await import("./local-mirror.ts");

afterEach(async () => {
  await localDb.transaction("rw", [localDb.templates, localDb.notebooks, localDb.memos, localDb.resources, localDb.revisions, localDb.syncMeta, localDb.syncQueue], async () => {
    await Promise.all([
      localDb.templates.clear(),
      localDb.notebooks.clear(),
      localDb.memos.clear(),
      localDb.resources.clear(),
      localDb.revisions.clear(),
      localDb.syncMeta.clear(),
      localDb.syncQueue.clear(),
    ]);
  });
});

describe("web repository offline boundaries", () => {
  test("saves memo edits locally while deferring remote synchronization", async () => {
    const previousWindow = globalThis.window;
    const eventTarget = new EventTarget();
    globalThis.window = eventTarget;
    let immediateEvents = 0;
    let deferredEvents = 0;
    eventTarget.addEventListener("edgeever:sync-queue-changed", () => {
      immediateEvents += 1;
    });
    eventTarget.addEventListener("edgeever:sync-queue-deferred", () => {
      deferredEvents += 1;
    });

    try {
      const scope = "https://demo.edgeever.org|user-1";
      const memo = await createLocalMemo(scope, { notebookId: "nb-1" });
      const repository = createWebRepository(scope);
      const contentJson = {
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Saved locally" }] }],
      };

      const result = await repository.updateMemo(memo, {
        expectedRevision: memo.revision,
        expectedContentHash: memo.contentHash,
        editSessionId: "local-edit",
        title: "",
        contentJson,
        tags: [],
      });

      expect(result.memo.contentText).toBe("Saved locally");
      expect(await localDb.syncQueue.get(`memo.update:${memo.id}`)).toBeDefined();
      expect(deferredEvents).toBe(1);
      expect(immediateEvents).toBe(0);
    } finally {
      globalThis.window = previousWindow;
    }
  });

  test("uses the remote detail when the local database is blocked and navigator falsely reports offline", async () => {
    const previousOnline = globalThis.navigator?.onLine;
    if (globalThis.navigator) Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, value: false });
    const scope = "https://demo.edgeever.org|user-1";
    const remoteMemo = {
      id: "memo-blocked",
      notebookId: "nb-1",
      title: "Remote detail",
      excerpt: "Remote excerpt",
      tags: [],
      isPinned: false,
      isArchived: false,
      isDeleted: false,
      revision: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
      contentJson: { type: "doc", content: [] },
      contentMarkdown: "remote",
      contentText: "remote",
      contentHash: "remote",
      sourceMemoIds: [],
    };
    const originalLocalGet = localDb.memos.get;
    const originalLocalPut = localDb.memos.put;
    const originalApiGetMemo = api.getMemo;
    localDb.memos.get = async () => new Promise(() => {});
    localDb.memos.put = async () => new Promise(() => {});
    api.getMemo = async () => ({ memo: remoteMemo });

    try {
      const repository = createWebRepository(scope);
      const startedAt = Date.now();
      expect((await repository.getMemo("memo-blocked")).memo.title).toBe("Remote detail");
      expect(Date.now() - startedAt).toBeLessThan(1_000);
    } finally {
      localDb.memos.get = originalLocalGet;
      localDb.memos.put = originalLocalPut;
      api.getMemo = originalApiGetMemo;
      if (globalThis.navigator) Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, value: previousOnline });
    }
  });

  test("returns cached detail immediately and refreshes it in the background", async () => {
    const previousOnline = globalThis.navigator?.onLine;
    if (globalThis.navigator) Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, value: true });
    const scope = "https://demo.edgeever.org|user-1";
    const localMemo = {
      id: "memo-1",
      notebookId: "nb-1",
      title: "Cached title",
      excerpt: "Cached excerpt",
      tags: [],
      isPinned: false,
      isArchived: false,
      isDeleted: false,
      revision: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      deletedAt: null,
      contentJson: { type: "doc", content: [] },
      contentMarkdown: "cached",
      contentText: "cached",
      contentHash: "cached",
      sourceMemoIds: [],
    };
    const remoteMemo = { ...localMemo, title: "Remote title", contentMarkdown: "remote", contentText: "remote", revision: 2 };
    await localDb.memos.put({ ...localMemo, scope });
    const originalGetMemo = api.getMemo;
    api.getMemo = async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return { memo: remoteMemo };
    };

    try {
      const repository = createWebRepository(scope);
      expect((await repository.getMemo("memo-1")).memo.title).toBe("Cached title");
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect((await localDb.memos.get([scope, "memo-1"])).title).toBe("Remote title");
    } finally {
      api.getMemo = originalGetMemo;
      if (globalThis.navigator) Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, value: previousOnline });
    }
  });

  test("returns empty initialized collections without cloud fallbacks", async () => {
    const previousOnline = globalThis.navigator?.onLine;
    if (globalThis.navigator) Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, value: false });
    const scope = "https://demo.edgeever.org|user-1";
    await localDb.syncMeta.put({ scope, key: "identity", value: "sync-1", updatedAt: new Date().toISOString() });
    const original = {
      listTags: api.listTags,
      listTemplates: api.listTemplates,
      listResources: api.listResources,
      listNotebooks: api.listNotebooks,
    };
    api.listTags = async () => { throw new Error("cloud fallback"); };
    api.listTemplates = async () => { throw new Error("cloud fallback"); };
    api.listResources = async () => { throw new Error("cloud fallback"); };
    api.listNotebooks = async () => { throw new Error("cloud fallback"); };

    try {
      const repository = createWebRepository(scope);
      expect(await repository.listTags()).toEqual({ tags: [] });
      expect(await repository.listTemplates()).toEqual({ templates: [] });
      expect(await repository.listResources()).toEqual({ resources: [], summary: { totalCount: 0, totalBytes: 0, imageCount: 0, attachmentCount: 0 } });
      expect((await repository.listNotebooks()).notebooks).toEqual([]);
    } finally {
      api.listTags = original.listTags;
      api.listTemplates = original.listTemplates;
      api.listResources = original.listResources;
      api.listNotebooks = original.listNotebooks;
      if (globalThis.navigator) Object.defineProperty(globalThis.navigator, "onLine", { configurable: true, value: previousOnline });
    }
  });
});
