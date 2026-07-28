import type { TFunction } from "i18next";
export { copyTextToClipboard } from "@/lib/clipboard";

export const ALL_TOKEN_SCOPES = [
  "read:notebooks",
  "write:notebooks",
  "read:memos",
  "write:memos",
  "read:resources",
  "write:resources",
  "read:tags",
  "write:tags",
];

export const getTokenScopeLabel = (scope: string, t: TFunction) => t(`mcp.scopes.${scope}`, { defaultValue: scope });

export const getMcpRemoteServerUrl = () => {
  if (typeof window === "undefined") {
    return "/mcp";
  }

  return `${window.location.origin}/mcp`;
};

export const getEdgeEverBaseUrl = () => {
  if (typeof window === "undefined") {
    return "https://your-domain.example";
  }

  return window.location.origin;
};

export const buildMcpRemoteConfig = (token: string) =>
  JSON.stringify(
    {
      mcpServers: {
        edgeever: {
          url: getMcpRemoteServerUrl(),
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      },
    },
    null,
    2
  );
