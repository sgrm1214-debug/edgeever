import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { globSync, readFileSync } from "node:fs";
import { Hono } from "hono";
import { MockLanguageModelV4 } from "ai/test";
import { simulateReadableStream } from "ai";
import { createSelfHostedStorageAdapter } from "./self-hosted-storage-adapter.ts";
import { registerCompanionRoutes } from "./companion-routes.ts";
import { beginCompanionTurn, checkpointCompanionTurn, clearCompanionHistory, companionRevision, forgetCompanionMemory,
  getCompanionTurn, importCompanionMemories, listCompanionMemories, listCompanionTurns, saveCompanionMemory } from "./companion-service.ts";
import { companionMessages, selectCompanionMemories, streamCompanion } from "./companion-runtime.ts";

const databases = [];
afterEach(() => { for (const db of databases.splice(0)) db.close(); });
const scope = { workspaceId: "ws_test", ownerId: "user_test" };
const other = { workspaceId: "ws_other", ownerId: "user_other" };
const input = (overrides = {}) => ({ id: crypto.randomUUID(), threadId: crypto.randomUUID(), message: "I prefer concise answers",
  useMemory: true, allowNotes: false, locale: "en-US", ...overrides });
function fixture(options = {}) {
  const sqlite = new Database(":memory:"); databases.push(sqlite);
  for (const path of globSync("migrations/*.sql").sort()) sqlite.exec(readFileSync(path, "utf8"));
  for (const id of [scope.workspaceId, other.workspaceId]) sqlite.query("INSERT INTO workspaces(id, name, is_personal) VALUES (?, ?, 1)").run(id, id);
  const storage = createSelfHostedStorageAdapter(sqlite, "/tmp/edgeever-companion-unused-resources");
  const app = new Hono();
  app.use("*", async (c, next) => {
    const identity = c.req.header("x-test-other") ? other : scope;
    c.set("auth", { kind: options.agent ? "agent" : "user", actorId: options.anonymous ? null : identity.ownerId,
      workspaceId: identity.workspaceId, role: "member", scopes: [] });
    await next();
  });
  registerCompanionRoutes(app, { isDemoMode: () => options.demo ?? false,
    loadModel: options.loadModel ?? (async () => ({ modelId: "test-model" })), stream: options.stream });
  const request = (path, method = "GET", body, headers = {}) => app.request(`/api/v1/companion/${path}`, {
    method, headers: { "Content-Type": "application/json", ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }, { storage });
  return { sqlite, db: storage.db, request };
}
const parseEvents = text => text.split("\n\n").filter(Boolean).map(frame => JSON.parse(frame.slice(6)));
const finish = { type: "finish", finishReason: { unified: "stop" }, usage: {
  inputTokens: { total: 12 }, outputTokens: { total: 8 },
} };

describe("companion persistence and governance", () => {
  test("stores, corrects, and forgets only within the owner/workspace pair", async () => {
    const { db } = fixture();
    const memory = await saveCompanionMemory(db, scope, { content: "Be concise" });
    expect(await listCompanionMemories(db, other)).toEqual([]);
    expect(await listCompanionMemories(db, { ...scope, ownerId: "other-owner" })).toEqual([]);
    await expect(saveCompanionMemory(db, other, { content: "tampered" }, memory)).rejects.toMatchObject({ code: "companion_memory_conflict" });
    const corrected = await saveCompanionMemory(db, scope, { content: "Explain tradeoffs" }, memory);
    expect(corrected.version).toBe(2);
    await expect(forgetCompanionMemory(db, scope, memory.id, 1)).rejects.toMatchObject({ code: "companion_memory_conflict" });
    await forgetCompanionMemory(db, scope, memory.id, 2);
    expect(await listCompanionMemories(db, scope)).toEqual([]);
  });
  test("explicit message provenance is validated and detached when history is cleared", async () => {
    const { db } = fixture();
    const row = await beginCompanionTurn(db, scope, input(), "model");
    await checkpointCompanionTurn(db, scope, row, "Understood", [], "completed");
    await expect(saveCompanionMemory(db, other, { content: row.message, sourceTurnId: row.id })).rejects.toMatchObject({ code: "companion_source_invalid" });
    await expect(saveCompanionMemory(db, scope, { content: "invented", sourceTurnId: row.id })).rejects.toMatchObject({ code: "companion_source_invalid" });
    await saveCompanionMemory(db, scope, { content: row.message, sourceTurnId: row.id });
    await clearCompanionHistory(db, scope);
    expect(await listCompanionTurns(db, scope)).toEqual([]);
    expect((await listCompanionMemories(db, scope))[0]).toMatchObject({ sourceTurnId: null, version: 2 });
  });
  test("forgetting cancels in-flight generation and excludes old context", async () => {
    const { db } = fixture();
    const memory = await saveCompanionMemory(db, scope, { content: "My secret preference" });
    const row = await beginCompanionTurn(db, scope, input(), "model");
    await forgetCompanionMemory(db, scope, memory.id, memory.version);
    await expect(checkpointCompanionTurn(db, scope, row, "outdated", [], "completed")).rejects.toMatchObject({ code: "companion_context_changed" });
    expect((await getCompanionTurn(db, scope, row.id)).status).toBe("cancelled");
    const history = [{ ...row, status: "completed", response: "old memory" }];
    const next = input({ threadId: row.thread_id });
    expect(companionMessages(next, history, await companionRevision(db, scope))).toHaveLength(1);
    expect(companionMessages({ ...next, useMemory: false }, history, row.memory_revision)).toHaveLength(1);
    expect(companionMessages(next, [{ ...history[0], sources_json: '[{"id":"deleted"}]' }], row.memory_revision)).toHaveLength(1);
  });
  test("rejected memory edits/deletes leave the context and active turn unchanged", async () => {
    const { db } = fixture();
    const memory = await saveCompanionMemory(db, scope, { content: "original" });
    const updated = await saveCompanionMemory(db, scope, { content: "corrected" }, memory);
    const row = await beginCompanionTurn(db, scope, input(), "model");
    const revision = await companionRevision(db, scope);
    await expect(saveCompanionMemory(db, scope, { content: "stale" }, memory)).rejects.toMatchObject({ code: "companion_memory_conflict" });
    await expect(forgetCompanionMemory(db, scope, memory.id, memory.version)).rejects.toMatchObject({ code: "companion_memory_conflict" });
    expect(await companionRevision(db, scope)).toBe(revision);
    expect((await getCompanionTurn(db, scope, row.id)).status).toBe("running");
    await forgetCompanionMemory(db, scope, updated.id, updated.version);
    expect((await getCompanionTurn(db, scope, row.id)).status).toBe("cancelled");
  });
  test("empty/duplicate imports and capacity failures do not cancel a conversation", async () => {
    const { db } = fixture();
    const contents = Array.from({ length: 50 }, (_, i) => `memory ${i}`);
    await importCompanionMemories(db, scope, contents);
    const row = await beginCompanionTurn(db, scope, input(), "model");
    const revision = await companionRevision(db, scope);
    await importCompanionMemories(db, scope, []);
    await importCompanionMemories(db, scope, contents);
    await expect(importCompanionMemories(db, scope, ["overflow"])).rejects.toMatchObject({ code: "companion_memory_conflict" });
    await expect(saveCompanionMemory(db, scope, { content: "overflow" })).rejects.toMatchObject({ code: "companion_memory_conflict" });
    expect(await companionRevision(db, scope)).toBe(revision);
    expect((await getCompanionTurn(db, scope, row.id)).status).toBe("running");
    await checkpointCompanionTurn(db, scope, row, "still valid", [], "completed");
  });
  test("imports atomically, deduplicates and enforces capacity", async () => {
    const { db } = fixture();
    await importCompanionMemories(db, scope, Array.from({ length: 49 }, (_, i) => `memory ${i}`));
    await expect(importCompanionMemories(db, scope, ["new a", "new b"])).rejects.toMatchObject({ code: "companion_memory_conflict" });
    expect(await listCompanionMemories(db, scope)).toHaveLength(49);
    await importCompanionMemories(db, scope, ["memory 0", "last", "last"]);
    expect(await listCompanionMemories(db, scope)).toHaveLength(50);
    await expect(saveCompanionMemory(db, scope, { content: "overflow" })).rejects.toMatchObject({ code: "companion_memory_conflict" });
  });
  test("one generation per owner, with expired-run recovery", async () => {
    const { db, sqlite } = fixture();
    const first = await beginCompanionTurn(db, scope, input(), "model");
    await expect(beginCompanionTurn(db, scope, input(), "model")).rejects.toMatchObject({ code: "companion_busy" });
    await beginCompanionTurn(db, other, input(), "model");
    sqlite.query("UPDATE companion_turns SET expires_at = '2000-01-01' WHERE id = ?").run(first.id);
    await beginCompanionTurn(db, scope, input(), "model");
    expect((await getCompanionTurn(db, scope, first.id)).status).toBe("interrupted");
  });
});

describe("companion HTTP contracts", () => {
  test("blocks demo, API agents and anonymous identities", async () => {
    for (const options of [{ demo: true }, { agent: true }, { anonymous: true }]) {
      expect((await fixture(options).request("memories")).status).toBe(403);
    }
  });
  test("validates payloads, sanitizes provider errors and scopes export", async () => {
    const { request, db } = fixture({ loadModel: async () => { throw new Error("API-KEY-secret"); } });
    expect((await request("memories", "POST", { content: "x".repeat(501) })).status).toBe(400);
    const failure = await request("turns", "POST", input());
    expect(failure.status).toBe(503);
    expect(await failure.text()).not.toContain("API-KEY-secret");
    await saveCompanionMemory(db, scope, { content: "private" });
    const exported = await request("export", "GET", undefined, { "x-test-other": "1" });
    expect((await exported.json()).memories).toEqual([]);
    expect(exported.headers.get("cache-control")).toBe("no-store");
  });
  test("persists displayed chunks and usage, recovers by ID without duplicate model calls", async () => {
    let calls = 0;
    const { request, db } = fixture({ stream: async args => {
      calls++;
      return { totalUsage: Promise.resolve({ inputTokens: 12, outputTokens: 8 }),
        fullStream: (async function* () {
          yield { type: "text-delta", text: "a".repeat(320) };
          expect((await getCompanionTurn(db, scope, args.input.id)).response).toHaveLength(320);
          yield { type: "text-delta", text: " done" };
        })() };
    } });
    const payload = input();
    const response = await request("turns", "POST", payload);
    const events = parseEvents(await response.text());
    expect(events.at(-1)).toMatchObject({ type: "done", turn: { status: "completed", inputTokens: 12, outputTokens: 8 } });
    expect((await request(`turns/${payload.id}`)).status).toBe(200);
    expect((await request(`turns/${payload.id}`, "GET", undefined, { "x-test-other": "1" })).status).toBe(404);
    expect((await request("turns", "POST", payload)).status).toBe(409);
    expect(calls).toBe(1);
  });
  test("stream failure preserves prefix but does not disclose provider details", async () => {
    const { request, db } = fixture({ stream: async () => ({ totalUsage: Promise.resolve({}), fullStream: (async function* () {
      yield { type: "text-delta", text: "partial response" };
      throw new Error("provider-secret");
    })() }) });
    const payload = input();
    const result = await (await request("turns", "POST", payload)).text();
    expect(result).not.toContain("provider-secret");
    expect((await getCompanionTurn(db, scope, payload.id))).toMatchObject({ status: "failed", response: "partial response" });
  });
  test("concurrent memory change prevents final outdated output", async () => {
    const { request, db } = fixture({ stream: async () => ({ totalUsage: Promise.resolve({}), fullStream: (async function* () {
      yield { type: "text-delta", text: "a".repeat(300) };
      await saveCompanionMemory(db, scope, { content: "new preference" });
      yield { type: "text-delta", text: "outdated final" };
    })() }) });
    const payload = input();
    const result = await (await request("turns", "POST", payload)).text();
    expect(result).not.toContain("outdated final");
    expect((await getCompanionTurn(db, scope, payload.id)).status).toBe("cancelled");
  });
});

describe("actual AI SDK companion runtime", () => {
  test("tools can only search scoped active notes and cannot read an arbitrary ID", async () => {
    const { db, sqlite } = fixture();
    for (const [id, workspaceId, deleted] of [["mine", scope.workspaceId, 0], ["foreign", other.workspaceId, 0], ["trashed", scope.workspaceId, 1]]) {
      sqlite.query("INSERT INTO notebooks(id, name, workspace_id) VALUES (?, ?, ?)").run(`nb-${id}`, id, workspaceId);
      sqlite.query("INSERT INTO memos(id, notebook_id, title, excerpt, workspace_id, is_deleted) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, `nb-${id}`, "testnote", `text-${id}`, workspaceId, deleted);
      sqlite.query("INSERT INTO memo_contents(memo_id, content_json, content_hash, content_markdown, content_text) VALUES (?, '{}', 'hash', ?, ?)")
        .run(id, `text-${id}`, `text-${id}`);
    }
    const calls = [
      { toolName: "read_note", input: JSON.stringify({ id: "foreign" }) },
      { toolName: "search_notes", input: JSON.stringify({ query: "testnote" }) },
      { toolName: "read_note", input: JSON.stringify({ id: "mine" }) },
    ];
    const model = new MockLanguageModelV4({ doStream: async () => {
      const call = calls.shift();
      return { stream: simulateReadableStream({ chunks: call ? [
        { type: "tool-call", toolCallId: crypto.randomUUID(), ...call },
        { ...finish, finishReason: { unified: "tool-calls" } },
      ] : [{ type: "text-start", id: "1" }, { type: "text-delta", id: "1", delta: "Found your note" }, { type: "text-end", id: "1" }, finish] }) };
    } });
    const sources = [];
    const result = await streamCompanion({ db, scope, input: input({ allowNotes: true }), model, memories: [], history: [],
      revision: 0, signal: new AbortController().signal, sources, assertActive: async () => {} });
    expect(await result.text).toBe("Found your note");
    expect(model.doStreamCalls).toHaveLength(4);
    expect(model.doStreamCalls[0].tools.map(tool => tool.name).sort()).toEqual(["read_note", "search_notes"]);
    expect(sources.map(source => source.id)).toEqual(["mine"]);
    const prompt = JSON.stringify(model.doStreamCalls.at(-1).prompt);
    expect(prompt).toContain("Search for the note first");
    expect(prompt).toContain("text-mine");
    expect(prompt).not.toContain("text-foreign");
    expect(prompt).not.toContain("text-trashed");
  });

  test("disabled note access exposes no tools; only explicitly enabled memory enters prompt", async () => {
    const { db } = fixture();
    const model = new MockLanguageModelV4({ doStream: { stream: simulateReadableStream({ chunks: [
      { type: "text-start", id: "1" }, { type: "text-delta", id: "1", delta: "Hello" }, { type: "text-end", id: "1" }, finish,
    ] }) } });
    const memories = [{ content: "private-memory", updatedAt: "2026-01-01" }];
    const result = await streamCompanion({ db, scope, input: input({ useMemory: false }), model, memories,
      history: [], revision: 0, signal: new AbortController().signal, sources: [], assertActive: async () => {} });
    expect(await result.text).toBe("Hello");
    const call = model.doStreamCalls[0];
    expect(call.tools?.length ?? 0).toBe(0);
    expect(JSON.stringify(call.prompt)).not.toContain("private-memory");
    expect(JSON.stringify(call.prompt)).toContain("untrusted DATA");
    expect(call.maxOutputTokens).toBe(2048);
  });
  test("memory selection and history size stay bounded", () => {
    const memories = Array.from({ length: 50 }, () => ({ content: "a".repeat(500), updatedAt: "2026-01-01" }));
    expect(selectCompanionMemories(memories, "hello").reduce((sum, m) => sum + m.content.length, 0)).toBeLessThanOrEqual(8000);
    const next = input();
    const history = Array.from({ length: 100 }, () => ({ id: crypto.randomUUID(), thread_id: next.threadId, status: "completed", memory_revision: 1, use_memory: 1,
      sources_json: "[]", message: "user", response: "reply" }));
    expect(companionMessages(next, history, 1)).toHaveLength(13);
  });
  test("Chinese questions recall older relevant memories within the fixed budget", () => {
    const old = { id: "coffee", content: "咖啡偏好：我喜欢不加糖的咖啡。", updatedAt: "2020-01-01" };
    const newer = Array.from({ length: 49 }, (_, i) => ({ id: String(i), content: "与问题无关的记录。".repeat(50), updatedAt: "2026-01-01" }));
    const memories = [...newer, old];
    const selected = selectCompanionMemories(memories, "我的咖啡偏好是什么？");
    expect(selected[0].id).toBe("coffee");
    expect(selected.reduce((total, memory) => total + memory.content.length, 0)).toBeLessThanOrEqual(8000);
    expect(memories.at(-1)).toBe(old);
  });
  test("normalizes Unicode and matches words rather than accidental substrings", () => {
    const memories = [
      { id: "trust", content: "Trust matters", updatedAt: "2026-01-01" },
      { id: "rust", content: "The desktop sidecar uses Rust", updatedAt: "2020-01-01" },
    ];
    expect(selectCompanionMemories(memories, "ＲＵＳＴ")[0].id).toBe("rust");
    expect(selectCompanionMemories(memories, "？？？")[0].id).toBe("trust");
  });
  test("memory-off mode keeps only safe same-thread history and respects forgetting", () => {
    const next = input({ useMemory: false });
    const safe = { id: "safe", thread_id: next.threadId, status: "completed", memory_revision: 3, use_memory: 0,
      sources_json: "[]", message: "Help me write a title", response: "A small beginning" };
    const history = [
      { ...safe, id: "private", use_memory: 1, response: "memory-derived secret" },
      { ...safe, id: "note", sources_json: '[{"id":"note"}]', response: "note-derived secret" },
      { ...safe, id: "forgotten", memory_revision: 2, response: "forgotten secret" },
      { ...safe, id: "another-thread", thread_id: crypto.randomUUID(), response: "other-thread secret" },
      { ...safe, id: "partial", status: "failed", response: "partial secret" }, safe,
    ];
    const messages = companionMessages(next, history, 3);
    expect(messages).toHaveLength(3);
    expect(messages[1].content).toBe("A small beginning");
    expect(JSON.stringify(messages)).not.toContain("secret");
    expect(companionMessages({ ...next, useMemory: true }, [safe], 3)).toHaveLength(3);
    expect(companionMessages(next, [safe], 4)).toHaveLength(1);
  });
  test("large histories have a total budget and never split message pairs", () => {
    const next = input({ message: "current" });
    const history = Array.from({ length: 6 }, (_, index) => ({ id: String(index), thread_id: next.threadId,
      status: "completed", memory_revision: 1, use_memory: 1, sources_json: "[]", message: "u".repeat(4000), response: "a".repeat(4000) }));
    const messages = companionMessages(next, history, 1);
    expect(messages).toHaveLength(3);
    expect(messages.map(m => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages.slice(0, -1).reduce((total, m) => total + m.content.length, 0)).toBeLessThanOrEqual(12000);
    expect(messages.at(-1).content).toBe("current");
  });
});
