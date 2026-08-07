import SwiftUI
import Pow

struct NotesListView: View {
    @Environment(AppEnvironment.self) private var env
    @Bindable var store: WorkspaceStore
    @Binding var path: NavigationPath

    var body: some View {
        Group {
            if store.notebooks.isEmpty && store.memos.isEmpty && !store.isLoadingList {
                emptyCard(
                    title: env.preferences.t("暂无笔记本", en: "No notebooks"),
                    description: env.preferences.t(
                        "同步完成后，笔记本会出现在这里。可在桌面/Web 端创建笔记本。",
                        en: "Notebooks appear after sync. Create them on desktop/web."
                    ),
                    showCreate: false
                )
                .transition(Motion.softFade)
            } else if store.memos.isEmpty && !store.isLoadingList {
                emptyCard(title: emptyTitle, description: emptyDescription, showCreate: store.searchText.isEmpty && store.filter == .all)
                    .transition(Motion.softFade)
            } else {
                ScrollView {
                    LazyVStack(spacing: 0) {
                        ForEach(store.memos) { memo in
                            memoCard(for: memo)
                                .padding(.horizontal, 12)
                                .padding(.bottom, env.preferences.listDensity.cardBottomMargin)
                                // Identity-based transition when filter/search reshuffles the set.
                                .transition(Motion.cardAppear)
                                .onAppear {
                                    if memo.id == store.memos.last?.id {
                                        store.loadMore(env: env)
                                    }
                                }
                        }
                        if store.isLoadingMore {
                            ProgressView()
                                .tint(AppTheme.title)
                                .padding(.vertical, 18)
                        }
                    }
                    .padding(.top, 12)
                    // Only a little air above the solid bar; elevated + overlaps content (Android).
                    // Large padding here paints an empty #f8fafc strip above the white chrome.
                    .padding(.bottom, 8)
                    .animation(Motion.listContent, value: store.memos.map(\.id))
                    .animation(Motion.listContent, value: store.filter)
                    .animation(Motion.listContent, value: store.searchText)
                }
                // Parent owns bottom safe area via bottom chrome — do not leave a second gap strip.
                .contentMargins(.bottom, 0, for: .scrollContent)
                .background(AppTheme.background)
            }
        }
        .animation(Motion.listContent, value: store.memos.isEmpty)
        .overlay(alignment: .bottom) {
            if let err = store.listError {
                Text(err)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AppTheme.danger)
                    .padding(10)
                    .frame(maxWidth: .infinity)
                    .background(Color.white.opacity(0.96))
                    .transition(Motion.softFade)
                    .edgeEverErrorShake(on: err)
            }
        }
        .animation(Motion.search, value: store.listError)
    }

    private var emptyTitle: String {
        if !store.searchText.trimmingCharacters(in: .whitespaces).isEmpty {
            return env.preferences.t("没有找到匹配笔记", en: "No matching notes")
        }
        if store.filter != .all {
            return env.preferences.t("没有符合筛选的笔记", en: "No notes match this filter")
        }
        return env.preferences.t("暂无笔记", en: "No notes yet")
    }

    private var emptyDescription: String {
        if !store.searchText.trimmingCharacters(in: .whitespaces).isEmpty {
            return env.preferences.t("换个关键词再试", en: "Try another keyword")
        }
        if store.filter != .all {
            return env.preferences.t("试试切换筛选条件，或调整搜索关键词。", en: "Try another filter or search.")
        }
        return env.preferences.t(
            "先创建一条笔记，之后可以在这里快速预览、搜索和批量整理。",
            en: "Create a note to preview, search, and batch-organize here."
        )
    }

    private func emptyCard(title: String, description: String, showCreate: Bool) -> some View {
        VStack(spacing: 10) {
            Text(title)
                .font(.system(size: 16, weight: .heavy))
                .foregroundStyle(AppTheme.meta)
            Text(description)
                .font(.system(size: 13))
                .foregroundStyle(AppTheme.secondary)
                .multilineTextAlignment(.center)
            if showCreate {
                // Create is primarily the bottom-nav center button (Android parity).
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 16)
        .padding(.vertical, 34)
        .background(Color.white)
        .overlay(
            RoundedRectangle(cornerRadius: 8)
                .stroke(style: StrokeStyle(lineWidth: 1, dash: [5, 4]))
                .foregroundStyle(Color(hex: 0xCBD5E1))
        )
        .padding(.horizontal, 12)
        .padding(.top, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .background(AppTheme.background)
    }

    @ViewBuilder
    private func memoCard(for memo: MemoSummary) -> some View {
        let selected = store.selectedMemoIds.contains(memo.id)
        let density = env.preferences.listDensity

        Button {
            if store.selectionMode {
                store.toggleSelected(memo.id)
            } else {
                path.append(memo.id)
            }
        } label: {
            HStack(alignment: .center, spacing: 0) {
                if store.selectionMode {
                    ZStack {
                        Circle()
                            .stroke(selected ? AppTheme.title : Color(hex: 0xCBD5E1), lineWidth: 1)
                            .background(Circle().fill(selected ? AppTheme.title : Color.clear))
                            .frame(width: 24, height: 24)
                        if selected {
                            Image(systemName: "checkmark")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundStyle(.white)
                        }
                    }
                    .frame(width: 44)
                    .padding(.leading, 8)
                    .animation(Motion.chip, value: selected)
                }

                MemoCardContent(
                    memo: memo,
                    density: density,
                    locale: env.preferences.resolvedLocale,
                    isEnglish: env.preferences.isEnglish
                )
                .padding(density.cardPadding)
                .padding(.leading, store.selectionMode ? 12 : density.cardPadding)
            }
            .frame(maxWidth: .infinity, minHeight: density.cardMinHeight, alignment: .leading)
            .background(selected ? AppTheme.background : Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(selected ? AppTheme.border : AppTheme.cardBorder, lineWidth: 1)
            )
            .animation(Motion.chip, value: selected)
        }
        .buttonStyle(MemoCardPressStyle())
        .edgeEverSelectionFeedback(selected)
        .simultaneousGesture(
            LongPressGesture(minimumDuration: 0.52).onEnded { _ in
                if !store.selectionMode {
                    store.enterSelection(memoId: memo.id)
                    UIImpactFeedbackGenerator(style: .medium).impactOccurred()
                }
            }
        )
        .contextMenu {
            Button {
                Task { await store.togglePin(env: env, memo: memo) }
            } label: {
                Label(
                    memo.isPinned
                        ? env.preferences.t("取消置顶", en: "Unpin")
                        : env.preferences.t("置顶", en: "Pin"),
                    systemImage: memo.isPinned ? "pin.slash" : "pin"
                )
            }
            Button(role: .destructive) {
                Task { await store.softDelete(env: env, memoId: memo.id) }
            } label: {
                Label(env.preferences.t("删除", en: "Delete"), systemImage: "trash")
            }
        }
    }
}

/// Android MemoCard content: title (+ pin star) → optional excerpt → date + tag chips.
struct MemoCardContent: View {
    let memo: MemoSummary
    var density: ListDensity = .preview
    var locale: Locale = .current
    var isEnglish: Bool = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(alignment: .center, spacing: 6) {
                if memo.isPinned {
                    Text("★")
                        .font(.system(size: 16))
                        .foregroundStyle(AppTheme.secondary)
                        .frame(width: 16, height: 16)
                }
                Text(displayTitle)
                    .font(AppTheme.memoTitleFont)
                    .foregroundStyle(AppTheme.title)
                    .lineLimit(1)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }

            if density.showsExcerpt {
                Text(memo.excerpt.isEmpty ? (isEnglish ? "Empty note" : "空笔记") : memo.excerpt)
                    .font(AppTheme.memoExcerptFont)
                    .foregroundStyle(AppTheme.body)
                    .lineLimit(2)
                    .lineSpacing(2)
                    .frame(minHeight: 40, alignment: .topLeading)
                    .padding(.top, 8)
            }

            HStack(alignment: .center, spacing: 8) {
                Text(MemoPreviewDate.format(memo.updatedAt, locale: locale, isEnglish: isEnglish))
                    .font(AppTheme.memoDateFont)
                    .foregroundStyle(AppTheme.meta)
                ForEach(Array(memo.tags.prefix(3)), id: \.self) { tag in
                    Text("#\(tag)")
                        .font(AppTheme.tagFont)
                        .foregroundStyle(AppTheme.title)
                        .padding(.horizontal, 6)
                        .padding(.vertical, 2)
                        .background(AppTheme.tagBackground)
                        .clipShape(RoundedRectangle(cornerRadius: 2, style: .continuous))
                }
            }
            .padding(.top, density.metaTop)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var displayTitle: String {
        let t = memo.title?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return t.isEmpty ? "无标题笔记" : t
    }
}

// MemoCardPressStyle lives in DesignSystem/Motion.swift (shared with Android timing curves).
