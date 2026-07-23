import { describe, expect, test } from "bun:test";
import { countMemoCharacters, docToMarkdown, markdownToDoc, resolveMemoContentDoc } from "./content.ts";

describe("memo character count", () => {
  test("counts punctuation while excluding whitespace and formatting", () => {
    const doc = markdownToDoc("你好， **EdgeEver**!\n\n下一行");

    expect(countMemoCharacters(doc)).toBe(15);
  });

  test("counts grapheme clusters and ignores image labels", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "e\u0301 👨‍👩‍👧‍👦" }] },
        { type: "image", attrs: { alt: "不计入" } },
      ],
    };

    expect(countMemoCharacters(doc)).toBe(2);
  });
});

describe("Markdown table conversion", () => {
  const markdown = [
    "| Name | Status |",
    "| --- | --- |",
    "| Editor | Ready |",
    "| Mobile | Planned |",
  ].join("\n");

  test("parses a GFM table into TipTap nodes", () => {
    const doc = markdownToDoc(markdown);

    expect(doc.content).toHaveLength(1);
    expect(doc.content[0]?.type).toBe("table");
    expect(doc.content[0]?.content?.[0]?.type).toBe("tableRow");
    expect(doc.content[0]?.content?.[0]?.content?.[0]?.type).toBe("tableHeader");
    expect(doc.content[0]?.content?.[1]?.content?.[0]?.type).toBe("tableCell");
  });

  test("preserves table values through a Markdown round trip", () => {
    const serialized = docToMarkdown(markdownToDoc(markdown));
    const reparsed = markdownToDoc(serialized);

    expect(serialized).toContain("| Name");
    expect(serialized).toContain("| Editor");
    expect(reparsed).toEqual(markdownToDoc(markdown));
  });

  test("recovers a table omitted by an older JSON schema", () => {
    const legacyDoc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Legacy note" }] }],
    };

    expect(resolveMemoContentDoc(legacyDoc, markdown).content[0]?.type).toBe("table");
    expect(resolveMemoContentDoc(legacyDoc, "Legacy note")).toBe(legacyDoc);
  });
});

describe("Mermaid Markdown conversion", () => {
  const markdown = "```mermaid\nflowchart LR\n  A --> B\n```";

  test("preserves Mermaid fenced code blocks through a Markdown round trip", () => {
    const doc = markdownToDoc(markdown);

    expect(doc.content[0]).toMatchObject({
      type: "codeBlock",
      attrs: { language: "mermaid" },
    });
    expect(docToMarkdown(doc)).toBe(markdown);
  });
});
