import { describe, expect, test } from "bun:test";
import {
  deleteMobileAttachmentFromDoc,
  deleteMobileResourceFromDoc,
  getMobileAttachmentTarget,
  getMobileImageTarget,
  getParagraphAttachmentTarget,
  parseMobileAttachmentTargetJson,
  parseMobileResourceTargetJson,
  renameMobileAttachmentInDoc,
  renameMobileResourceInDoc,
} from "./mobile-attachments.ts";

const href = "/api/v1/resources/res_123/blob";
const attachmentTarget = { filename: "report.pdf", href, kind: "attachment", resourceId: "res_123" };
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
    expect(getMobileAttachmentTarget(href, "📄 报告：report.pdf")).toEqual(attachmentTarget);
    expect(getParagraphAttachmentTarget({
      type: "paragraph",
      children: [{ type: "text", content: "附件：" }, { type: "link", attributes: { href }, children: [{ type: "text", content: "report.pdf" }] }],
    })).toEqual(attachmentTarget);
  });

  test("validates attachment targets received from the DOM editor", () => {
    expect(parseMobileAttachmentTargetJson(JSON.stringify(attachmentTarget))).toEqual(attachmentTarget);
    expect(parseMobileAttachmentTargetJson(JSON.stringify({ ...attachmentTarget, resourceId: "different" }))).toBeNull();
    expect(parseMobileAttachmentTargetJson(JSON.stringify({ ...attachmentTarget, kind: "image" }))).toBeNull();
  });

  test("renames the linked label", () => {
    const updated = renameMobileAttachmentInDoc(doc, attachmentTarget, "final.pdf", "附件：");
    expect(updated.content[0].content[0].text).toBe("附件：final.pdf");
  });

  test("removes a standalone attachment paragraph", () => {
    expect(deleteMobileAttachmentFromDoc(doc, attachmentTarget)).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });

  test("recognizes and validates image resources", () => {
    const target = { filename: "photo.jpg", href, kind: "image", resourceId: "res_123" };
    expect(getMobileImageTarget(href, "photo.jpg")).toEqual(target);
    expect(parseMobileResourceTargetJson(JSON.stringify(target))).toEqual(target);
    expect(getMobileImageTarget("https://example.com/photo.jpg", "photo.jpg")).toBeNull();
  });

  test("renames and removes image nodes", () => {
    const target = { filename: "photo.jpg", href, kind: "image", resourceId: "res_123" };
    const imageDoc = {
      type: "doc",
      content: [{ type: "image", attrs: { alt: "photo.jpg", src: href, title: null } }],
    };
    expect(renameMobileResourceInDoc(imageDoc, target, "passport.jpg", "附件：")).toEqual({
      type: "doc",
      content: [{ type: "image", attrs: { alt: "passport.jpg", src: href, title: "passport.jpg" } }],
    });
    expect(deleteMobileResourceFromDoc(imageDoc, target)).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }],
    });
  });
});
