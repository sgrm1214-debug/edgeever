import { describe, expect, test } from "bun:test";
import { getNotebookDescendantIds } from "./notebooks.ts";

const notebook = (id, parentId) => ({
  id,
  parentId,
  name: id,
  slug: null,
  icon: null,
  color: null,
  sortOrder: 0,
  memoCount: 0,
  lastMemoUpdatedAt: null,
  createdAt: "",
  updatedAt: "",
});

describe("getNotebookDescendantIds", () => {
  test("includes the selected notebook and descendants at every depth", () => {
    const notebooks = [
      notebook("root", null),
      notebook("child", "root"),
      notebook("grandchild", "child"),
      notebook("other", null),
    ];

    expect(new Set(getNotebookDescendantIds(notebooks, "root"))).toEqual(
      new Set(["root", "child", "grandchild"])
    );
  });

  test("does not loop forever if imported data contains a cycle", () => {
    const notebooks = [notebook("first", "second"), notebook("second", "first")];

    expect(new Set(getNotebookDescendantIds(notebooks, "first"))).toEqual(new Set(["first", "second"]));
  });
});
