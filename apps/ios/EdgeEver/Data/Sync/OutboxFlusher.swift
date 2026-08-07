import Foundation

actor OutboxFlusher {
    private let outbox: SyncOutboxRepository
    private let mirror: LocalMirrorRepository
    private let client: APIClient

    init(outbox: SyncOutboxRepository, mirror: LocalMirrorRepository, client: APIClient) {
        self.outbox = outbox
        self.mirror = mirror
        self.client = client
    }

    func flush(scope: String) async throws -> SyncRunResult {
        var result = SyncRunResult()
        let items = try outbox.flushableItems(scope: scope)
        for item in items {
            result.attempted += 1
            let marked = try outbox.markSyncing(scope: scope, id: item.id, expectedVersion: item.version)
            guard marked else { continue }

            do {
                let memo = try await syncItem(item)
                let removed = try outbox.remove(scope: scope, id: item.id, expectedVersion: item.version)
                if removed {
                    if item.kind == .memoCreate, item.memoId.hasPrefix("local:") {
                        try mirror.replaceLocalMemoId(scope: scope, temporaryId: item.memoId, memo: memo)
                    } else {
                        try mirror.upsertMemo(scope: scope, memo: memo)
                    }
                } else if item.kind == .memoCreate {
                    let promoted = try outbox.promoteCreateToUpdate(
                        scope: scope,
                        createId: item.id,
                        expectedVersion: item.version,
                        memo: memo
                    )
                    if promoted {
                        try mirror.replaceLocalMemoId(scope: scope, temporaryId: item.memoId, memo: memo)
                    } else {
                        // User cancelled while in flight — soft-delete remote orphan.
                        try? await client.deleteMemo(id: memo.id, permanent: false)
                    }
                } else {
                    try outbox.rebaseUpdate(scope: scope, id: item.id, syncedVersion: item.version, memo: memo)
                    try mirror.upsertMemo(scope: scope, memo: memo)
                }
                result.synced += 1
            } catch {
                let apiError = error as? APIError
                let isConflict = apiError?.isRevisionConflict == true
                let status: OutboxStatus = isConflict ? .conflict : .error
                let attempts = item.attemptCount + 1
                try outbox.updateStatus(
                    scope: scope,
                    id: item.id,
                    expectedVersion: item.version,
                    status: status,
                    attemptCount: attempts,
                    lastError: (error as? LocalizedError)?.errorDescription ?? error.localizedDescription,
                    nextAttemptAt: isConflict ? nil : SyncRetry.nextAttemptAt(attemptCount: attempts)
                )
                if isConflict {
                    result.conflicted += 1
                } else {
                    result.failed += 1
                }
            }
        }
        return result
    }

    private func syncItem(_ item: OutboxItem) async throws -> MemoDetail {
        switch item.kind {
        case .memoCreate:
            let payload = try item.createPayload()
            return try await client.createMemo(
                notebookId: payload.notebookId,
                title: payload.title,
                contentMarkdown: payload.contentMarkdown,
                tags: payload.tags,
                createdAt: payload.createdAt,
                updatedAt: item.updatedAt
            )
        case .memoUpdate:
            let payload = try item.updatePayload()
            return try await applyMemoUpdate(memoId: item.memoId, payload: payload, allowRebase: true)
        }
    }

    /// Push a memo update. If the local expected base is stale (common after a prior
    /// successful sync that didn't refresh the edit session), rebase once onto the
    /// current server base and retry — local draft content wins.
    private func applyMemoUpdate(
        memoId: String,
        payload: MemoUpdatePayload,
        allowRebase: Bool
    ) async throws -> MemoDetail {
        let editSession = try await client.createMemoEditSession(memoId: memoId)
        let baseMatches = editSession.baseRevision == payload.expectedRevision
            && editSession.baseContentHash == payload.expectedContentHash

        if !baseMatches {
            if allowRebase {
                #if DEBUG
                NSLog(
                    "OutboxFlusher: rebasing update memo=%@ localRev=%d serverRev=%d",
                    memoId,
                    payload.expectedRevision,
                    editSession.baseRevision
                )
                #endif
                // Use the live edit session base (already the server tip).
                return try await client.updateMemo(
                    id: memoId,
                    expectedRevision: editSession.baseRevision,
                    expectedContentHash: editSession.baseContentHash,
                    editSessionId: editSession.id,
                    notebookId: payload.notebookId,
                    title: payload.title,
                    isPinned: nil,
                    contentMarkdown: payload.contentMarkdown,
                    tags: payload.tags
                )
            }
            throw APIError(
                status: 409,
                code: "revision_conflict",
                message: "Note changed before the offline draft could sync."
            )
        }

        return try await client.updateMemo(
            id: memoId,
            expectedRevision: payload.expectedRevision,
            expectedContentHash: payload.expectedContentHash,
            editSessionId: editSession.id,
            notebookId: payload.notebookId,
            title: payload.title,
            isPinned: nil,
            contentMarkdown: payload.contentMarkdown,
            tags: payload.tags
        )
    }
}
