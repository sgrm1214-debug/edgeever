import { describe, expect, test } from "bun:test";

const { isStagedResourceReferenced, mergeMemoIdMappings, orderBootstrapNotebooks, rewriteStagedResource } = await import("./desktop-sync.ts");

describe("desktop staged resource sync", () => {
  test("rewrites placeholders in memo JSON and markdown", () => {
    const rewrites = [{ memoId: "memo-1", placeholder: "edgeever-staged://stage-1", url: "/api/v1/resources/resource-1/blob" }];
    const value = {
      contentJson: { type: "doc", content: [{ type: "image", attrs: { src: "edgeever-staged://stage-1" } }] },
      contentMarkdown: "![photo](edgeever-staged://stage-1)",
    };

    expect(rewriteStagedResource(value, rewrites)).toEqual({
      contentJson: { type: "doc", content: [{ type: "image", attrs: { src: "/api/v1/resources/resource-1/blob" } }] },
      contentMarkdown: "![photo](/api/v1/resources/resource-1/blob)",
    });
  });

  test("does not consume a staged image before a saved memo update references it", () => {
    const stagedId = "stage-1";

    expect(isStagedResourceReferenced([], stagedId)).toBe(false);
    expect(isStagedResourceReferenced([
      { contentJson: { type: "doc", content: [{ type: "image", attrs: { src: `edgeever-staged://${stagedId}` } }] } },
    ], stagedId)).toBe(true);
  });

  test("does not confuse one staged image id with a longer id that shares its prefix", () => {
    expect(isStagedResourceReferenced([
      { contentMarkdown: "![photo](edgeever-staged://stage-10)" },
    ], "stage-1")).toBe(false);
    expect(isStagedResourceReferenced([
      { contentMarkdown: "![photo](edgeever-staged://stage-1)" },
    ], "stage-1")).toBe(true);
  });

  test("retains a temporary id mapping when a later sync phase fails", () => {
    const retained = mergeMemoIdMappings(new Map(), new Map([["memo_local_1", "memo_remote_1"]]));

    expect(retained.get("memo_local_1")).toBe("memo_remote_1");
  });
});

describe("desktop bootstrap sync", () => {
  test("orders parent notebooks before their children", () => {
    const child = { id: "child", parentId: "parent", name: "Child" };
    const parent = { id: "parent", parentId: null, name: "Parent" };
    const grandchild = { id: "grandchild", parentId: "child", name: "Grandchild" };

    expect(orderBootstrapNotebooks([grandchild, child, parent]).map((notebook) => notebook.id)).toEqual([
      "parent",
      "child",
      "grandchild",
    ]);
  });
});
