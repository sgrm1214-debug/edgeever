import { describe, expect, test } from "bun:test";
import { shouldOpenEditorLink } from "./editor-link-click.ts";

const primaryClick = {
  button: 0,
  ctrlKey: false,
  metaKey: false,
};

describe("editor link click policy", () => {
  test("keeps a normal primary click inside an editable document", () => {
    expect(shouldOpenEditorLink(primaryClick, true)).toBe(false);
  });

  test("opens an editable link with Ctrl-click", () => {
    expect(shouldOpenEditorLink({ ...primaryClick, ctrlKey: true }, true)).toBe(true);
  });

  test("opens an editable link with Command-click", () => {
    expect(shouldOpenEditorLink({ ...primaryClick, metaKey: true }, true)).toBe(true);
  });

  test("opens a link normally in a read-only document", () => {
    expect(shouldOpenEditorLink(primaryClick, false)).toBe(true);
  });

  test("does not handle non-primary buttons", () => {
    expect(shouldOpenEditorLink({ ...primaryClick, button: 1 }, false)).toBe(false);
  });
});
