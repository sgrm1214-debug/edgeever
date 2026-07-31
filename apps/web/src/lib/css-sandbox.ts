/**
 * 安全的 CSS 过滤器与作用域限制器
 */

const ALLOWED_CSS_PROPERTIES = new Set([
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "line-height",
  "letter-spacing",
  "color",
  "background",
  "background-color",
  "border",
  "border-top",
  "border-right",
  "border-bottom",
  "border-left",
  "border-color",
  "border-width",
  "border-style",
  "border-radius",
  "padding",
  "padding-top",
  "padding-right",
  "padding-bottom",
  "padding-left",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "text-align",
  "text-decoration",
  "text-transform",
  "text-indent",
  "word-break",
  "word-wrap",
  "white-space",
  "list-style",
  "list-style-type",
]);

/**
 * 过滤单行 CSS 规则，仅保留安全的排版属性，阻断 url() 和定位等危险内容
 */
const sanitizeRulesBlock = (block: string): string => {
  return block
    .split(";")
    .map((rule) => {
      const parts = rule.split(":");
      if (parts.length < 2) return "";
      const property = parts[0].trim().toLowerCase();
      const value = parts.slice(1).join(":").trim();

      // 仅允许白名单属性
      if (!ALLOWED_CSS_PROPERTIES.has(property)) {
        return "";
      }

      // 深度拦截潜在危险值 (如 url, expression, javascript)
      if (
        /url\s*\(/i.test(value) ||
        /expression/i.test(value) ||
        /javascript\s*:/i.test(value) ||
        /behavior/i.test(value) ||
        /-moz-binding/i.test(value)
      ) {
        return "";
      }

      return `${property}: ${value};`;
    })
    .filter(Boolean)
    .join(" ");
};

/**
 * 对用户的 CSS 进行安全过滤，并将其作用域限定在当前编辑器的 ProseMirror 区域
 */
export const sanitizeAndScopeCss = (css: string): string => {
  if (!css) return "";

  // 1. 过滤全局危险指令
  let cleaned = css
    .replace(/@import/gi, "")
    .replace(/@charset/gi, "")
    .replace(/@namespace/gi, "");

  // 2. 匹配选择器与大括号块
  const scopePrefix = ".edgeever-editor .ProseMirror ";

  // 匹配形如 selector { rules } 的结构
  cleaned = cleaned.replace(/([^{]+)({[^}]+})/g, (_, selectors, blockContent) => {
    // 提取大括号内部的规则块并过滤
    const rawRules = blockContent.slice(1, -1);
    const safeRules = sanitizeRulesBlock(rawRules);
    if (!safeRules) return "";

    // 给选择器加前缀，限制其影响范围
    const scopedSelectors = selectors
      .split(",")
      .map((s: string) => {
        const trimmed = s.trim();
        if (!trimmed) return "";
        // 若选择器已经有了前缀或特定类，不要重复加
        if (trimmed.startsWith(".ProseMirror") || trimmed.includes(".edgeever-editor")) {
          return trimmed;
        }
        return `${scopePrefix}${trimmed}`;
      })
      .filter(Boolean)
      .join(", ");

    return scopedSelectors ? `${scopedSelectors} { ${safeRules} }` : "";
  });

  return cleaned;
};

/**
 * 动态解析用户的自定义 CSS，并提取出能直接应用于微信/富文本一键复制时的标签样式字典
 */
export const parseCustomCssToStyles = (css: string): Record<string, string> => {
  const stylesMap: Record<string, string> = {};
  if (!css) return stylesMap;

  // 使用简单的正则匹配选择器和规则内容
  const regex = /([^{]+){([^}]+)}/g;
  let match;

  while ((match = regex.exec(css)) !== null) {
    const selectors = match[1].split(",");
    const rawRules = match[2];
    const safeRules = sanitizeRulesBlock(rawRules);

    if (!safeRules) continue;

    selectors.forEach((sel) => {
      const key = sel.trim().toLowerCase();
      // 只提取针对纯标签的简单选择器（如 h1, p, blockquote 等），这样便于直接在微信复制里进行标签内联样式动态覆盖
      if (/^[a-z0-9]+$/i.test(key)) {
        if (stylesMap[key]) {
          stylesMap[key] = `${stylesMap[key]} ${safeRules}`;
        } else {
          stylesMap[key] = safeRules;
        }
      }
    });
  }

  return stylesMap;
};
