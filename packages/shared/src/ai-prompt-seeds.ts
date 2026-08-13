import type {
  AiAction,
  AiPromptParameterKind,
  AiPromptResultMode,
} from "./ai-assistant";

export type AiPromptSeedKey = Exclude<AiAction, "custom">;
export type AiPromptSeedLocale = "zh-CN" | "en-US";

export type AiPromptSeedTranslation = {
  name: string;
  description: string;
  instruction: string;
};

/** Factory prompt metadata. The top-level text is the Simplified Chinese fallback for legacy callers. */
export type AiPromptSeed = AiPromptSeedTranslation & {
  key: AiPromptSeedKey;
  action: AiPromptSeedKey;
  parameterKind: AiPromptParameterKind;
  resultMode: AiPromptResultMode;
  translations: Record<AiPromptSeedLocale, AiPromptSeedTranslation>;
};

const seed = (
  metadata: Omit<AiPromptSeed, keyof AiPromptSeedTranslation | "translations">,
  zhCN: AiPromptSeedTranslation,
  enUS: AiPromptSeedTranslation,
): AiPromptSeed => ({
  ...metadata,
  ...zhCN,
  translations: { "zh-CN": zhCN, "en-US": enUS },
});

export const normalizeAiPromptSeedLocale = (locale: string | null | undefined): AiPromptSeedLocale =>
  locale?.toLowerCase().startsWith("en") ? "en-US" : "zh-CN";

export const localizeAiPromptSeed = (
  promptSeed: AiPromptSeed,
  locale: string | null | undefined,
): AiPromptSeedTranslation => promptSeed.translations[normalizeAiPromptSeedLocale(locale)];

/** Deterministic id for a seeded default prompt in a workspace. */
export const defaultAiPromptId = (workspaceId: string, seedKey: string) =>
  `${workspaceId}_aiprompt_${seedKey}`;

/** Parse legacy deterministic ids. New code should use the persisted seedKey field instead. */
export const parseDefaultAiPromptKey = (promptId: string): AiPromptSeedKey | null => {
  const match = /_aiprompt_([a-z0-9-]+)$/i.exec(promptId);
  if (!match) return null;
  const key = match[1] as AiPromptSeedKey;
  return DEFAULT_AI_PROMPT_SEEDS.some((item) => item.key === key) ? key : null;
};

/**
 * Single application catalog for default prompt behavior and localized copy.
 * Persisted rows only contain user overrides; untouched defaults are materialized from this catalog.
 */
