export type WorkspaceRefreshMode = "background" | "manual";
export type WorkspaceMemoView = "notebook" | "trash";

export const BACKGROUND_WORKSPACE_REFRESH_INTERVAL_MS = 30_000;

export const shouldNavigateHomeWhenOpeningMemo = (view: WorkspaceMemoView) => view !== "trash";

export const resolveSyncedMemoId = (
  memoIdMappings: ReadonlyMap<string, string>,
  memoId: string | null,
) => memoId ? memoIdMappings.get(memoId) ?? memoId : null;

export const resolveCreatedMemoSelection = (
  currentMemoId: string | null,
  pendingMemoId: string | null,
  temporaryMemoId: string,
  remoteMemoId: string,
) => currentMemoId === temporaryMemoId || pendingMemoId === temporaryMemoId
  ? remoteMemoId
  : currentMemoId;

export type WorkspaceRefreshResult = {
  changed: number;
  skipped: boolean;
};

export const refreshWorkspaceData = async ({
  mode,
  hasPendingLocalChanges,
  pushLocalChanges,
  pullRemoteChanges,
  invalidateWorkspaceQueries,
}: {
  mode: WorkspaceRefreshMode;
  hasPendingLocalChanges: boolean;
  pushLocalChanges: () => Promise<void>;
  pullRemoteChanges: () => Promise<{ changed: number }>;
  invalidateWorkspaceQueries: () => Promise<void>;
}): Promise<WorkspaceRefreshResult> => {
  if (mode === "background" && hasPendingLocalChanges) {
    return { changed: 0, skipped: true };
  }

  if (mode === "manual") {
    await pushLocalChanges();
  }

  const result = await pullRemoteChanges();

  if (mode === "manual" || result.changed > 0) {
    await invalidateWorkspaceQueries();
  }

  return { changed: result.changed, skipped: false };
};
