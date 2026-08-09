import SwiftUI
import Pow

/// Android WorkspaceMemoDetail shell parity (detailHeader*, detailMeta*, detailEditFab).
struct MemoDetailView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let memoId: String
    /// Present editor from the parent `WorkspaceView` (more reliable than cover on a pushed page).
    var onEdit: (String) -> Void = { _ in }

    @State private var memo: MemoDetail?
    @State private var showRevisions = false
    @State private var showShareAlert = false
    @State private var shareURL: String?
    @State private var error: String?
    @State private var conflictItem: OutboxItem?
    @State private var outboxStatus: OutboxStatus?
    @State private var lastOutboxError: String?
    @State private var pinPulse = false
    @State private var searchOpen = false
    @State private var searchQuery = ""
    @State private var showDeleteConfirm = false
    @State private var showMoreMenu = false
    @State private var resourceTarget: ResourceTarget?
    @State private var imagePreview: (source: String, alt: String)?
    /// TipTap EditorBundle is ~4MB; keep native text visible until first setContent finishes.
    @State private var bodyReady = false

    var body: some View {
        VStack(spacing: 0) {
            detailHeader
            if syncStatus == .conflict, memo != nil {
                conflictBanner
            } else if syncStatus == .error || syncStatus == .pending, memo != nil {
                syncBanner
            }
            if let memo {
                detailBody(memo)
            } else if let error {
                ContentUnavailableView(
                    env.preferences.t("加载失败", en: "Failed to load"),
                    systemImage: "exclamationmark.triangle",
                    description: Text(error)
                )
            } else {
                // Should almost never flash: load() runs onAppear before next frame when mirror is warm.
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .background(Color.white)
        // UIKit FAB in overlay — SwiftUI Button over WKWebView often receives zero taps.
        .overlay(alignment: .bottomTrailing) {
            if let memo, !memo.isDeleted {
                EditFabButton(
                    accessibilityLabel: env.preferences.t("编辑笔记", en: "Edit note")
                ) {
                    onEdit(memo.id)
                }
                .frame(width: 56, height: 56)
                .padding(.trailing, 12)
                .padding(.bottom, 12)
            }
        }
        .background(Color.white.ignoresSafeArea())
        .toolbar(.hidden, for: .navigationBar)
        .accessibilityIdentifier(DetailMemoChrome.root)
        .sheet(isPresented: $showRevisions) {
            if let memo {
                RevisionsView(
                    memoId: memo.id,
                    memoTitle: memo.title,
                    isDeleted: memo.isDeleted
                ) {
                    showRevisions = false
                    load()
                }
            }
        }
        .sheet(item: $conflictItem) { item in
            ConflictResolutionView(item: item) {
                conflictItem = nil
                load()
                refreshSyncStatus()
            }
        }
        .sheet(item: $resourceTarget) { target in
            ResourceActionSheet(
                target: target,
                canMutate: memo.map { !$0.isDeleted && !$0.id.hasPrefix("local:") } ?? false,
                onContentChanged: { load() }
            )
            .presentationDetents([.height(360), .medium])
            .presentationDragIndicator(.hidden)
        }
        .fullScreenCover(isPresented: Binding(
            get: { imagePreview != nil },
            set: { if !$0 { imagePreview = nil } }
        )) {
            if let imagePreview {
                ResourceImagePreviewHost(
                    source: imagePreview.source,
                    alt: imagePreview.alt,
                    baseURL: env.session.session.flatMap { URL(string: $0.baseUrl) },
                    token: env.session.session?.token,
                    onClose: {
                        self.imagePreview = nil
                    },
                    canMutate: memo.map { !$0.isDeleted && !$0.id.hasPrefix("local:") } ?? false,
                    onContentChanged: {
                        load()
                        // Rename/delete may invalidate the blob; close preview after mutation.
                        self.imagePreview = nil
                    }
                )
            }
        }
        .confirmationDialog(
            env.preferences.t("笔记操作", en: "Note actions"),
            isPresented: $showMoreMenu,
            titleVisibility: .visible
        ) {
            if let memo {
                Button(env.preferences.t("编辑", en: "Edit")) { onEdit(memo.id) }
                Button(
                    memo.isPinned
                        ? env.preferences.t("取消置顶", en: "Unpin")
                        : env.preferences.t("置顶", en: "Pin")
                ) {
                    Task {
                        await togglePin(memo)
                        pinPulse.toggle()
                    }
                }
                Button(env.preferences.t("分享链接", en: "Share link")) {
                    Task { await shareMemo(memo) }
                }
                Button(env.preferences.t("修订历史", en: "Revisions")) { showRevisions = true }
                Button(env.preferences.t("删除", en: "Delete"), role: .destructive) {
                    showDeleteConfirm = true
                }
            }
        }
        .alert(env.preferences.t("删除笔记", en: "Delete note"), isPresented: $showDeleteConfirm) {
            Button(env.preferences.t("删除", en: "Delete"), role: .destructive) {
                if let memo { Task { await deleteMemo(memo) } }
            }
            Button(env.preferences.t("取消", en: "Cancel"), role: .cancel) {}
        } message: {
            Text(env.preferences.t("笔记将移入回收站。", en: "The note will move to trash."))
        }
        .alert(env.preferences.t("分享链接", en: "Share link"), isPresented: $showShareAlert) {
            Button(env.preferences.t("复制", en: "Copy")) {
                if let shareURL {
                    UIPasteboard.general.string = shareURL
                }
            }
            Button(env.preferences.t("关闭", en: "Close"), role: .cancel) {}
        } message: {
            Text(shareURL ?? "")
        }
        // Local SQLite mirror is sync and cheap — load before the first blank ProgressView frame.
        .onAppear {
            if memo == nil {
                load()
            }
            refreshSyncStatus()
            TipTapWarmPool.warmIfNeeded()
        }
        .task(id: memoId) {
            // Re-load if mirror was empty on first paint (rare race during bootstrap).
            if memo == nil {
                load()
            }
            refreshSyncStatus()
        }
        .onChange(of: env.isSyncing) { _, _ in
            refreshSyncStatus()
        }
        .onChange(of: memoId) { _, _ in
            bodyReady = false
            load()
            refreshSyncStatus()
        }
        .preferredColorScheme(env.preferences.colorScheme)
    }

    // MARK: - Header

    private var detailHeader: some View {
        HStack(spacing: 0) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AppTheme.slate)
                    .frame(width: 32, height: 32)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(env.preferences.t("返回列表", en: "Back to list"))
            .accessibilityIdentifier(DetailMemoChrome.back)

            Spacer(minLength: 8)

            HStack(spacing: 2) {
                Button {
                    handleSyncStatusPress()
                } label: {
                    Text(syncLabel)
                        .font(.system(size: 11, weight: syncStatus == .conflict || syncStatus == .error ? .bold : .medium))
                        .foregroundStyle(syncStatus.foreground)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(syncStatus.background)
                        .clipShape(Capsule())
                        .lineLimit(1)
                        .frame(maxWidth: 88)
                }
                .buttonStyle(.plain)
                .disabled(!syncStatus.isInteractive || memo == nil)
                .accessibilityLabel(syncLabel)
                .accessibilityIdentifier(DetailMemoChrome.syncStatus)

                if let memo, !memo.isDeleted {
                    headerIconButton(
                        systemImage: "square.and.arrow.up",
                        label: env.preferences.t("分享笔记", en: "Share note"),
                        id: DetailMemoChrome.share
                    ) {
                        Task { await shareMemo(memo) }
                    }
                    headerIconButton(
                        systemImage: "clock.arrow.circlepath",
                        label: env.preferences.t("版本历史", en: "Version history"),
                        id: DetailMemoChrome.history
                    ) {
                        showRevisions = true
                    }
                    headerIconButton(
                        systemImage: "magnifyingglass",
                        label: env.preferences.t("搜索当前笔记", en: "Search in note"),
                        id: DetailMemoChrome.search
                    ) {
                        withAnimation(Motion.chip) { searchOpen.toggle() }
                    }
                    headerIconButton(
                        systemImage: "ellipsis",
                        label: env.preferences.t("笔记操作", en: "Note actions"),
                        id: DetailMemoChrome.more
                    ) {
                        showMoreMenu = true
                    }
                }
            }
            .accessibilityIdentifier(DetailMemoChrome.header)
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 48)
        .background(Color.white)
        .overlay(alignment: .bottom) {
            Rectangle().fill(AppTheme.cardBorder).frame(height: 1)
        }
        .accessibilityIdentifier(DetailMemoChrome.header)
    }

    private func headerIconButton(
        systemImage: String,
        label: String,
        id: String,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.system(size: 16, weight: .semibold))
                .foregroundStyle(AppTheme.slate)
                .frame(width: 32, height: 32)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityIdentifier(id)
    }

    // MARK: - Banners

    private var conflictBanner: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(env.preferences.t(
                "云端笔记已在其他标签页、设备，或离线期间被更新。可先复制本地草稿，再采用云端版本后继续编辑。",
                en: "This note changed on another device or while offline. Copy the local draft, then adopt the cloud version to continue."
            ))
            .font(.system(size: 12))
            .foregroundStyle(Color(hex: 0x9F1239))
            .fixedSize(horizontal: false, vertical: true)

            if let lastOutboxError, !lastOutboxError.isEmpty {
                Text(lastOutboxError)
                    .font(.system(size: 12))
                    .foregroundStyle(Color(hex: 0x9F1239))
            }

            HStack(spacing: 8) {
                Button {
                    if let item = conflictItem {
                        // Open full conflict resolution (Android "更多")
                        conflictItem = item
                    } else {
                        detectConflict()
                    }
                } label: {
                    Text(env.preferences.t("处理冲突", en: "Resolve"))
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(Color(hex: 0xBE123C))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)

                Button {
                    Task { await copyLocalDraft() }
                } label: {
                    Text(env.preferences.t("复制本地草稿", en: "Copy local draft"))
                        .font(.system(size: 12, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x9F1239))
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(Color.white)
                        .overlay(
                            RoundedRectangle(cornerRadius: 8)
                                .stroke(Color(hex: 0xFECDD3), lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(hex: 0xFFF1F2))
        .overlay(alignment: .bottom) {
            Rectangle().fill(Color(hex: 0xFECDD3)).frame(height: 0.5)
        }
    }

    private var syncBanner: some View {
        let isError = syncStatus == .error
        return VStack(alignment: .leading, spacing: 10) {
            Text(
                lastOutboxError?.trimmingCharacters(in: .whitespacesAndNewlines).nilIfEmpty
                    ?? (isError
                        ? env.preferences.t("本地改动未能上传到云端。内容仍保存在本机，可立即重试。", en: "Local changes could not upload. Content is still on device; retry anytime.")
                        : env.preferences.t("本地改动待上传。下拉刷新或点此可立即同步。", en: "Local changes pending upload. Pull to refresh or tap to sync now."))
            )
            .font(.system(size: 12))
            .foregroundStyle(isError ? Color(hex: 0x991B1B) : Color(hex: 0x1E3A8A))
            .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 8) {
                Button {
                    Task {
                        // Force: ignore outbox backoff so "Memo not found" retries immediately
                        // and can recover via recreate-on-404 in OutboxFlusher.
                        await env.runSyncCycle(force: true)
                        refreshSyncStatus()
                        load()
                    }
                } label: {
                    Text(env.preferences.t("立即同步", en: "Sync now"))
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 8)
                        .background(isError ? Color(hex: 0xB91C1C) : Color(hex: 0x1D4ED8))
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                }
                .buttonStyle(.plain)

                if isError {
                    Button {
                        Task { await copyLocalDraft() }
                    } label: {
                        Text(env.preferences.t("复制本地草稿", en: "Copy local draft"))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundStyle(Color(hex: 0x991B1B))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 8)
                            .background(Color.white)
                            .overlay(
                                RoundedRectangle(cornerRadius: 8)
                                    .stroke(Color(hex: 0xFECACA), lineWidth: 1)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(isError ? Color(hex: 0xFEF2F2) : Color(hex: 0xEFF6FF))
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(isError ? Color(hex: 0xFECACA) : Color(hex: 0xBFDBFE))
                .frame(height: 0.5)
        }
    }

    // MARK: - Body

    private func detailBody(_ memo: MemoDetail) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            VStack(alignment: .leading, spacing: 0) {
                HStack(spacing: 6) {
                    if memo.isPinned {
                        Text("★")
                            .font(.system(size: 16))
                            .foregroundStyle(AppTheme.secondary)
                    }
                    Text(memo.displayTitle)
                        .font(.system(size: 24, weight: .bold))
                        .foregroundStyle(AppTheme.title)
                        .lineLimit(4)
                        .textSelection(.enabled)
                        .accessibilityIdentifier(DetailMemoChrome.title)
                }
                .padding(.top, 16)
                .edgeEverSuccessShine(trigger: pinPulse)

                HStack(spacing: 8) {
                    HStack(spacing: 4) {
                        Text(notebookName(for: memo))
                            .font(.system(size: 14))
                            .foregroundStyle(AppTheme.secondary)
                            .lineLimit(1)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(AppTheme.muted)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .layoutPriority(0)
                    .accessibilityIdentifier(DetailMemoChrome.notebook)

                    HStack(spacing: 8) {
                        Image(systemName: "tag")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundStyle(AppTheme.secondary)
                        Text(
                            memo.tags.isEmpty
                                ? env.preferences.t("添加标签，用逗号分隔", en: "Add tags, comma separated")
                                : memo.tags.joined(separator: ", ")
                        )
                        .font(.system(size: 14))
                        .foregroundStyle(memo.tags.isEmpty ? AppTheme.muted : AppTheme.secondary)
                        .lineLimit(1)
                        .textSelection(.enabled)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .accessibilityIdentifier(DetailMemoChrome.tags)
                }
                .frame(minHeight: 32)
                .padding(.top, 12)
                .accessibilityIdentifier(DetailMemoChrome.metaRow)

                if searchOpen {
                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundStyle(AppTheme.secondary)
                        TextField(
                            env.preferences.t("在当前笔记内搜索", en: "Search in this note"),
                            text: $searchQuery
                        )
                        .font(.system(size: 14))
                        .textFieldStyle(.plain)
                        Button {
                            searchOpen = false
                            searchQuery = ""
                        } label: {
                            Image(systemName: "xmark")
                                .font(.system(size: 12, weight: .bold))
                                .foregroundStyle(AppTheme.title)
                                .frame(width: 28, height: 28)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(10)
                    .background(AppTheme.background)
                    .clipShape(RoundedRectangle(cornerRadius: 8))
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(AppTheme.border, lineWidth: 1)
                    )
                    .padding(.top, 14)
                }

                Rectangle()
                    .fill(AppTheme.border)
                    .frame(height: 1)
                    .padding(.top, 16)
                    .padding(.bottom, 8)
            }
            .padding(.horizontal, 16)

            // Always show TipTap at full opacity. A plain contentText overlay looked like a
            // "broken layout" (one wall of text) when bodyReady failed to flip.
            ZStack {
                TipTapWebView(
                    mode: .viewer,
                    documentJSON: (try? memo.contentJson.jsonString())
                        ?? "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}",
                    markdown: memo.contentMarkdown,
                    baseURL: env.session.session.flatMap { URL(string: $0.baseUrl) },
                    token: env.session.session?.token,
                    onChange: nil,
                    onResourcePress: { target in
                        resourceTarget = target
                    },
                    onImagePreview: { source, alt in
                        imagePreview = (source, alt)
                    },
                    onBodyReady: {
                        bodyReady = true
                    }
                )

                if !bodyReady {
                    ProgressView()
                        .tint(AppTheme.title)
                        .frame(maxWidth: .infinity, maxHeight: .infinity)
                        .background(Color.white.opacity(0.92))
                        .allowsHitTesting(false)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .accessibilityIdentifier(DetailMemoChrome.body)
            .task(id: memo.id) {
                // Safety net: never leave the spinner forever if a ready callback is missed.
                try? await Task.sleep(nanoseconds: 1_200_000_000)
                if !bodyReady {
                    bodyReady = true
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // MARK: - Sync helpers

    private var syncStatus: DetailSyncStatus {
        DetailSyncStatus.derive(outboxStatus: outboxStatus, isGlobalSyncing: env.isSyncing)
    }

    private var syncLabel: String {
        env.preferences.isEnglish ? syncStatus.labelEN : syncStatus.labelZH
    }

    private func notebookName(for memo: MemoDetail) -> String {
        let notebooks = (try? env.mirror.listNotebooks(scope: env.session.dataScope ?? "")) ?? []
        return notebooks.first(where: { $0.id == memo.notebookId })?.name
            ?? env.preferences.t("笔记本", en: "Notebook")
    }

    private func handleSyncStatusPress() {
        switch syncStatus {
        case .conflict:
            detectConflict()
        case .error, .pending:
            Task {
                await env.runSyncCycle(force: true)
                refreshSyncStatus()
                load()
            }
        case .synced, .syncing:
            break
        }
    }

    private func load() {
        guard let scope = env.session.dataScope else { return }
        do {
            memo = try env.mirror.resolveMemo(scope: scope, id: memoId)
            if memo == nil {
                error = env.preferences.t("本地未找到该笔记，请先同步。", en: "Note not in local cache. Sync first.")
            }
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func refreshSyncStatus() {
        guard let scope = env.session.dataScope else {
            outboxStatus = nil
            lastOutboxError = nil
            return
        }
        let items = (try? env.outbox.listItems(scope: scope)) ?? []
        if let item = items.first(where: { $0.memoId == memoId }) {
            outboxStatus = item.status
            lastOutboxError = item.lastError
            if item.status == .conflict {
                conflictItem = item
            }
        } else {
            outboxStatus = nil
            lastOutboxError = nil
        }
    }

    private func detectConflict() {
        guard let scope = env.session.dataScope else { return }
        let items = (try? env.outbox.listItems(scope: scope)) ?? []
        conflictItem = items.first { $0.memoId == memoId && $0.status == .conflict }
        refreshSyncStatus()
    }

    private func copyLocalDraft() async {
        guard let memo else { return }
        let text = [memo.displayTitle, memo.contentMarkdown].filter { !$0.isEmpty }.joined(separator: "\n\n")
        UIPasteboard.general.string = text
    }

    private func togglePin(_ memo: MemoDetail) async {
        guard let scope = env.session.dataScope else { return }
        do {
            let updated = try await env.session.client.updateMemo(
                id: memo.id,
                expectedRevision: nil,
                expectedContentHash: nil,
                editSessionId: nil,
                notebookId: nil,
                title: nil,
                isPinned: !memo.isPinned,
                contentMarkdown: nil,
                tags: nil
            )
            try env.mirror.upsertMemo(scope: scope, memo: updated)
            self.memo = updated
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func shareMemo(_ memo: MemoDetail) async {
        do {
            let share = try await env.session.client.createMemoShare(memoId: memo.id)
            let base = env.session.session?.baseUrl.trimmingCharacters(in: CharacterSet(charactersIn: "/")) ?? ""
            shareURL = "\(base)/share/\(share.token)"
            showShareAlert = true
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func deleteMemo(_ memo: MemoDetail) async {
        guard let scope = env.session.dataScope else { return }
        do {
            if memo.id.hasPrefix("local:") {
                try env.outbox.cancelMemo(scope: scope, memoId: memo.id)
                try env.mirror.deleteMemo(scope: scope, id: memo.id)
            } else {
                _ = try env.mirror.softDeleteMemo(scope: scope, id: memo.id)
                try await env.session.client.deleteMemo(id: memo.id, permanent: false)
            }
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }
}

// MARK: - String helper

private extension String {
    var nilIfEmpty: String? {
        let t = trimmingCharacters(in: .whitespacesAndNewlines)
        return t.isEmpty ? nil : t
    }
}

// MARK: - Version history (Android RevisionHistoryModal parity)

/// Android `RevisionHistoryModal`: header + selected summary/restore + timeline pills + markdown preview.
