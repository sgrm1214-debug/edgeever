import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import type { createEdgeEverClient } from "@edgeever/client";
import type { MemoDetail } from "@edgeever/shared";
import {
  getMobileSyncRetryDelay,
  listMobileSyncQueueItems,
  loadMobileSyncQueueSummary,
  syncMobileQueuedChanges,
  type MobileSyncQueueItem,
} from "../lib/sync-queue";
import { replaceLocalMemoId, upsertLocalMemo } from "../lib/local-mirror";

type MobileClient = ReturnType<typeof createEdgeEverClient>;

export const useMobileAutomaticSync = ({
  client,
  dataScope,
  onMemoIdRemapped,
  syncQueueScope,
}: {
  client: MobileClient | null;
  dataScope: string;
  onMemoIdRemapped: (temporaryId: string, memo: MemoDetail) => void;
  syncQueueScope: string;
}) => {
  const queryClient = useQueryClient();
  const [syncQueueItems, setSyncQueueItems] = useState<MobileSyncQueueItem[]>([]);
  const runningRef = useRef(false);
  const requestedRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runRef = useRef<() => Promise<void>>(async () => undefined);

  const refreshSyncQueueItems = useCallback(async () => {
    const items = await listMobileSyncQueueItems(syncQueueScope);
    setSyncQueueItems(items);
    return items;
  }, [syncQueueScope]);

  const invalidateSyncedWorkspace = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["mobile", "notebooks"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memos"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "search"] }),
      queryClient.invalidateQueries({ queryKey: ["mobile", "memo"] }),
    ]);
  }, [queryClient]);

  const runAutomaticSync = useCallback(async () => {
    if (!client) {
      return;
    }

    if (runningRef.current) {
      requestedRef.current = true;
      return;
    }

    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    runningRef.current = true;

    try {
      const summary = await loadMobileSyncQueueSummary(syncQueueScope);
      if (summary.pending + summary.error + summary.syncing === 0) {
        return;
      }

      await syncMobileQueuedChanges(client, syncQueueScope, {
        onSynced: async (memo, item) => {
          if (item.kind === "memo.create") {
            await replaceLocalMemoId(dataScope, item.memoId, memo);
            onMemoIdRemapped(item.memoId, memo);
          } else {
            await upsertLocalMemo(dataScope, memo);
          }
          queryClient.setQueryData(["mobile", "memo", "notebook", memo.id], { memo });
          queryClient.setQueryData(["mobile", "memo", "trash", memo.id], { memo });
        },
      });

      const nextSummary = await loadMobileSyncQueueSummary(syncQueueScope);
      if (nextSummary.total === 0) {
        await invalidateSyncedWorkspace();
      }
    } catch {
      // Queue metadata remains durable; the scheduled pass resumes it.
    } finally {
      await refreshSyncQueueItems();
      runningRef.current = false;

      if (requestedRef.current) {
        requestedRef.current = false;
        void runRef.current();
        return;
      }

      const retryDelay = await getMobileSyncRetryDelay(syncQueueScope);
      if (retryDelay !== null) {
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          void runRef.current();
        }, retryDelay);
      }
    }
  }, [client, dataScope, invalidateSyncedWorkspace, onMemoIdRemapped, queryClient, refreshSyncQueueItems, syncQueueScope]);

  runRef.current = runAutomaticSync;

  useEffect(() => {
    if (!client) {
      return;
    }

    void runRef.current();

    const subscription = AppState.addEventListener("change", (nextState: AppStateStatus) => {
      if (nextState === "active") {
        void runRef.current();
      }
    });

    return () => {
      subscription.remove();
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [client, syncQueueScope]);

  return {
    refreshSyncQueueItems,
    runAutomaticSync,
    syncQueueItems,
  };
};
