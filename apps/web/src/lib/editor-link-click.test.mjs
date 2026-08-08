import { describe, expect, test } from "bun:test";
import { shouldOpenEditorLink } from "./editor-link-click.ts";

const primaryClick = {
  button: 0,
  ctrlKey: false,
  metaKey: false,
};

describe("editor link click policy", () => {
  test("opens on plain primary click while editing by default", () => {
    expect(shouldOpenEditorLink(primaryClick, true)).toBe(true);
    expect(shouldOpenEditorLink(primaryClick, true, { requireModifier: false })).toBe(true);
  });

  test("keeps a normal primary click inside an editable document when requireModifier", () => {
    expect(shouldOpenEditorLink(primaryClick, true, { requireModifier: true })).toBe(false);
  });

  test("opens an editable link with Ctrl-click when requireModifier", () => {
    expect(shouldOpenEditorLink({ ...primaryClick, ctrlKey: true }, true, { requireModifier: true })).toBe(true);
  });

  test("opens an editable link with Command-click when requireModifier", () => {
    expect(shouldOpenEditorLink({ ...primaryClick, metaKey: true }, true, { requireModifier: true })).toBe(true);
  });

  test("opens a link normally in a read-only document even with requireModifier", () => {
    expect(shouldOpenEditorLink(primaryClick, false, { requireModifier: true })).toBe(true);
  });

  test("does not handle non-primary buttons", () => {
    expect(shouldOpenEditorLink({ ...primaryClick, button: 1 }, false)).toBe(false);
    expect(shouldOpenEditorLink({ ...primaryClick, button: 1 }, true, { requireModifier: true })).toBe(false);
  });
});
