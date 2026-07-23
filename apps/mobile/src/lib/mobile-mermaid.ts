export const getMobileMarkdownFenceLanguage = (sourceInfo: unknown) =>
  typeof sourceInfo === "string" ? sourceInfo.trim().split(/\s+/)[0]?.toLowerCase() ?? "" : "";

export const trimMobileMarkdownFenceContent = (content: string) =>
  content.endsWith("\n") ? content.slice(0, -1) : content;

export const getMermaidSvgAspectRatio = (svg: string) => {
  const viewBox = /viewBox=["']\s*[-\d.]+\s+[-\d.]+\s+([\d.]+)\s+([\d.]+)\s*["']/i.exec(svg);
  const width = Number(viewBox?.[1]);
  const height = Number(viewBox?.[2]);
  return width > 0 && height > 0 ? width / height : 1.6;
};
