import PhotosUI
import SwiftUI
import UIKit
import UniformTypeIdentifiers

enum MemoEditMode: Equatable {
    case create(notebookId: String)
    case edit(memoId: String)
}

/// Android CreateMemoModal / rich-edit shell parity (createMemo* tokens).
struct MemoEditView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    let mode: MemoEditMode
    /// When set (edit-from-detail), close by popping to the list under the cover first —
    /// never `dismiss()` onto a still-pushed detail page.
    var onLeaveToList: (() -> Void)? = nil
    /// Create path: called with the committed memo id so the list can bounce that card.
    var onCreateFinished: ((String) -> Void)? = nil

    @State private var title = ""
    @State private var tagsText = ""
    @State private var notebookId = ""
    @State private var contentMarkdown = ""
    @State private var contentJSON = "{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}"
    @State private var expectedRevision: Int?
    @State private var expectedContentHash: String?
    @State private var memoId: String?
    @State private var error: String?
    @State private var saveTask: Task<Void, Never>?
    @State private var isMaterializing = false
    @State private var isDirty = false
    @State private var isSaving = false
    @State private var isCreating = false
    @State private var isUploading = false
    @State private var editorReady = false
    /// True after Back/Done commit starts — blocks late TipTap `change` from rewriting the
    /// `new` draft so the next create opens empty instead of the previous note body.
    @State private var suppressPersistence = false
    /// False until `loadInitial` has filled title/body from mirror — prevents TipTap boot
    /// with empty defaults from overwriting a non-empty note via autosave / flush.
    @State private var contentHydrated = false
    /// Snapshot of body when edit opened (or last intentional load). Used to reject empty clobbers.
    @State private var baselineMarkdown = ""
    @State private var showNotebookPicker = false
    @State private var showImagePicker = false
    @State private var showUploadError = false
    @State private var resourceTarget: ResourceTarget?

    var body: some View {
        ZStack {
            VStack(spacing: 0) {
                createHeader
                createMain
            }

            // Impossible-to-miss upload feedback (status chip alone was too easy to miss).
            if isUploading {
                Color.black.opacity(0.28)
                    .ignoresSafeArea()
                    .allowsHitTesting(true)
                VStack(spacing: 12) {
                    ProgressView()
                        .controlSize(.large)
                        .tint(.white)
                    Text(env.preferences.t("正在上传图片…", en: "Uploading image…"))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(.white)
                }
                .padding(24)
                .background(.ultraThinMaterial.opacity(0.9))
                .background(Color.black.opacity(0.55))
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                .accessibilityIdentifier("createMemoUploadOverlay")
            }
        }
        .background(Color.white.ignoresSafeArea())
        .accessibilityIdentifier(CreateMemoChrome.root)
        .sheet(isPresented: $showNotebookPicker) {
            EditNotebookPickerSheet(
                notebooks: availableNotebooks,
                selectedId: notebookId
            ) { id in
                notebookId = id
                markDirtyAndScheduleSave()
                showNotebookPicker = false
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(item: $resourceTarget) { target in
            ResourceActionSheet(
                target: target,
                canMutate: {
                    if case .edit(let id) = mode { return !id.hasPrefix("local:") }
                    return false
                }(),
                onContentChanged: {
                    Task { await reloadAfterResourceChange() }
                }
            )
            .presentationDetents([.height(360), .medium])
            .presentationDragIndicator(.hidden)
        }
        // fullScreenCover avoids nested-sheet bugs when MemoEditView itself is already a fullScreenCover.
        // PHPicker + NSItemProvider (not SwiftUI PhotosPicker/Transferable) is the reliable path.
        .fullScreenCover(isPresented: $showImagePicker) {
            SystemImagePicker { result in
                showImagePicker = false
                switch result {
                case .cancelled:
                    break
                case .failed(let message):
                    error = message
                    showUploadError = true
                case .picked(let data, let filename):
                    Task { await insertImageData(data, filename: filename) }
                }
            }
            .ignoresSafeArea()
        }
        .alert(
            env.preferences.t("图片上传失败", en: "Image upload failed"),
            isPresented: $showUploadError
        ) {
            Button(env.preferences.t("好的", en: "OK"), role: .cancel) {}
        } message: {
            Text(error ?? env.preferences.t("请重试", en: "Please try again"))
        }
        .task {
            await loadInitial()
            contentHydrated = true
            // editorReady flips true from TipTap onBodyReady (or fallback below).
            try? await Task.sleep(nanoseconds: 800_000_000)
            if !Task.isCancelled, !editorReady {
                editorReady = true
                // One open-edit focus only (SharedTipTapRuntime also focuses once per document).
                SharedTipTapRuntime.editor.focusEnd()
            }
        }
        .onDisappear {
            saveTask?.cancel()
            // Create commit is owned by Back / Done (Android `requestClose` = createMutation).
            // Only flush edit sessions, or create-after-image-materialize if still dirty and
            // the cover was dismissed without going through handleBack.
            if suppressPersistence { return }
            if isDirty, contentHydrated, (!isCreate || hasMaterializedServerMemo) {
                Task { await flushPending() }
            }
        }
        .preferredColorScheme(env.preferences.colorScheme)
    }

    // MARK: - Header (createMemoHeader)

    private var createHeader: some View {
        HStack(spacing: 8) {
            Button {
                Task { await handleBack() }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundStyle(busyChrome ? AppTheme.muted : AppTheme.title)
                    .frame(width: 38, height: 38)
                    .contentShape(Circle())
            }
            .buttonStyle(.plain)
            .disabled(busyChrome)
            .accessibilityLabel(env.preferences.t("返回", en: "Back"))
            .accessibilityIdentifier(CreateMemoChrome.back)

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                Text(statusLabel)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(saveStatus.isActive ? AppTheme.accentStrong : AppTheme.secondary)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(saveStatus.isActive ? AppTheme.accentSoft : AppTheme.searchFill)
                    .clipShape(Capsule())
                    .lineLimit(1)
                    .accessibilityIdentifier(CreateMemoChrome.status)

                Button {
                    Task { await handleDone() }
                } label: {
                    Group {
                        if isCreating || isSaving && isCreate {
                            ProgressView()
                                .controlSize(.small)
                                .tint(AppTheme.secondary)
                        } else {
                            Text(env.preferences.t("完成", en: "Done"))
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(canSubmitDone ? Color.white : AppTheme.secondary)
                        }
                    }
                    .frame(minWidth: 58, minHeight: 36)
                    .padding(.horizontal, 12)
                    .background(canSubmitDone ? AppTheme.title : Color(hex: 0xE2E8F0))
                    .clipShape(Capsule())
                }
                .buttonStyle(.plain)
                .disabled(!canSubmitDone)
                .accessibilityLabel(env.preferences.t("完成", en: "Done"))
                .accessibilityIdentifier(CreateMemoChrome.done)
            }
            .accessibilityIdentifier(CreateMemoChrome.header)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .frame(minHeight: 52)
        .background(Color.white)
        .overlay(alignment: .bottom) {
            Rectangle().fill(AppTheme.cardBorder).frame(height: 1)
        }
        .accessibilityIdentifier(CreateMemoChrome.header)
    }

    // MARK: - Main (createMemoMain)

    private var createMain: some View {
        VStack(alignment: .leading, spacing: 0) {
            TextField(
                env.preferences.t("无标题笔记", en: "Untitled note"),
                text: $title
            )
            .font(.system(size: 28, weight: .heavy))
            .foregroundStyle(AppTheme.title)
            .textFieldStyle(.plain)
            .padding(.top, 14)
            .padding(.bottom, 8)
            .onChange(of: title) { _, _ in markDirtyAndScheduleSave() }
            .accessibilityLabel(env.preferences.t("笔记标题", en: "Note title"))
            .accessibilityIdentifier(CreateMemoChrome.title)

            HStack(spacing: 10) {
                Button {
                    showNotebookPicker = true
                } label: {
                    HStack(spacing: 3) {
                        Text(selectedNotebookName)
                            .font(.system(size: 15, weight: .bold))
                            .foregroundStyle(AppTheme.secondary)
                            .lineLimit(1)
                        Image(systemName: "chevron.down")
                            .font(.system(size: 11, weight: .semibold))
                            .foregroundStyle(AppTheme.secondary)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.plain)
                .frame(maxWidth: 160, alignment: .leading)
                .frame(minHeight: 30)
                .layoutPriority(1)
                .accessibilityLabel(env.preferences.t("所在笔记本", en: "Notebook"))
                .accessibilityIdentifier(CreateMemoChrome.notebook)

                TextField(
                    env.preferences.t("添加标签，用逗号分隔", en: "Add tags, comma separated"),
                    text: $tagsText
                )
                .font(.system(size: 15))
                .foregroundStyle(AppTheme.secondary)
                .textFieldStyle(.plain)
                .frame(minHeight: 36)
                .onChange(of: tagsText) { _, _ in markDirtyAndScheduleSave() }
                .accessibilityLabel(env.preferences.t("笔记标签", en: "Tags"))
                .accessibilityIdentifier(CreateMemoChrome.tags)

                Button {
                    // Resign WebView first responder so the picker sheet is not blocked.
                    UIApplication.shared.sendAction(
                        #selector(UIResponder.resignFirstResponder),
                        to: nil,
                        from: nil,
                        for: nil
                    )
                    error = nil
                    showImagePicker = true
                } label: {
                    Image(systemName: "photo")
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(isUploading ? AppTheme.muted : AppTheme.slate)
                        .frame(width: 36, height: 32)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .disabled(isUploading)
                .accessibilityLabel(env.preferences.t("插入图片", en: "Insert image"))
                .accessibilityIdentifier(CreateMemoChrome.imageTool)
            }
            .frame(minHeight: 40)
            .accessibilityIdentifier(CreateMemoChrome.metaRow)

            ZStack {
                // Mount TipTap only after local body is loaded — shared WebView must not
                // receive empty defaults first (that used to autosave-wipe demo notes).
                if contentHydrated {
                    TipTapWebView(
                        mode: .editor,
                        documentJSON: contentJSON,
                        markdown: contentMarkdown,
                        baseURL: env.session.session.map { URL(string: $0.baseUrl) } ?? nil,
                        token: env.session.session?.token,
                        onChange: { md, json in
                            guard contentHydrated, !suppressPersistence else { return }
                            // Always accept editor truth, even mid-upload (save stays gated).
                            // @tiptap/markdown can drop text or images — reconcile carefully.
                            applyEditorPayload(markdown: md, json: json)
                            if !isUploading {
                                markDirtyAndScheduleSave()
                            } else {
                                isDirty = true
                            }
                        },
                        onResourcePress: { target in
                            resourceTarget = target
                        },
                        onImagePreview: nil,
                        onBodyReady: {
                            // Do not focusEnd here — bodyReady also fires on typing re-binds.
                            // Open-edit focus is owned by SharedTipTapRuntime (once per document).
                            editorReady = true
                        }
                    )
                    .opacity(1)
                }

                if !editorReady || !contentHydrated {
                    VStack(spacing: 10) {
                        ProgressView()
                            .tint(AppTheme.title)
                        Text(env.preferences.t("正在启动本地编辑器", en: "Starting local editor"))
                            .font(.system(size: 13, weight: .medium))
                            .foregroundStyle(AppTheme.secondary)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Color.white)
                    .allowsHitTesting(false)
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .stroke(AppTheme.border, lineWidth: 1)
            )
            .padding(.top, 4)
            .padding(.horizontal, -4)
            .accessibilityIdentifier(CreateMemoChrome.editorFrame)

            if let error {
                Text(error)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AppTheme.danger)
                    .padding(.top, 8)
            }
        }
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    // MARK: - Derived state

    private var isCreate: Bool {
        if case .create = mode { return true }
        return false
    }

    private var busyChrome: Bool {
        isCreating || isUploading
    }

    private var saveStatus: CreateSaveStatus {
        CreateSaveStatus.derive(
            editorReady: editorReady,
            isDirty: isDirty,
            isSaving: isSaving,
            isCreating: isCreating,
            isUploading: isUploading,
            hasError: error != nil
        )
    }

    private var statusLabel: String {
        env.preferences.isEnglish ? saveStatus.labelEN : saveStatus.labelZH
    }

    private var canSubmitDone: Bool {
        if isCreate {
            return !notebookId.isEmpty && !isCreating && !isUploading
        }
        return !isSaving && !isUploading && editorReady
    }

    private var availableNotebooks: [Notebook] {
        (try? env.mirror.listNotebooks(scope: env.session.dataScope ?? "")) ?? []
    }

    private var selectedNotebookName: String {
        if let name = availableNotebooks.first(where: { $0.id == notebookId })?.name {
            return name
        }
        return env.preferences.t("选择笔记本", en: "Choose notebook")
    }

    private var tags: [String] {
        tagsText
            .split(whereSeparator: { ",， ".contains($0) })
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    // MARK: - Actions

    private func markDirtyAndScheduleSave() {
        guard !suppressPersistence else { return }
        // Avoid autosaving mid-upload (placeholder / incomplete body).
        guard !isUploading else {
            isDirty = true
            return
        }
        isDirty = true
        scheduleSave()
    }

    private func handleBack() async {
        // Android CreateMemoModal `requestClose`: flush editor then always run createMutation.
        // Text-only create must mint a local:/server memo + clear the new-note draft so:
        // 1) the note appears in the list, 2) the next "New note" opens empty.
        if isCreate {
            if busyChrome { return }
            await pullEditorSnapshotIfPossible()
            await commitCreate()
        } else {
            await flushPending()
            leaveEditor()
        }
    }

    private func handleDone() async {
        await pullEditorSnapshotIfPossible()
        if isCreate {
            await commitCreate()
        } else {
            await flushPending()
            leaveEditor()
        }
    }

    /// Edit-from-detail: parent pops path then clears the cover so list is revealed.
    /// Create / other hosts: standard environment dismiss.
    private func leaveEditor() {
        if let onLeaveToList {
            onLeaveToList()
        } else {
            dismiss()
        }
    }

    /// True once `materializeForImage` (or edit open) holds a real server memo id.
    private var hasMaterializedServerMemo: Bool {
        guard let memoId else { return false }
        return !memoId.hasPrefix("local:")
    }

    /// Pull markdown/JSON from TipTap so saves don't race the async change bridge.
    private func pullEditorSnapshotIfPossible() async {
        guard let snap = await SharedTipTapRuntime.editor.snapshotContent() else { return }
        applyEditorPayload(markdown: snap.markdown, json: snap.json)
    }

    /// Merge TipTap bridge payloads.
    /// **TipTap JSON is the only structural source of truth** (node order = image above/below text).
    /// Markdown is always derived from JSON so we never "append missing images at the end"
    /// and flip 图文顺序 when the serializer drops an image mid-document.
    private func applyEditorPayload(markdown: String, json: String) {
        let prevText = EditorContentCodec.plainText(markdown: contentMarkdown, json: contentJSON)

        let trimmedJSON = json.trimmingCharacters(in: .whitespacesAndNewlines)
        let nextJSON: String = {
            if !trimmedJSON.isEmpty, EditorContentCodec.looksLikeTipTapDoc(trimmedJSON) {
                return trimmedJSON
            }
            return contentJSON
        }()

        // Derive markdown from JSON whenever possible — preserves block order exactly.
        let nextMD: String = {
            if let derived = EditorContentCodec.markdownFromTipTapJSON(nextJSON) {
                return derived
            }
            if !markdown.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
                return markdown
            }
            return contentMarkdown
        }()

        let nextText = EditorContentCodec.plainText(markdown: nextMD, json: nextJSON)
        let nextHasImage = EditorContentCodec.containsImageNode(nextJSON)
            || nextMD.contains("![")

        // Hard guard: never accept a payload that strips substantial text while leaving media.
        if prevText.count >= 8, nextText.count < max(4, prevText.count / 2), nextHasImage {
            NSLog(
                "MemoEditView: reject text-stripping payload prevText=%d nextText=%d",
                prevText.count, nextText.count
            )
            // Do NOT append images at the end — that reorders 图文. Keep prior body.
            return
        }

        contentJSON = nextJSON
        contentMarkdown = nextMD
    }

    private func loadInitial() async {
        guard let scope = env.session.dataScope else { return }
        switch mode {
        case .create(let nb):
            notebookId = nb
            if let draft = try? env.drafts.read(scope: scope, key: DraftRepository.newKey) {
                title = draft.title
                tagsText = draft.tagsText
                contentMarkdown = draft.contentMarkdown
                contentJSON = draft.contentJson ?? contentJSON
                if !draft.notebookId.isEmpty { notebookId = draft.notebookId }
            }
            baselineMarkdown = contentMarkdown
        case .edit(let id):
            memoId = id
            // Prefer mirror body over a stale empty draft that could wipe the note.
            if let memo = try? env.mirror.resolveMemo(scope: scope, id: id) {
                title = memo.title ?? ""
                tagsText = memo.tags.joined(separator: ", ")
                contentMarkdown = memo.contentMarkdown
                contentJSON = (try? memo.contentJson.jsonString()) ?? contentJSON
                notebookId = memo.notebookId
                expectedRevision = memo.revision
                expectedContentHash = memo.contentHash
                memoId = memo.id
                // Overlay draft only when it still has body (or memo was already empty).
                if let draft = try? env.drafts.read(scope: scope, key: DraftRepository.memoKey(id)) {
                    let draftBody = draft.contentMarkdown.trimmingCharacters(in: .whitespacesAndNewlines)
                    let memoBody = memo.contentMarkdown.trimmingCharacters(in: .whitespacesAndNewlines)
                    if !draftBody.isEmpty || memoBody.isEmpty {
                        title = draft.title
                        tagsText = draft.tagsText
                        contentMarkdown = draft.contentMarkdown
                        contentJSON = draft.contentJson ?? contentJSON
                        if !draft.notebookId.isEmpty { notebookId = draft.notebookId }
                        expectedRevision = draft.expectedRevision ?? expectedRevision
                    }
                }
            } else if let draft = try? env.drafts.read(scope: scope, key: DraftRepository.memoKey(id)) {
                title = draft.title
                tagsText = draft.tagsText
                contentMarkdown = draft.contentMarkdown
                contentJSON = draft.contentJson ?? contentJSON
                notebookId = draft.notebookId
                expectedRevision = draft.expectedRevision
            }
            baselineMarkdown = contentMarkdown
        }
    }

    /// After server-side rename/delete, pull the latest memo body into the editor.
    private func reloadAfterResourceChange() async {
        guard case .edit(let id) = mode, let scope = env.session.dataScope else { return }
        // Prefer live server copy when online.
        if let remote = try? await env.session.client.getMemo(id: id) {
            try? env.mirror.upsertMemo(scope: scope, memo: remote)
            title = remote.title ?? ""
            tagsText = remote.tags.joined(separator: ", ")
            contentMarkdown = remote.contentMarkdown
            contentJSON = (try? remote.contentJson.jsonString()) ?? contentJSON
            expectedRevision = remote.revision
            expectedContentHash = remote.contentHash
            baselineMarkdown = contentMarkdown
            return
        }
        if let memo = try? env.mirror.resolveMemo(scope: scope, id: id) {
            title = memo.title ?? ""
            tagsText = memo.tags.joined(separator: ", ")
            contentMarkdown = memo.contentMarkdown
            contentJSON = (try? memo.contentJson.jsonString()) ?? contentJSON
            expectedRevision = memo.revision
            expectedContentHash = memo.contentHash
            baselineMarkdown = contentMarkdown
        }
    }

    private func scheduleSave() {
        guard !suppressPersistence else { return }
        saveTask?.cancel()
        saveTask = Task {
            try? await Task.sleep(nanoseconds: 500_000_000)
            guard !Task.isCancelled, !suppressPersistence else { return }
            await persistDraftOrQueue()
        }
    }

    /// Reject autosave that would wipe a non-empty note with an empty / image-only boot payload.
    private var wouldClobberNonEmptyBody: Bool {
        guard !isCreate else { return false }
        let next = contentMarkdown.trimmingCharacters(in: .whitespacesAndNewlines)
        let base = baselineMarkdown.trimmingCharacters(in: .whitespacesAndNewlines)
        if next.isEmpty && !base.isEmpty { return true }

        let baseText = EditorContentCodec.plainTextFromMarkdown(baselineMarkdown)
        let nextText = EditorContentCodec.plainText(markdown: contentMarkdown, json: contentJSON)
        let nextHasImage = contentMarkdown.contains("/api/v1/resources/")
            || contentJSON.contains("/api/v1/resources/")
            || contentJSON.contains("\"type\":\"image\"")
        // Image-only body while baseline had real text → refuse (this produced empty notes).
        if baseText.count >= 8, nextText.count < max(4, baseText.count / 2), nextHasImage {
            return true
        }
        return false
    }

    private func persistDraftOrQueue() async {
        guard let scope = env.session.dataScope else { return }
        guard contentHydrated, !suppressPersistence else { return }
        // Last chance: re-sync markdown from JSON so outbox markdown cannot drop text.
        reconcileMarkdownWithJSON()
        if wouldClobberNonEmptyBody {
            NSLog(
                "MemoEditView: skip persist — refusing body clobber baseText=%d nextText=%d",
                EditorContentCodec.plainTextFromMarkdown(baselineMarkdown).count,
                EditorContentCodec.plainText(markdown: contentMarkdown, json: contentJSON).count
            )
            isDirty = false
            return
        }
        isSaving = true
        defer {
            isSaving = false
            isDirty = false
        }
        let now = EdgeEverDate.nowString()

        // Create mode before materialize: draft only.
        // Create mode after materialize (image upload) OR edit: mirror + outbox update.
        if isCreate, !hasMaterializedServerMemo {
            try? env.drafts.write(
                scope: scope,
                draft: MemoDraft(
                    draftKey: DraftRepository.newKey,
                    title: title,
                    contentMarkdown: contentMarkdown,
                    contentJson: contentJSON,
                    notebookId: notebookId,
                    tagsText: tagsText,
                    expectedRevision: nil,
                    updatedAt: now
                )
            )
            NSLog(
                "MemoEditView persist draft-only mdLen=%d hasImg=%d",
                contentMarkdown.count,
                contentMarkdown.contains("/api/v1/resources/") ? 1 : 0
            )
            return
        }

        guard let memoId, !memoId.hasPrefix("local:") else {
            // Offline local: create still in flight — keep draft.
            if isCreate {
                try? env.drafts.write(
                    scope: scope,
                    draft: MemoDraft(
                        draftKey: DraftRepository.newKey,
                        title: title,
                        contentMarkdown: contentMarkdown,
                        contentJson: contentJSON,
                        notebookId: notebookId,
                        tagsText: tagsText,
                        expectedRevision: nil,
                        updatedAt: now
                    )
                )
            }
            return
        }

        guard var memo = try? env.mirror.resolveMemo(scope: scope, id: memoId) else {
            NSLog("MemoEditView persist: mirror miss for \(memoId)")
            return
        }
        memo.title = title.isEmpty ? "无标题笔记" : title
        memo.contentMarkdown = contentMarkdown
        memo.contentText = contentMarkdown
        memo.tags = tags
        memo.notebookId = notebookId
        memo.updatedAt = now
        memo.excerpt = String(contentMarkdown.prefix(160))
        if let json = try? JSONValue.parse(contentJSON) {
            memo.contentJson = json
        }
        // Capture server base BEFORE writing local content. Never prefer a stale
        // in-memory expectedRevision that lagged behind a completed sync — that was
        // causing endless "Note changed before the offline draft could sync" conflicts.
        let rev = memo.revision
        let hash = memo.contentHash
        try? env.mirror.upsertMemo(scope: scope, memo: memo)

        try? env.outbox.enqueueUpdate(
            scope: scope,
            payload: MemoUpdatePayload(
                memoId: memo.id,
                expectedRevision: rev,
                expectedContentHash: hash,
                title: memo.title ?? title,
                contentMarkdown: contentMarkdown,
                contentJson: contentJSON,
                notebookId: notebookId,
                tags: tags
            )
        )
        expectedRevision = rev
        expectedContentHash = hash
        try? env.drafts.write(
            scope: scope,
            draft: MemoDraft(
                draftKey: isCreate ? DraftRepository.newKey : DraftRepository.memoKey(memo.id),
                title: title,
                contentMarkdown: contentMarkdown,
                contentJson: contentJSON,
                notebookId: notebookId,
                tagsText: tagsText,
                expectedRevision: rev,
                updatedAt: now
            )
        )
        NSLog(
            "MemoEditView persist update memo=%@ baseRev=%d mdLen=%d hasImg=%d jsonHasImg=%d",
            memo.id,
            rev,
            contentMarkdown.count,
            contentMarkdown.contains("/api/v1/resources/") ? 1 : 0,
            contentJSON.contains("/api/v1/resources/") ? 1 : 0
        )
        await env.runSyncCycle()
        // Refresh base from mirror after flush so the next keystroke doesn't reuse a dead revision.
        if let refreshed = try? env.mirror.resolveMemo(scope: scope, id: memoId) {
            expectedRevision = refreshed.revision
            expectedContentHash = refreshed.contentHash
        }
    }

    private func commitCreate() async {
        guard let scope = env.session.dataScope else { return }
        guard !notebookId.isEmpty else {
            error = env.preferences.t("请选择笔记本", en: "Choose a notebook")
            return
        }
        if isCreating { return }
        isCreating = true
        // Block autosave / late TipTap change before any await so the `new` draft cannot
        // be rewritten after we clear it (next FAB create must open empty).
        suppressPersistence = true
        isDirty = false
        saveTask?.cancel()
        defer { isCreating = false }
        do {
            // Android createMutation: if image materialize already created a server memo,
            // Done/Back updates that memo — never mint a second local: create.
            let outcome = try MemoCreateCommit.commit(
                scope: scope,
                memoId: memoId,
                expectedRevision: expectedRevision,
                expectedContentHash: expectedContentHash,
                notebookId: notebookId,
                title: title,
                contentMarkdown: contentMarkdown,
                contentJSON: contentJSON,
                tags: tags,
                mirror: env.mirror,
                outbox: env.outbox,
                drafts: env.drafts
            )
            switch outcome {
            case .createdLocal(let id), .updatedMaterialized(let id):
                memoId = id
            }
            // Prefer mirror id after sync (create may remap local: → server id).
            var finishedId = memoId
            // Belt-and-suspenders: clear create draft again after commit (race with in-flight write).
            try? env.drafts.clear(scope: scope, key: DraftRepository.newKey)
            await env.runSyncCycle()
            if let id = memoId, let refreshed = try? env.mirror.resolveMemo(scope: scope, id: id) {
                expectedRevision = refreshed.revision
                expectedContentHash = refreshed.contentHash
                memoId = refreshed.id
                finishedId = refreshed.id
            }
            // Clear again after sync — materialize/persist paths may have re-touched `new`.
            try? env.drafts.clear(scope: scope, key: DraftRepository.newKey)
            if let finishedId {
                onCreateFinished?(finishedId)
            }
            // Create modal sits on the list already; WorkspaceView reloads on cover dismiss.
            dismiss()
        } catch {
            // Allow retry / further edits after a failed commit.
            suppressPersistence = false
            self.error = error.localizedDescription
        }
    }

    private func flushPending() async {
        await persistDraftOrQueue()
        await env.runSyncCycle()
    }

    /// K24 materialize: ensure a server memo id before image upload.
    private func materializeForImage() async throws -> String {
        if let memoId, !memoId.hasPrefix("local:") {
            return memoId
        }
        guard let scope = env.session.dataScope else {
            throw APIError(status: 0, code: nil, message: "未登录")
        }
        if isMaterializing {
            try await Task.sleep(nanoseconds: 300_000_000)
            if let memoId, !memoId.hasPrefix("local:") { return memoId }
        }
        isMaterializing = true
        defer { isMaterializing = false }

        if let localId = memoId, localId.hasPrefix("local:"),
           let pending = try env.outbox.pendingCreate(scope: scope, memoId: localId)
        {
            if pending.status == .syncing {
                await env.runSyncCycle()
                if let resolved = try env.mirror.resolveMemo(scope: scope, id: localId), !resolved.id.hasPrefix("local:") {
                    memoId = resolved.id
                    expectedRevision = resolved.revision
                    expectedContentHash = resolved.contentHash
                    return resolved.id
                }
            }
            try env.outbox.cancelMemo(scope: scope, memoId: localId)
            try env.mirror.deleteMemo(scope: scope, id: localId)
        }

        // Capture latest editor body before minting the server memo (avoid stale empty markdown).
        await pullEditorSnapshotIfPossible()
        reconcileMarkdownWithJSON()
        let memo = try await env.session.client.createMemo(
            notebookId: notebookId.isEmpty ? (availableNotebooks.first?.id ?? "") : notebookId,
            title: title.isEmpty ? "无标题笔记" : title,
            contentMarkdown: contentMarkdown,
            tags: tags
        )
        try env.mirror.upsertMemo(scope: scope, memo: memo)
        try env.drafts.clear(scope: scope, key: DraftRepository.newKey)
        memoId = memo.id
        expectedRevision = memo.revision
        expectedContentHash = memo.contentHash
        notebookId = memo.notebookId
        return memo.id
    }

    /// Upload bytes from the system PHPicker and insert into TipTap.
    private func insertImageData(_ data: Data, filename: String) async {
        isUploading = true
        error = nil
        defer { isUploading = false }
        do {
            NSLog("MemoEditView insertImageData: start bytes=%d name=%@", data.count, filename)
            let compress = env.preferences.useCompression
            let prepared = compress
                ? ImageCompressor.compressIfNeeded(data) // Android parity: WebP @ 0.82, max edge 2560
                : Self.preparedUpload(from: data, preferredName: filename)
            NSLog(
                "MemoEditView insertImageData: start=%d → prepared=%d mime=%@ file=%@ compress=%d",
                data.count,
                prepared.data.count,
                prepared.mimeType,
                prepared.filename,
                compress ? 1 : 0
            )
            let serverId = try await materializeForImage()
            NSLog("MemoEditView insertImageData: memoId=%@", serverId)
            let resource = try await env.session.client.uploadMemoResource(
                memoId: serverId,
                filename: prepared.filename,
                mimeType: prepared.mimeType,
                data: prepared.data
            )
            NSLog("MemoEditView insertImageData: uploaded resourceId=%@ url=%@", resource.id, resource.url)
            // Prefer protected relative path so hydrate + menus work offline/online.
            let imageSrc: String = {
                if resource.url.contains("/api/v1/resources/") {
                    return ResourceCache.normalizeProtectedResourcePath(
                        resource.url,
                        baseURL: env.session.session.flatMap { URL(string: $0.baseUrl) }
                    )
                }
                return "/api/v1/resources/\(resource.id)/blob"
            }()
            // TipTap is JSON-driven: must insert via JS (markdown-only never re-renders).
            // Seed blob cache + hydrate so file:// WebView can paint the protected src.
            let inserted = await SharedTipTapRuntime.editor.insertImage(
                src: imageSrc,
                alt: prepared.filename,
                displayData: prepared.data,
                mimeType: prepared.mimeType
            )
            if !inserted {
                throw APIError(
                    status: 0,
                    code: nil,
                    message: env.preferences.t(
                        "图片已上传，但插入编辑器失败，请重试。",
                        en: "Upload succeeded but insert into editor failed. Please try again."
                    )
                )
            }
            // Snapshot TipTap JSON (order is authoritative). Only inject if the resource
            // is truly missing — never append a second image node at document end.
            await pullEditorSnapshotIfPossible()
            if !EditorContentCodec.jsonContainsResource(contentJSON, src: imageSrc) {
                ensureImageInContent(imageSrc: imageSrc, alt: prepared.filename)
            } else {
                reconcileMarkdownWithJSON()
            }
            isDirty = true
            // Persist immediately so leaving the editor cannot orphan the resource.
            saveTask?.cancel()
            await persistDraftOrQueue()
            NSLog(
                "MemoEditView insertImageData: done src=%@ mdHas=%d jsonHas=%d textLen=%d",
                imageSrc,
                contentMarkdown.contains(imageSrc) ? 1 : 0,
                EditorContentCodec.jsonContainsResource(contentJSON, src: imageSrc) ? 1 : 0,
                EditorContentCodec.plainText(markdown: contentMarkdown, json: contentJSON).count
            )
        } catch {
            self.error = error.localizedDescription
            showUploadError = true
            NSLog("MemoEditView insertImageData failed: \(error)")
        }
    }

    private static func protectedResourceRefs(in text: String) -> [String] {
        EditorContentCodec.protectedResourceRefs(in: text)
    }

    /// Rebuild markdown from TipTap JSON so block order matches the editor (and detail view).
    private func reconcileMarkdownWithJSON() {
        if let derived = EditorContentCodec.markdownFromTipTapJSON(contentJSON) {
            contentMarkdown = derived
        }
    }

    /// Last-resort: image missing from JSON after insert. Append only then, and rebuild md from JSON.
    private func ensureImageInContent(imageSrc: String, alt: String) {
        if EditorContentCodec.jsonContainsResource(contentJSON, src: imageSrc) {
            reconcileMarkdownWithJSON()
            return
        }
        contentJSON = EditorContentCodec.appendingImage(toJSON: contentJSON, src: imageSrc, alt: alt)
        reconcileMarkdownWithJSON()
    }

    /// When compression is off, still normalize HEIC → JPEG for reliable upload mime.
    private static func preparedUpload(
        from data: Data,
        preferredName: String
    ) -> (data: Data, mimeType: String, filename: String) {
        let normalized = ImagePickerData.normalize(data)
        let mime = TipTapResourceLoader.sniffImageMime(normalized)
        let resolvedMime = mime == "application/octet-stream" ? "image/jpeg" : mime
        let ext: String
        switch resolvedMime {
        case "image/png": ext = "png"
        case "image/gif": ext = "gif"
        case "image/webp": ext = "webp"
        default: ext = "jpg"
        }
        let base = (preferredName as NSString).deletingPathExtension
        let name = base.isEmpty ? "image.\(ext)" : "\(base).\(ext)"
        return (normalized, resolvedMime, name)
    }
}

// MARK: - TipTap content helpers (markdown serializer is lossy around images)

enum EditorContentCodec {
    static func protectedResourceRefs(in text: String) -> [String] {
        guard let regex = try? NSRegularExpression(
            pattern: #"/api/v1/resources/[A-Za-z0-9_-]+(?:/blob)?"#,
            options: []
        ) else { return [] }
        let ns = text as NSString
        let matches = regex.matches(in: text, options: [], range: NSRange(location: 0, length: ns.length))
        var seen = Set<String>()
        var refs: [String] = []
        for match in matches {
            let ref = ns.substring(with: match.range)
            if seen.insert(ref).inserted { refs.append(ref) }
        }
        return refs
    }

    static func looksLikeTipTapDoc(_ json: String) -> Bool {
        guard let data = json.data(using: .utf8),
              let doc = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let type = doc["type"] as? String
        else { return false }
        return type == "doc"
    }

    static func containsImageNode(_ json: String) -> Bool {
        json.contains("\"type\":\"image\"") || json.contains("\"type\": \"image\"")
    }

    /// Match resource by id so `/blob` vs bare path doesn't look like a missing image.
    static func jsonContainsResource(_ json: String, src: String) -> Bool {
        if json.contains(src) { return true }
        if let id = ResourceCache.resourceId(from: src), json.contains(id) {
            return true
        }
        return false
    }

    static func plainText(markdown: String, json: String) -> String {
        let a = plainTextFromMarkdown(markdown)
        let b = plainTextFromJSON(json)
        return a.count >= b.count ? a : b
    }

    static func plainTextFromMarkdown(_ markdown: String) -> String {
        var s = markdown
        // Strip image / link targets; keep link labels lightly.
        s = s.replacingOccurrences(of: #"!\[[^\]]*\]\([^)]*\)"#, with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: #"\[[^\]]*\]\([^)]*\)"#, with: " ", options: .regularExpression)
        s = s.replacingOccurrences(of: #"[#>*`_~\-]+"#, with: " ", options: .regularExpression)
        return s
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: " ")
    }

    static func plainTextFromJSON(_ json: String) -> String {
        guard let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data)
        else { return "" }
        var parts: [String] = []
        collectText(obj, into: &parts)
        return parts.joined(separator: " ")
    }

    private static func collectText(_ any: Any, into parts: inout [String]) {
        if let dict = any as? [String: Any] {
            if let type = dict["type"] as? String, type == "text", let text = dict["text"] as? String, !text.isEmpty {
                parts.append(text)
            }
            if let content = dict["content"] as? [Any] {
                for child in content { collectText(child, into: &parts) }
            }
            return
        }
        if let arr = any as? [Any] {
            for child in arr { collectText(child, into: &parts) }
        }
    }

    /// Best-effort TipTap JSON → markdown so sync wire format keeps body text + images.
    static func markdownFromTipTapJSON(_ json: String) -> String? {
        guard let data = json.data(using: .utf8),
              let doc = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let content = doc["content"] as? [Any]
        else { return nil }
        var lines: [String] = []
        for node in content {
            guard let dict = node as? [String: Any], let type = dict["type"] as? String else { continue }
            switch type {
            case "paragraph":
                lines.append(inlineMarkdown(dict["content"] as? [Any] ?? []))
            case "heading":
                let level = (dict["attrs"] as? [String: Any])?["level"] as? Int ?? 2
                let prefix = String(repeating: "#", count: min(max(level, 1), 6))
                lines.append("\(prefix) \(inlineMarkdown(dict["content"] as? [Any] ?? []))")
            case "image":
                let attrs = dict["attrs"] as? [String: Any] ?? [:]
                let src = attrs["src"] as? String ?? ""
                let alt = attrs["alt"] as? String ?? ""
                if !src.isEmpty { lines.append("![\(alt)](\(src))") }
            case "bulletList", "orderedList":
                if let items = dict["content"] as? [Any] {
                    for item in items {
                        guard let itemDict = item as? [String: Any] else { continue }
                        let text = blockText(itemDict)
                        if !text.isEmpty { lines.append("- \(text)") }
                    }
                }
            case "blockquote":
                let text = blockText(dict)
                if !text.isEmpty { lines.append("> \(text)") }
            case "codeBlock":
                let text = blockText(dict)
                lines.append("```\n\(text)\n```")
            case "horizontalRule":
                lines.append("---")
            default:
                let text = blockText(dict)
                if !text.isEmpty { lines.append(text) }
            }
        }
        let joined = lines.joined(separator: "\n\n").trimmingCharacters(in: .whitespacesAndNewlines)
        return joined.isEmpty ? nil : joined + "\n"
    }

    private static func blockText(_ node: [String: Any]) -> String {
        if let type = node["type"] as? String, type == "text" {
            return node["text"] as? String ?? ""
        }
        guard let content = node["content"] as? [Any] else { return "" }
        return content.compactMap { child -> String? in
            guard let dict = child as? [String: Any] else { return nil }
            if dict["type"] as? String == "image" {
                let attrs = dict["attrs"] as? [String: Any] ?? [:]
                let src = attrs["src"] as? String ?? ""
                let alt = attrs["alt"] as? String ?? ""
                return src.isEmpty ? nil : "![\(alt)](\(src))"
            }
            let t = blockText(dict)
            return t.isEmpty ? nil : t
        }.joined()
    }

    private static func inlineMarkdown(_ content: [Any]) -> String {
        content.compactMap { child -> String? in
            guard let dict = child as? [String: Any] else { return nil }
            if dict["type"] as? String == "hardBreak" { return "\n" }
            if dict["type"] as? String == "text" {
                var t = dict["text"] as? String ?? ""
                let marks = dict["marks"] as? [[String: Any]] ?? []
                // Apply outer marks last so **`code`** style nesting is reasonable.
                for mark in marks.reversed() {
                    switch mark["type"] as? String {
                    case "code":
                        t = "`\(t)`"
                    case "bold", "strong":
                        t = "**\(t)**"
                    case "italic", "em":
                        t = "*\(t)*"
                    case "strike":
                        t = "~~\(t)~~"
                    case "link":
                        let href = (mark["attrs"] as? [String: Any])?["href"] as? String ?? ""
                        t = "[\(t)](\(href))"
                    default:
                        break
                    }
                }
                return t
            }
            return blockText(dict)
        }.joined()
    }

    /// Append image node without wiping existing document content.
    static func appendingImage(toJSON json: String, src: String, alt: String) -> String {
        if json.contains(src) { return json }
        guard let data = json.data(using: .utf8),
              var doc = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            // Only invent a stub when we truly have no document yet.
            let safeAlt = alt.replacingOccurrences(of: "\\", with: "\\\\").replacingOccurrences(of: "\"", with: "\\\"")
            return """
            {"type":"doc","content":[{"type":"paragraph"},{"type":"image","attrs":{"src":"\(src)","alt":"\(safeAlt)"}},{"type":"paragraph"}]}
            """
        }
        var content = doc["content"] as? [[String: Any]] ?? []
        // Avoid blanking a doc that already has text — only append.
        content.append([
            "type": "image",
            "attrs": ["src": src, "alt": alt] as [String: Any],
        ])
        content.append(["type": "paragraph"] as [String: Any])
        doc["type"] = doc["type"] ?? "doc"
        doc["content"] = content
        guard let out = try? JSONSerialization.data(withJSONObject: doc),
              let s = String(data: out, encoding: .utf8)
        else { return json }
        return s
    }
}

// MARK: - System PHPicker (reliable; PhotosPicker+Transferable was a silent no-op)

private enum ImagePickerResult {
    case cancelled
    case failed(String)
    case picked(Data, filename: String)
}

/// UIKit PHPicker wrapper — loads UIImage/data via NSItemProvider (not Transferable).
private struct SystemImagePicker: UIViewControllerRepresentable {
    var onFinish: (ImagePickerResult) -> Void

    func makeUIViewController(context: Context) -> PHPickerViewController {
        var config = PHPickerConfiguration(photoLibrary: .shared())
        config.filter = .images
        config.selectionLimit = 1
        config.preferredAssetRepresentationMode = .current
        let picker = PHPickerViewController(configuration: config)
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ uiViewController: PHPickerViewController, context: Context) {}

    func makeCoordinator() -> Coordinator {
        Coordinator(onFinish: onFinish)
    }

    final class Coordinator: NSObject, PHPickerViewControllerDelegate {
        let onFinish: (ImagePickerResult) -> Void
        private var settled = false

        init(onFinish: @escaping (ImagePickerResult) -> Void) {
            self.onFinish = onFinish
        }

        func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
            guard !settled else { return }
            guard let provider = results.first?.itemProvider else {
                settled = true
                DispatchQueue.main.async { self.onFinish(.cancelled) }
                return
            }
            Task {
                do {
                    let (data, name) = try await Self.loadImage(from: provider)
                    await MainActor.run {
                        guard !self.settled else { return }
                        self.settled = true
                        self.onFinish(.picked(data, filename: name))
                    }
                } catch {
                    await MainActor.run {
                        guard !self.settled else { return }
                        self.settled = true
                        self.onFinish(.failed(error.localizedDescription))
                    }
                }
            }
        }

        private static func loadImage(from provider: NSItemProvider) async throws -> (Data, String) {
            // 1) UIImage path — most reliable for Photos library assets.
            if provider.canLoadObject(ofClass: UIImage.self) {
                let image = try await withCheckedThrowingContinuation { (cont: CheckedContinuation<UIImage, Error>) in
                    provider.loadObject(ofClass: UIImage.self) { object, error in
                        if let image = object as? UIImage {
                            cont.resume(returning: image)
                        } else {
                            cont.resume(
                                throwing: error
                                    ?? APIError(status: 0, code: nil, message: "无法解码图片")
                            )
                        }
                    }
                }
                if let data = image.jpegData(compressionQuality: 0.92), !data.isEmpty {
                    return (data, "image.jpg")
                }
            }

            // 2) Typed data representations.
            let typeIds = [
                UTType.jpeg.identifier,
                UTType.png.identifier,
                UTType.heic.identifier,
                UTType.image.identifier,
            ]
            for typeId in typeIds where provider.hasItemConformingToTypeIdentifier(typeId) {
                if let data = try? await loadData(provider, typeIdentifier: typeId), !data.isEmpty {
                    let normalized = ImagePickerData.normalize(data)
                    let mime = TipTapResourceLoader.sniffImageMime(normalized)
                    let ext = mime == "image/png" ? "png" : "jpg"
                    return (normalized, "image.\(ext)")
                }
            }

            throw APIError(status: 0, code: nil, message: "无法读取所选图片，请换一张重试。")
        }

        private static func loadData(_ provider: NSItemProvider, typeIdentifier: String) async throws -> Data {
            try await withCheckedThrowingContinuation { cont in
                provider.loadDataRepresentation(forTypeIdentifier: typeIdentifier) { data, error in
                    if let data {
                        cont.resume(returning: data)
                    } else {
                        cont.resume(
                            throwing: error
                                ?? APIError(status: 0, code: nil, message: "读取图片数据失败")
                        )
                    }
                }
            }
        }
    }
}

enum ImagePickerData {
    /// HEIC / unknown → JPEG so upload mime is valid and ImageCompressor can decode.
    static func normalize(_ data: Data) -> Data {
        if data.starts(with: [0xFF, 0xD8, 0xFF]) { return data } // JPEG
        if data.starts(with: [0x89, 0x50, 0x4E, 0x47]) { return data } // PNG
        if data.starts(with: [0x47, 0x49, 0x46, 0x38]) { return data } // GIF
        if data.count >= 12 {
            let riff = data.prefix(4)
            let webp = data.dropFirst(8).prefix(4)
            if riff.elementsEqual([0x52, 0x49, 0x46, 0x46]), webp.elementsEqual([0x57, 0x45, 0x42, 0x50]) {
                return data
            }
        }
        if let image = UIImage(data: data), let jpeg = image.jpegData(compressionQuality: 0.92) {
            return jpeg
        }
        return data
    }
}

// MARK: - Compact notebook picker for create/edit

private struct EditNotebookPickerSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss
    let notebooks: [Notebook]
    let selectedId: String
    var onSelect: (String) -> Void

    var body: some View {
        VStack(spacing: 0) {
            HStack {
                Text(env.preferences.t("选择笔记本", en: "Choose notebook"))
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(AppTheme.title)
                Spacer()
                Button(env.preferences.t("关闭", en: "Close")) { dismiss() }
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundStyle(AppTheme.slate)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .background(Color.white)
            .overlay(alignment: .bottom) {
                Rectangle().fill(AppTheme.border).frame(height: 1)
            }

            List {
                ForEach(notebooks, id: \.id) { nb in
                    Button {
                        onSelect(nb.id)
                        dismiss()
                    } label: {
                        HStack {
                            Text(nb.name)
                                .foregroundStyle(AppTheme.title)
                            Spacer()
                            if nb.id == selectedId {
                                Image(systemName: "checkmark")
                                    .foregroundStyle(AppTheme.accent)
                            }
                        }
                    }
                }
            }
            .listStyle(.plain)
        }
        .background(Color.white)
    }
}
