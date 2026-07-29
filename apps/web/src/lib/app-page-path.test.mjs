import { describe, expect, test } from "bun:test";
import {
  getAppEntryPath,
  getAppPagePath,
  getMessageTargetOrigin,
} from "./app-page-path.ts";

describe("app page paths", () => {
  test("uses root paths for web builds", () => {
    expect(getAppPagePath("note-print.html", "/")).toBe("/note-print.html");
    expect(getAppPagePath("/mobile-edit.html", "/")).toBe("/mobile-edit.html");
    expect(getAppEntryPath("/")).toBe("/");
  });

  test("uses sibling files for packaged desktop builds", () => {
    expect(getAppPagePath("note-print.html", "./")).toBe("./note-print.html");
    expect(getAppPagePath("/mobile-edit.html", "./")).toBe("./mobile-edit.html");
    expect(getAppEntryPath("./")).toBe("./index.html");
  });

  test("uses a wildcard target only for opaque file origins", () => {
    expect(getMessageTargetOrigin("https://notes.example.com")).toBe("https://notes.example.com");
    expect(getMessageTargetOrigin("null")).toBe("*");
  });
});