export const DEFAULT_AI_PROMPT_SEEDS: readonly AiPromptSeed[] = [
  seed(
    { key: "summarize", action: "summarize", parameterKind: "none", resultMode: "append" },
    {
      name: "总结",
      description: "压缩全文，提炼主题、结论与可执行结果",
      instruction: [
        "对笔记做真正的精简总结，不要逐句改写、同义复述或回声式重写。",
        "识别中心主题、主要主张、关键结论与可执行结果。",
        "省略重复、修辞、举例、引语和次要细节，除非它们对理解关键结论必不可少。",
        "较长笔记目标约为原文 20–30% 篇幅，用 3–7 条简洁 Markdown 要点；短笔记用 1–3 句即可。",
        "不要大段照搬原文，也不要添加原文没有的信息。",
        "保持笔记原语言，只返回 Markdown 总结。",
      ].join(""),
    },
    {
      name: "Summarize",
      description: "Condense the note into its topic, conclusions, and actionable outcomes",
      instruction: [
        "Create a genuinely condensed summary of the note rather than rewriting, paraphrasing line by line, or echoing it. ",
        "Identify the central topic, main claims, essential conclusions, and actionable outcomes. ",
        "Omit repetition, rhetorical phrasing, examples, quotations, and minor details unless necessary to understand a key conclusion. ",
        "For a substantial note, target roughly 20–30% of the source length and use 3–7 concise Markdown bullet points; for a short note, use 1–3 concise sentences. ",
        "Do not reproduce long passages verbatim or add facts that are not present in the source. ",
        "Preserve the note's language and return only the summary in Markdown.",
      ].join(""),
    },
  ),
  seed(
    { key: "extract-key-points", action: "extract-key-points", parameterKind: "none", resultMode: "append" },
    {
      name: "提炼要点",
      description: "提取最重要观点，输出简洁要点列表",
      instruction: "提取笔记中最重要的要点，用简洁的 Markdown 列表输出。保持原语言，不要添加原文没有的信息。",
    },
    {
      name: "Key points",
      description: "Extract the most important ideas as a concise list",
      instruction: "Extract the note's most important points as a concise Markdown bullet list. Preserve its language and do not add information that is not present in the note.",
    },
  ),
  seed(
    { key: "extract-todos", action: "extract-todos", parameterKind: "none", resultMode: "append" },
    {
      name: "提取待办",
      description: "识别可执行任务，生成任务清单",
      instruction: "从笔记中提取明确或隐含的可执行任务，用 Markdown 任务列表（- [ ]）输出。保持原语言，不要编造任务。若没有可执行事项，用原文语言简短说明。",
    },
    {
      name: "Extract tasks",
      description: "Identify actionable work and produce a task list",
      instruction: "Extract explicit or implied actionable tasks from the note as a Markdown task list using '- [ ]'. Preserve its language and do not invent tasks. If there are no actionable tasks, say so briefly in the note's language.",
    },
  ),
  seed(
    { key: "rewrite-proofread", action: "rewrite-proofread", parameterKind: "none", resultMode: "both" },
    {
      name: "改写与校对",
      description: "润色全文并校对语法、标点与结构",
      instruction: "改写并校对完整笔记。修正拼写、语法、标点、清晰度与结构，不改变原意。保持原语言与 Markdown 格式。只返回完整修订稿。",
    },
    {
      name: "Rewrite & proofread",
      description: "Polish the complete note and correct language and structure",
      instruction: "Rewrite and proofread the complete note. Correct spelling, grammar, punctuation, clarity, and structure without changing its meaning. Preserve its language and Markdown formatting. Return the complete revised note only.",
    },
  ),
  seed(
    { key: "translate", action: "translate", parameterKind: "target-language", resultMode: "both" },
    {
      name: "翻译",
      description: "翻译为指定目标语言，保留结构与格式",
      instruction: "将完整笔记翻译成用户指定的目标语言。保留原意、Markdown 结构、链接与代码块。只返回译文，不要评论。",
    },
    {
      name: "Translate",
      description: "Translate into a selected language while preserving formatting",
      instruction: "Translate the complete note into the target language specified by the user. Preserve its meaning, Markdown structure, links, and code blocks. Return only the translated note without commentary.",
    },
  ),
  seed(
    { key: "improve-writing", action: "improve-writing", parameterKind: "none", resultMode: "both" },
    {
      name: "改进表达",
      description: "提升表达清晰度与流畅度",
      instruction: "改进文字的清晰度、流畅度与用词，不改变原意。保持原语言与有用的 Markdown 格式。只返回改进后的内容。",
    },
    {
      name: "Improve writing",
      description: "Improve clarity, flow, and word choice",
      instruction: "Improve the writing for clarity, flow, and word choice without changing its meaning. Preserve its language and useful Markdown formatting. Return only the improved content.",
    },
  ),
  seed(
    { key: "fix-spelling-grammar", action: "fix-spelling-grammar", parameterKind: "none", resultMode: "both" },
    {
      name: "修正错别字与语法",
      description: "只修正错别字、语法与标点",
      instruction: "只修正拼写、语法与标点。不要改变语气、结构或含义。保持原语言与 Markdown 格式。只返回修正后的内容。",
    },
    {
      name: "Fix spelling & grammar",
      description: "Correct spelling, grammar, and punctuation only",
      instruction: "Correct spelling, grammar, and punctuation only. Do not change the voice, structure, or meaning. Preserve its language and Markdown formatting. Return only the corrected content.",
    },
  ),
  seed(
    { key: "make-shorter", action: "make-shorter", parameterKind: "none", resultMode: "both" },
    {
      name: "缩短内容",
      description: "删减冗余，保留关键事实",
      instruction: "把内容改写得更简洁。去掉重复与废话，保留每一个重要事实。保持原语言与有用的 Markdown 格式。只返回缩短后的内容。",
    },
    {
      name: "Make shorter",
      description: "Remove repetition while preserving important facts",
      instruction: "Rewrite the content more concisely. Remove repetition and filler while preserving every important fact. Preserve its language and useful Markdown formatting. Return only the shortened content.",
    },
  ),
  seed(
    { key: "make-longer", action: "make-longer", parameterKind: "none", resultMode: "both" },
    {
      name: "扩写内容",
      description: "在不编造事实的前提下扩写说明",
      instruction: "扩写内容，补充有用的说明与更顺畅的过渡，但不要编造事实。保持原语言与有用的 Markdown 格式。只返回扩写后的内容。",
    },
    {
      name: "Make longer",
      description: "Expand the explanation without inventing facts",
      instruction: "Expand the content with useful explanation and smoother transitions, but do not invent facts. Preserve its language and useful Markdown formatting. Return only the expanded content.",
    },
  ),
  seed(
    { key: "simplify-language", action: "simplify-language", parameterKind: "none", resultMode: "both" },
    {
      name: "简化表达",
      description: "用更通俗易懂的语言改写",
      instruction: "用清晰、平实、更好懂的语言改写内容。保持原意、原语言与有用的 Markdown 格式。只返回简化后的内容。",
    },
    {
      name: "Simplify language",
      description: "Rewrite in clearer, easier-to-understand language",
      instruction: "Rewrite the content in clear, plain language that is easier to understand. Preserve its meaning, language, and useful Markdown formatting. Return only the simplified content.",
    },
  ),
  seed(
    { key: "change-tone", action: "change-tone", parameterKind: "tone", resultMode: "both" },
    {
      name: "改变语气",
      description: "按指定语气重写，不改变含义",
      instruction: "按用户指定的语气重写内容，不改变原意。保持原语言与有用的 Markdown 格式。只返回改写后的内容。",
    },
    {
      name: "Change tone",
      description: "Rewrite in a selected tone without changing the meaning",
      instruction: "Rewrite the content in the tone specified by the user without changing its meaning. Preserve its language and useful Markdown formatting. Return only the rewritten content.",
    },
  ),
  seed(
    { key: "continue-writing", action: "continue-writing", parameterKind: "none", resultMode: "append" },
    {
      name: "继续写作",
      description: "从笔记末尾自然续写",
      instruction: "从笔记结束处自然续写。只返回新增续写内容，不要重复原文。保持原语言与 Markdown 风格。",
    },
    {
      name: "Continue writing",
      description: "Continue naturally from the end of the note",
      instruction: "Continue writing naturally from where the note ends. Return only the new continuation, not the original content. Preserve its language and Markdown style.",
    },
  ),
];

export const getDefaultAiPromptSeed = (key: string) =>
  DEFAULT_AI_PROMPT_SEEDS.find((item) => item.key === key) ?? null;
