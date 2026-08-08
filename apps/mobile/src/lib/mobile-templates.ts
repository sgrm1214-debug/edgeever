import { enUS, zhCN } from "@edgeever/shared/i18n";
import type { MemoTemplate } from "@edgeever/shared";

export type MobileSupportedLocale = "zh-CN" | "en-US";

export type MobileCreateMemoSeed = {
  title: string;
  contentMarkdown: string;
  tagsText: string;
};

export type MobileBuiltInTemplate = {
  id: string;
  title: string;
  description: string;
  contentMarkdown: string;
  tags: string[];
};

export type MobileSelectableTemplate = {
  id: string;
  name: string;
  description: string;
  title: string;
  contentMarkdown: string;
  tags: string[];
  source: "builtin" | "saved";
};

const BUILTIN_TEMPLATE_DEFS = [
  { id: "quick-note", key: "quickNote", tag: "quick-note" },
  { id: "meeting", key: "meeting", tag: "meeting" },
  { id: "weekly-review", key: "weeklyReview", tag: "weekly-review" },
  { id: "reading", key: "reading", tag: "reading" },
  { id: "okr", key: "okr", tag: "okr" },
  { id: "post-mortem", key: "postMortem", tag: "post-mortem" },
] as const;

type BuiltInItemKey = (typeof BUILTIN_TEMPLATE_DEFS)[number]["key"];

const getTemplateCatalog = (locale: MobileSupportedLocale) =>
  (locale === "en-US" ? enUS.templates.items : zhCN.templates.items) as Record<
    BuiltInItemKey,
    { title: string; description: string; contentMarkdown: string }
  >;

export const getMobileBuiltInTemplates = (locale: MobileSupportedLocale): MobileBuiltInTemplate[] => {
  const catalog = getTemplateCatalog(locale);
  return BUILTIN_TEMPLATE_DEFS.map((item) => {
    const content = catalog[item.key];
    return {
      id: item.id,
      title: content.title,
      description: content.description,
      contentMarkdown: content.contentMarkdown,
      tags: ["template", item.tag],
    };
  });
};

export const toMobileSelectableTemplate = (
  template: MobileBuiltInTemplate | MemoTemplate,
  source: "builtin" | "saved"
): MobileSelectableTemplate => {
  if (source === "builtin") {
    const builtIn = template as MobileBuiltInTemplate;
    return {
      id: builtIn.id,
      name: builtIn.title,
      description: builtIn.description,
      title: builtIn.title,
      contentMarkdown: builtIn.contentMarkdown,
      tags: builtIn.tags,
      source,
    };
  }
  const saved = template as MemoTemplate;
  return {
    id: saved.id,
    name: saved.name,
    description: saved.description ?? "",
    title: saved.title ?? saved.name,
    contentMarkdown: saved.contentMarkdown,
    tags: saved.tags,
    source,
  };
};

export const mobileTemplateToCreateSeed = (template: MobileSelectableTemplate): MobileCreateMemoSeed => ({
  title: template.title,
  contentMarkdown: template.contentMarkdown,
  tagsText: template.tags.join(", "),
});

export const createMemoSeedHasContent = (seed: Pick<MobileCreateMemoSeed, "title" | "contentMarkdown" | "tagsText">) =>
  Boolean(seed.title.trim() || seed.contentMarkdown.trim() || seed.tagsText.trim());
