import { describe, expect, test } from "bun:test";
import {
  deleteMobileAttachmentFromDoc,
  getMobileAttachmentTarget,
  getParagraphAttachmentTarget,
  parseMobileAttachmentTargetJson,
  renameMobileAttachmentInDoc,
} from "./mobile-attachments.ts";

const href = "/api/v1/resources/res_123/blob";
const doc = {
  type: "doc",
  content: [{
    type: "paragraph",
    content: [{
      type: "text",
      text: "附件：report.pdf",
      marks: [{ type: "link", attrs: { href, class: "edgeever-attachment-link" } }],
    }],
  }],
};

describe("mobile attachments", () => {
  test("recognizes resource links and attachment paragraphs", () => {
    expect(getMobileAttachmentTarget(href, "📄 报告：report.pdf")).toEqual({ filename: "report.pdf", href, resourceId: "res_123" });
    expect(getParagraphAttachmentTarget({
      type: "paragraph",
      children: [{ type: "text", content: "附件：" }, { type: "link", attributes: { href }, children: [{ type: "text", content: "report.pdf" }] }],
    })).toEqual({ filename: "report.pdf", href, resourceId: "res_123" });
  });

  test("validates attachment targets received from the DOM editor", () => {
    expect(parseMobileAttachmentTargetJson(JSON.stringify({ filename: "report.pdf", href, resourceId: "res_123" })))
      .toEqual({ filename: "report.pdf", href, resourceId: "res_123" });
    expect(parseMobileAttachmentTargetJson(JSON.stringify({ filename: "report.pdf", href, resourceId: "different" }))).toBeNull();
  });

  test("renames the linked label", () => {
    const updated = renameMobileAttachmentInDoc(doc, { filename: "report.pdf", href, resourceId: "res_123" }, "final.pdf", "附件：");
    expect(updated.content[0].content[0].text).toBe("附件：final.pdf");
  });

  test("removes a standalone attachment paragraph", () => {
    expect(deleteMobileAttachmentFromDoc(doc, { filename: "report.pdf", href, resourceId: "res_123" })).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });
});
