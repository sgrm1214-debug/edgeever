import { describe, expect, test } from "bun:test";
import {
  createMemoSeedHasContent,
  getMobileBuiltInTemplates,
  mobileTemplateToCreateSeed,
  toMobileSelectableTemplate,
} from "./mobile-templates";

describe("mobile-templates", () => {
  test("returns built-in templates for both locales", () => {
    const zh = getMobileBuiltInTemplates("zh-CN");
    const en = getMobileBuiltInTemplates("en-US");
    expect(zh.length).toBe(6);
    expect(en.length).toBe(6);
    expect(zh[0]?.title).toBe("灵感速记");
    expect(en[0]?.title).toBe("Quick Spark");
    expect(zh[1]?.contentMarkdown).toContain("会议纪要");
    expect(en[1]?.contentMarkdown).toContain("Meeting Minutes");
  });

  test("maps built-in and saved templates to selectable rows", () => {
    const builtIn = getMobileBuiltInTemplates("zh-CN")[0]!;
    const selectableBuiltIn = toMobileSelectableTemplate(builtIn, "builtin");
    expect(selectableBuiltIn.source).toBe("builtin");
    expect(selectableBuiltIn.name).toBe(builtIn.title);

    const selectableSaved = toMobileSelectableTemplate(
      {
        id: "tpl_1",
        name: "我的周报",
        description: "团队周报",
        title: "【周报】",
        contentJson: { type: "doc", content: [] },
        contentMarkdown: "## 本周",
        tags: ["work", "weekly"],
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      "saved"
    );
    expect(selectableSaved.source).toBe("saved");
    expect(selectableSaved.title).toBe("【周报】");
    expect(mobileTemplateToCreateSeed(selectableSaved)).toEqual({
      title: "【周报】",
      contentMarkdown: "## 本周",
      tagsText: "work, weekly",
    });
  });

  test("detects whether a seed has user content", () => {
    expect(createMemoSeedHasContent({ title: "", contentMarkdown: "", tagsText: "" })).toBe(false);
    expect(createMemoSeedHasContent({ title: "a", contentMarkdown: "", tagsText: "" })).toBe(true);
    expect(createMemoSeedHasContent({ title: "", contentMarkdown: "x", tagsText: "" })).toBe(true);
    expect(createMemoSeedHasContent({ title: "", contentMarkdown: "", tagsText: "tag" })).toBe(true);
  });
});
