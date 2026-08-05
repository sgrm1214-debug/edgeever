import type { createEdgeEverClient } from "@edgeever/client";
import { docToMarkdown, getResourceIdFromUrl, type TiptapDoc } from "@edgeever/shared";

export type MobileResourceTarget = {
  filename: string;
  href: string;
  kind: "attachment" | "image";
  resourceId: string;
};

export type MobileAttachmentTarget = MobileResourceTarget & { kind: "attachment" };
export type MobileImageTarget = MobileResourceTarget & { kind: "image" };

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
    kind: "attachment",
    resourceId,
  };
};

export const getMobileImageTarget = (href: string, label: string): MobileImageTarget | null => {
  const resourceId = getResourceIdFromUrl(href);
  if (!resourceId) return null;
  return {
    filename: label.trim() || `image-${resourceId}`,
    href,
    kind: "image",
    resourceId,
  };
};

export const parseMobileResourceTargetJson = (value: string): MobileResourceTarget | null => {
  try {
    const parsed = JSON.parse(value) as Partial<MobileResourceTarget>;
    if (typeof parsed.href !== "string" || typeof parsed.filename !== "string") return null;
    if (parsed.kind !== "attachment" && parsed.kind !== "image") return null;
    const resourceId = getResourceIdFromUrl(parsed.href);
    if (!resourceId || (parsed.resourceId && parsed.resourceId !== resourceId)) return null;
    return { filename: parsed.filename, href: parsed.href, kind: parsed.kind, resourceId };
  } catch {
    return null;
  }
};

export const parseMobileAttachmentTargetJson = (value: string): MobileAttachmentTarget | null => {
  const target = parseMobileResourceTargetJson(value);
  return target?.kind === "attachment" ? { ...target, kind: "attachment" } : null;
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

const updateResourceDoc = (
  doc: TiptapDoc,
  target: MobileResourceTarget,
  action: { type: "delete" } | { type: "rename"; filename: string; labelPrefix: string }
): TiptapDoc => {
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) {
      return value.map(visit).filter((child) => child !== null);
    }
    if (!value || typeof value !== "object") return value;

    const node = value as Record<string, unknown>;
    if (target.kind === "image" && node.type === "image") {
      const attrs = node.attrs && typeof node.attrs === "object" ? node.attrs as Record<string, unknown> : {};
      const source = typeof attrs.src === "string" ? attrs.src : "";
      if (getResourceIdFromUrl(source) === target.resourceId) {
        if (action.type === "delete") return null;
        return { ...node, attrs: { ...attrs, alt: action.filename, title: action.filename } };
      }
    }
    if (target.kind === "attachment" && node.type === "text" && hasResourceLinkMark(node.marks, target.resourceId)) {
      if (action.type === "delete") return null;
      return { ...node, text: `${action.labelPrefix}${action.filename}` };
    }

    const next = Object.fromEntries(Object.entries(node).map(([key, child]) => [key, key === "content" ? visit(child) : child]));
    if (target.kind === "attachment" && action.type === "delete" && next.type === "paragraph" && Array.isArray(next.content)) {
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
) => updateResourceDoc(doc, target, { type: "rename", filename, labelPrefix });

export const deleteMobileAttachmentFromDoc = (doc: TiptapDoc, target: MobileAttachmentTarget) =>
  updateResourceDoc(doc, target, { type: "delete" });

export const renameMobileResourceInDoc = (
  doc: TiptapDoc,
  target: MobileResourceTarget,
  filename: string,
  labelPrefix: string
) => updateResourceDoc(doc, target, { type: "rename", filename, labelPrefix });

export const deleteMobileResourceFromDoc = (doc: TiptapDoc, target: MobileResourceTarget) =>
  updateResourceDoc(doc, target, { type: "delete" });

export const getMobileAttachmentUpdatePayload = (contentJson: TiptapDoc) => ({
  contentJson,
  contentMarkdown: docToMarkdown(contentJson),
});

export const getMobileResourceUpdatePayload = getMobileAttachmentUpdatePayload;

const safeCacheFilename = (filename: string) =>
  filename.trim().replace(/[\\/]/g, "-").replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 160) || "attachment";

const cacheMobileResource = async (client: AttachmentClient, target: MobileResourceTarget) => {
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

  return { blob, file, Sharing };
};

export const openMobileResource = async (client: AttachmentClient, target: MobileResourceTarget) => {
  const { blob, file, Sharing } = await cacheMobileResource(client, target);

  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("当前设备无法打开系统文件面板");
  }
  await Sharing.shareAsync(file.uri, {
    dialogTitle: target.filename,
    mimeType: blob.type || "application/octet-stream",
  });
  return file.uri;
};

export const saveMobileResourceAs = async (client: AttachmentClient, target: MobileResourceTarget) => {
  const { blob, file, Sharing } = await cacheMobileResource(client, target);
  const { Platform } = await import("react-native");
  if (Platform.OS === "android") {
    const FileSystem = await import("expo-file-system/legacy");
    const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) return null;
    const destination = await FileSystem.StorageAccessFramework.createFileAsync(
      permission.directoryUri,
      target.filename,
      blob.type || "application/octet-stream"
    );
    await FileSystem.StorageAccessFramework.writeAsStringAsync(destination, await file.base64(), {
      encoding: FileSystem.EncodingType.Base64,
    });
    return destination;
  }
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error("当前设备无法打开系统导出面板");
  }
  await Sharing.shareAsync(file.uri, {
    dialogTitle: `导出 ${target.filename}`,
    mimeType: blob.type || "application/octet-stream",
  });
  return file.uri;
};

export const openMobileAttachment = openMobileResource;
