const normalizePageName = (pageName: string) => pageName.replace(/^\/+/, "");

export const getAppPagePath = (pageName: string, baseUrl: string) =>
  `${baseUrl}${normalizePageName(pageName)}`;

export const getAppEntryPath = (baseUrl: string) =>
  baseUrl.startsWith(".") ? `${baseUrl}index.html` : baseUrl;

export const getMessageTargetOrigin = (origin: string) =>
  origin === "null" ? "*" : origin;
