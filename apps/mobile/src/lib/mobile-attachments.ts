import type { createEdgeEverClient } from "@edgeever/client";
import { docToMarkdown, getResourceIdFromUrl, type TiptapDoc } from "@edgeever/shared";

export type MobileAttachmentTarget = {
  filename: string;
  href: string;
  resourceId: string;
};

type AttachmentClient = Pick<ReturnType<typeof createEdgeEverClient>, "getResourceBlob">;

type MarkdownNodeLike = {
  attributes?: Record<string, unknown>;
  children?: MarkdownNodeLike[];
  content?: string;
  type?: string;
};

const normalizeAttachmentFilename = (label: string, resourceId: string) => {
  const withoutPrefix = label.replace(/^\s*(?:附件[：:]|Attachment:)\s*/i, "").trim();
  const colonParts = withoutPrefix.split(/[：:]\s*/).filter(Boolean);
  const candidate = (colonParts.at(-1) || withoutPrefix)
    .replace(/^[\s📎📄📦📊🗃️🗂️]+/u, "")
    .trim();
  return candidate || resourceId;
};

export const getMobileAttachmentTarget = (href: string, label: string): MobileAttachmentTarget | null => {
  const resourceId = getResourceIdFromUrl(href);
  if (!resourceId) return null;
  return {
    filename: normalizeAttachmentFilename(label, resourceId),
    href,
    resourceId,
  };
};

export const parseMobileAttachmentTargetJson = (value: string): MobileAttachmentTarget | null => {
  try {
    const parsed = JSON.parse(value) as Partial<MobileAttachmentTarget>;
    if (typeof parsed.href !== "string" || typeof parsed.filename !== "string") return null;
    const resourceId = getResourceIdFromUrl(parsed.href);
    if (!resourceId || (parsed.resourceId && parsed.resourceId !== resourceId)) return null;
    return { filename: parsed.filename, href: parsed.href, resourceId };
  } catch {
    return null;
  }
};

const getMarkdownNodeText = (node: MarkdownNodeLike): string =>
  typeof node.content === "string"
    ? node.content
    : (node.children ?? []).map(getMarkdownNodeText).join("");

export const getParagraphAttachmentTarget = (node: MarkdownNodeLike): MobileAttachmentTarget | null => {
  if (node.type !== "paragraph") return null;
  const children = node.children ?? [];
  const links = children.filter((child) => child.type === "link");
  if (links.length !== 1) return null;

  const nonLinkText = children
    .filter((child) => child.type !== "link")
    .map(getMarkdownNodeText)
    .join("")
    .trim();
  if (nonLinkText && !/^(?:附件[：:]?|Attachment:?)$/i.test(nonLinkText)) return null;

  const link = links[0];
  const href = typeof link.attributes?.href === "string" ? link.attributes.href : "";
  return getMobileAttachmentTarget(href, getMarkdownNodeText(link));
};

const hasResourceLinkMark = (value: unknown, resourceId: string) =>
  Array.isArray(value) && value.some((mark) => {
    if (!mark || typeof mark !== "object") return false;
    const candidate = mark as { attrs?: { href?: unknown }; type?: unknown };
    return candidate.type === "link" &&
      typeof candidate.attrs?.href === "string" &&
      getResourceIdFromUrl(candidate.attrs.href) === resourceId;
  });

const updateAttachmentDoc = (
  doc: TiptapDoc,
  target: MobileAttachmentTarget,
  action: { type: "delete" } | { type: "rename"; filename: string; labelPrefix: string }
): TiptapDoc => {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(visit).filter((child) => child !== null);
    }
    if (!value || typeof value !== "object") return value;

    const node = value as Record<string, unknown>;
    if (node.type === "text" && hasResourceLinkMark(node.marks, target.resourceId)) {
      if (action.type === "delete") return null;
      return { ...node, text: `${action.labelPrefix}${action.filename}` };
    }

    const next = Object.fromEntries(Object.entries(node).map(([key, child]) => [key, key === "content" ? visit(child) : child]));
    if (action.type === "delete" && next.type === "paragraph" && Array.isArray(next.content)) {
      const remainingText = next.content
        .map((child) => child && typeof child === "object" && "text" in child ? String(child.text ?? "") : "")
        .join("")
        .trim();
      if (next.content.length === 0 || /^(?:附件[：:]?|Attachment:?)$/i.test(remainingText)) return null;
    }
    return next;
  };

  const updated = visit(doc) as TiptapDoc;
  return Array.isArray(updated.content) && updated.content.length > 0
    ? updated
    : { type: "doc", content: [{ type: "paragraph" }] };
};

export const renameMobileAttachmentInDoc = (
  doc: TiptapDoc,
  target: MobileAttachmentTarget,
  filename: string,
  labelPrefix: string
) => updateAttachmentDoc(doc, target, { type: "rename", filename, labelPrefix });

export const deleteMobileAttachmentFromDoc = (doc: TiptapDoc, target: MobileAttachmentTarget) =>
  updateAttachmentDoc(doc, target, { type: "delete" });

export const getMobileAttachmentUpdatePayload = (contentJson: TiptapDoc) => ({
  contentJson,
  contentMarkdown: docToMarkdown(contentJson),
});

const safeCacheFilename = (filename: string) =>
  filename.trim().replace(/[\\/]/g, "-").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 160) || "attachment";

export const openMobileAttachment = async (client: AttachmentClient, target: MobileAttachmentTarget) => {
  const [{ Directory, File, Paths }, Sharing] = await Promise.all([
    import("expo-file-system"),
    import("expo-sharing"),
  ]);
  // The DOM editor resolves relative links against the instance URL for display.
  // The client itself prefixes the instance base URL, so always give it the
  // canonical relative resource path here.
  const blob = await client.getResourceBlob(`/api/v1/resources/${encodeURIComponent(target.resourceId)}/blob`);
  const directory = new Directory(Paths.cache, "edgeever-attachments");
  if (!directory.exists) directory.create({ idempotent: true, intermediates: true });
  const file = new File(directory, `${target.resourceId}-${safeCacheFilename(target.filename)}`);
  if (file.exists) file.delete();
  file.create({ overwrite: true, intermediates: true });
  file.write(new Uint8Array(await blob.arrayBuffer()));

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("当前设备无法打开系统文件面板");
  }
  await Sharing.shareAsync(file.uri, {
    dialogTitle: target.filename,
    mimeType: blob.type || "application/octet-stream",
  });
  return file.uri;
};
