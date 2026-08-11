import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy, KeyRound, Plus, ShieldCheck, Trash2 } from "lucide-react";
import type { ApiToken } from "@edgeever/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { api } from "@/lib/api";
import { cn, formatDateTime } from "@/lib/utils";
import { AppConfirmDialog } from "@/components/dialogs/ConfirmDialogs";
import {
  ALL_TOKEN_SCOPES,
  buildMcpRemoteConfig,
  copyTextToClipboard,
  createDefaultTokenName,
  DEFAULT_TOKEN_ACCESS_LEVEL,
  getEdgeEverBaseUrl,
  getStoredTokenAccessLevel,
  getTokenScopesForAccessLevel,
  getTokenScopeLabel,
  type TokenAccessLevel,
} from "./settings-utils";

const McpTitleWithHelp = () => {
  const { t } = useTranslation();
  const baseUrl = getEdgeEverBaseUrl();
  const [copied, setCopied] = useState(false);
  const remoteExample = JSON.stringify(
    {
      mcpServers: {
        edgeever: {
          url: `${baseUrl}/mcp`,
          headers: {
            Authorization: t("mcp.bearerPlaceholder"),
          },
        },
      },
    },
    null,
    2
  );

  const handleCopy = async () => {
    if (!(await copyTextToClipboard(remoteExample))) {
      return;
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="w-fit max-w-full">
      <CardTitle className="flex items-center gap-2 text-sm">
        <KeyRound className="h-4 w-4 text-emerald-700" />
        {t("mcp.title")}
        <Dialog>
          <DialogTrigger asChild>
            <Button size="sm" variant="outline" className="h-7 bg-white px-2.5 text-xs" type="button">
              {t("mcp.example")}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl gap-3 p-4 sm:p-5">
            <DialogHeader>
              <DialogTitle className="text-base">{t("mcp.exampleTitle")}</DialogTitle>
            </DialogHeader>
            <pre className="max-h-[55vh] overflow-auto rounded-md border border-slate-100 bg-slate-950 p-3 text-left text-[11px] leading-5 text-slate-100 sm:text-xs">
              <code>{remoteExample}</code>
            </pre>
            <div className="flex justify-end">
              <Button
                size="md"
                variant="solid"
                className="bg-emerald-600 text-white hover:bg-emerald-700"
                type="button"
                onClick={() => void handleCopy()}
              >
                <Copy className="h-3.5 w-3.5" />
                {copied ? t("common.copied") : t("mcp.copyExample")}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </CardTitle>
    </div>
  );
};

interface AccessLevelPickerProps {
  value: TokenAccessLevel;
  onChange: (accessLevel: TokenAccessLevel) => void;
}

const AccessLevelPicker = ({ value, onChange }: AccessLevelPickerProps) => {
  const { t } = useTranslation();
  const options: TokenAccessLevel[] = ["full", "read-only"];

  return (
    <div className="flex min-h-11 flex-wrap items-center justify-between gap-2 border-y border-slate-100 py-2">
      <span id="token-access-level-label" className="text-xs font-semibold text-slate-700">
        {t("mcp.accessLevelTitle")}
      </span>
      <TooltipProvider>
        <div
          role="radiogroup"
          aria-labelledby="token-access-level-label"
          className="inline-flex rounded-lg bg-slate-100 p-1"
        >
          {options.map((option) => {
            const checked = value === option;
            const inputId = `token-access-${option}`;

            return (
              <Tooltip key={option}>
                <TooltipTrigger asChild>
                  <label
                    htmlFor={inputId}
                    className={cn(
                      "flex h-7 cursor-pointer items-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors focus-within:ring-2 focus-within:ring-emerald-500/40",
                      checked
                        ? "bg-white text-emerald-700 shadow-sm"
                        : "text-slate-500 hover:text-slate-700",
                    )}
                  >
                    <input
                      id={inputId}
                      className="sr-only"
                      type="radio"
                      name="token-access-level"
                      value={option}
                      checked={checked}
                      onChange={() => onChange(option)}
                    />
                    <span
                      aria-hidden="true"
                      className={cn("h-1.5 w-1.5 rounded-full", checked ? "bg-emerald-500" : "bg-slate-300")}
                    />
                    {t(`mcp.accessLevels.${option}.label`)}
                  </label>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-72 leading-4">
                  {t(`mcp.accessLevels.${option}.description`)}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </div>
      </TooltipProvider>
    </div>
  );
};

interface TokenListProps {
  tokens: ApiToken[];
  availableScopes: string[];
  newlyCreatedTokenId: string | null;
  isLoading: boolean;
  isDeleting: boolean;
  onDelete: (token: ApiToken) => void;
}

const TokenList = ({ tokens, availableScopes, newlyCreatedTokenId, isLoading, isDeleting, onDelete }: TokenListProps) => {
  const { t } = useTranslation();
  const [copiedAction, setCopiedAction] = useState<{ tokenId: string; action: "token" | "config" } | null>(null);

  const handleCopy = async (token: ApiToken, action: "token" | "config") => {
    if (!token.token) {
      return;
    }

    const value = action === "token" ? token.token : buildMcpRemoteConfig(token.token);
    if (!(await copyTextToClipboard(value))) {
      return;
    }

    setCopiedAction({ tokenId: token.id, action });
    window.setTimeout(() => {
      setCopiedAction((current) => (current?.tokenId === token.id && current.action === action ? null : current));
    }, 1600);
  };

  if (isLoading) {
    return (
      <p className="py-4 text-sm text-slate-400">{t("mcp.loadingTokens")}</p>
    );
  }

  if (tokens.length === 0) {
    return <p className="py-4 text-sm text-slate-400">{t("mcp.emptyTokens")}</p>;
  }

  return (
    <div className="divide-y divide-slate-100 border-t border-slate-100">
      {tokens.map((token) => {
        const accessLevel = getStoredTokenAccessLevel(token.scopes, availableScopes);
        const accessLabel = accessLevel === "legacy-custom"
          ? t("mcp.accessLevels.legacy-custom.label")
          : t(`mcp.accessLevels.${accessLevel}.label`);

        return (
          <div
            key={token.id}
            className={cn(
              "flex min-h-16 flex-col items-stretch gap-3 py-3 transition-colors sm:py-4 lg:flex-row lg:items-center",
              token.isRevoked ? "bg-slate-50/50 opacity-60" : "hover:bg-slate-50/50",
              token.id === newlyCreatedTokenId && "edgeever-token-created",
            )}
          >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-bold leading-tight text-slate-900">{token.name}</span>
            {accessLevel === "legacy-custom" ? (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className="mt-2 block w-fit max-w-full truncate rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
                      tabIndex={0}
                    >
                      {accessLabel}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    {token.scopes.map((scope) => getTokenScopeLabel(scope, t)).join(", ")}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span className="mt-2 block w-fit max-w-full truncate rounded-md border border-slate-100 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-500">
                {accessLabel}
              </span>
            )}
            <span className="mt-2 block text-[11px] font-medium text-slate-400">
              {token.lastUsedAt ? t("mcp.lastUsedAt", { time: formatDateTime(token.lastUsedAt) }) : t("mcp.neverUsed")}
              {!token.token ? ` · ${t("mcp.legacyTokenHint")}` : ""}
            </span>
          </span>
          <div className="flex shrink-0 flex-col gap-2 sm:flex-row lg:items-center">
            <Button
              size="sm"
              variant="outline"
              className="h-9 justify-center whitespace-nowrap bg-white px-3 text-xs"
              title={token.token ? t("mcp.copyToken") : t("mcp.legacyTokenCannotCopy")}
              aria-label={token.token ? t("mcp.copyToken") : t("mcp.legacyTokenCannotCopy")}
              disabled={token.isRevoked || !token.token}
              onClick={() => void handleCopy(token, "token")}
            >
              {copiedAction?.tokenId === token.id && copiedAction.action === "token" ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copiedAction?.tokenId === token.id && copiedAction.action === "token" ? t("common.copied") : t("mcp.copyToken")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9 justify-center whitespace-nowrap bg-white px-3 text-xs"
              title={token.token ? t("mcp.copyConfig") : t("mcp.legacyConfigCannotCopy")}
              aria-label={token.token ? t("mcp.copyConfig") : t("mcp.legacyConfigCannotCopy")}
              disabled={token.isRevoked || !token.token}
              onClick={() => void handleCopy(token, "config")}
            >
              {copiedAction?.tokenId === token.id && copiedAction.action === "config" ? (
                <ShieldCheck className="h-3.5 w-3.5" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              {copiedAction?.tokenId === token.id && copiedAction.action === "config" ? t("common.copied") : t("mcp.copyConfig")}
            </Button>
            <Button
              size="icon"
              variant="danger"
              className="h-9 w-full shrink-0 sm:w-9"
              title={t("mcp.deleteToken")}
              aria-label={t("mcp.deleteToken")}
              disabled={isDeleting}
              onClick={() => onDelete(token)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
          </div>
        );
      })}
    </div>
  );
};

export const McpConfigCard = () => {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [name, setName] = useState(() => createDefaultTokenName());
  const [accessLevel, setAccessLevel] = useState<TokenAccessLevel>(DEFAULT_TOKEN_ACCESS_LEVEL);
  const [newlyCreatedTokenId, setNewlyCreatedTokenId] = useState<string | null>(null);
  const [tokenDeleteConfirmation, setTokenDeleteConfirmation] = useState<ApiToken | null>(null);

  const tokensQuery = useQuery({
    queryKey: ["api-tokens"],
    queryFn: () => api.listApiTokens(),
  });

  const availableScopes = tokensQuery.data?.availableScopes ?? ALL_TOKEN_SCOPES;
  const tokens = tokensQuery.data?.apiTokens ?? [];

  const createMutation = useMutation({
    mutationFn: api.createApiToken,
    onSuccess: async (data) => {
      setNewlyCreatedTokenId(data.apiToken.id);
      setName(createDefaultTokenName());
      setAccessLevel(DEFAULT_TOKEN_ACCESS_LEVEL);
      await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });

  const deleteTokenMutation = useMutation({
    mutationFn: api.revokeApiToken,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
    },
  });

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const scopes = getTokenScopesForAccessLevel(accessLevel, availableScopes);

    if (!name.trim()) {
      return;
    }

    createMutation.mutate({ name: name.trim(), scopes });
  };

  return (
    <>
      <Card className="w-full min-w-0 overflow-hidden shadow-none">
        <CardHeader className="p-4">
          <McpTitleWithHelp />
          <CardDescription className="text-xs leading-4">{t("mcp.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 p-4 pt-0">
          <form className="min-w-0 space-y-3" onSubmit={handleSubmit}>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                className="h-9 min-w-0 flex-1 text-xs focus-visible:ring-4 focus-visible:ring-emerald-500/10"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder={t("mcp.namePlaceholder")}
              />
              <Button
                size="md"
                variant="solid"
                className="h-9 w-full whitespace-nowrap bg-emerald-500 text-white hover:bg-emerald-600 sm:w-32"
                type="submit"
                disabled={createMutation.isPending}
              >
                <Plus className="h-4 w-4" />
                {t("mcp.createToken")}
              </Button>
            </div>

            <AccessLevelPicker
              value={accessLevel}
              onChange={setAccessLevel}
            />
          </form>

          <div className="space-y-3">
            <span className="block text-xs font-semibold text-slate-500">{t("mcp.activeTokens")}</span>
            <TokenList
              tokens={tokens}
              availableScopes={availableScopes}
              newlyCreatedTokenId={newlyCreatedTokenId}
              isLoading={tokensQuery.isLoading}
              isDeleting={deleteTokenMutation.isPending}
              onDelete={setTokenDeleteConfirmation}
            />
          </div>
        </CardContent>
      </Card>

      {tokenDeleteConfirmation && (
        <AppConfirmDialog
          title={t("mcp.deleteConfirmTitle", { name: tokenDeleteConfirmation.name })}
          description={t("mcp.deleteConfirmDescription")}
          confirmLabel={t("mcp.deleteConfirmLabel")}
          isWorking={deleteTokenMutation.isPending}
          tone="danger"
          onCancel={() => setTokenDeleteConfirmation(null)}
          onConfirm={() => {
            deleteTokenMutation.mutate(tokenDeleteConfirmation.id, {
              onSuccess: () => setTokenDeleteConfirmation(null),
            });
          }}
        />
      )}
    </>
  );
};
