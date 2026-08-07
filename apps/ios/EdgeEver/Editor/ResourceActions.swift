import SwiftUI
import UIKit
import WebKit

// MARK: - Target

struct ResourceTarget: Equatable, Hashable, Identifiable {
    var kind: Kind
    var href: String
    var filename: String
    var resourceId: String

    var id: String { "\(kind.rawValue):\(resourceId)" }

    enum Kind: String, Equatable {
        case image
        case attachment
    }

    /// Extract resource id from `/api/v1/resources/:id/blob` — matches shared `getResourceIdFromUrl`.
    static func resourceId(from href: String) -> String? {
        if let id = ResourceCache.resourceId(from: href), id != "blob", !id.isEmpty {
            return id
        }
        return nil
    }

    static func parse(_ json: String) -> ResourceTarget? {
        guard
            let data = json.data(using: .utf8),
            let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
            let href = obj["href"] as? String,
            let filename = obj["filename"] as? String,
            let kindRaw = obj["kind"] as? String,
            let kind = Kind(rawValue: kindRaw)
        else { return nil }
        let fromJson = (obj["resourceId"] as? String).flatMap { id -> String? in
            id == "blob" || id.isEmpty ? nil : id
        }
        guard let id = resourceId(from: href) ?? fromJson else { return nil }
        let cleanName = filename
            .replacingOccurrences(of: #"^\s*(?:附件[：:]|Attachment:)\s*"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let blobHref: String = {
            if href.contains("/api/v1/resources/") {
                return ResourceCache.normalizeProtectedResourcePath(href, baseURL: nil)
            }
            return "/api/v1/resources/\(id)/blob"
        }()
        return ResourceTarget(
            kind: kind,
            href: blobHref,
            filename: cleanName.isEmpty ? (kind == .image ? "image-\(id)" : id) : cleanName,
            resourceId: id
        )
    }
}

// MARK: - Android-parity bottom sheet

/// Matches `MobileResourceActions` (RN): bottom sheet with Share / Download / Rename / Delete.
struct ResourceActionSheet: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    let target: ResourceTarget
    /// When false, rename/delete are disabled (local-only / deleted memo).
    var canMutate: Bool = true
    var onContentChanged: (() -> Void)?

    @State private var mode: Mode = .actions
    @State private var filename = ""
    @State private var pending = false
    @State private var error: String?
    @State private var showDeleteConfirm = false
    /// Share sheet (系统分享)
    @State private var shareFile: ExportFile?
    /// Files export picker (下载 / 存储到「文件」)
    @State private var exportFile: ExportFile?
    @State private var feedback: ActionFeedback?

    private enum Mode {
        case actions
        case rename
    }

    private struct ExportFile: Identifiable {
        let id = UUID()
        let url: URL
    }

    private struct ActionFeedback: Identifiable {
        let id = UUID()
        let title: String
        let message: String
    }

    private var actionsTitle: String {
        target.kind == .image
            ? env.preferences.t("图片操作", en: "Image actions")
            : env.preferences.t("附件操作", en: "Attachment actions")
    }

    private var renameTitle: String {
        target.kind == .image
            ? env.preferences.t("重命名图片", en: "Rename image")
            : env.preferences.t("重命名附件", en: "Rename attachment")
    }

    private var deleteTitle: String {
        target.kind == .image
            ? env.preferences.t("删除图片", en: "Delete image")
            : env.preferences.t("删除附件", en: "Delete attachment")
    }

    private var deleteConfirm: String {
        target.kind == .image
            ? env.preferences.t(
                "图片会从存储空间和当前笔记中永久删除，此操作无法撤销。",
                en: "The image will be permanently removed from storage and this note. This cannot be undone."
            )
            : env.preferences.t(
                "附件会从存储空间和当前笔记中永久删除，此操作无法撤销。",
                en: "The attachment will be permanently removed from storage and this note. This cannot be undone."
            )
    }

    var body: some View {
        VStack(spacing: 0) {
            // Handle
            Capsule()
                .fill(Color(hex: 0xCBD5E1))
                .frame(width: 42, height: 4)
                .padding(.top, 10)
                .padding(.bottom, 14)

            // Header
            HStack(alignment: .center, spacing: 8) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(mode == .rename ? renameTitle : actionsTitle)
                        .font(.system(size: 19, weight: .heavy))
                        .foregroundStyle(Color(hex: 0x0F172A))
                    Text(target.filename)
                        .font(.system(size: 13))
                        .foregroundStyle(Color(hex: 0x64748B))
                        .lineLimit(1)
                }
                Spacer(minLength: 8)
                Button {
                    dismiss()
                } label: {
                    Image(systemName: "xmark")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundStyle(Color(hex: 0x475569))
                        .frame(width: 40, height: 40)
                }
                .buttonStyle(.plain)
                .disabled(pending)
                .accessibilityLabel(env.preferences.t("取消", en: "Cancel"))
            }

            if mode == .actions {
                actionsBody
            } else {
                renameBody
            }

            if pending {
                HStack(spacing: 8) {
                    ProgressView()
                        .controlSize(.small)
                    Text(env.preferences.t("正在准备文件…", en: "Preparing file…"))
                        .font(.system(size: 13))
                        .foregroundStyle(Color(hex: 0x64748B))
                    Spacer()
                }
                .padding(.top, 10)
            }

            if let error {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundStyle(Color(hex: 0xBE123C))
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .padding(.top, 10)
            }
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 28)
        .background(Color.white)
        .onAppear { filename = target.filename }
        .confirmationDialog(deleteTitle, isPresented: $showDeleteConfirm, titleVisibility: .visible) {
            Button(env.preferences.t("删除", en: "Delete"), role: .destructive) {
                Task { await runDelete() }
            }
            Button(env.preferences.t("取消", en: "Cancel"), role: .cancel) {}
        } message: {
            Text(deleteConfirm)
        }
        .sheet(item: $shareFile) { file in
            ActivityShareView(items: [file.url]) { completed, activityType, activityError in
                shareFile = nil
                if let activityError {
                    feedback = ActionFeedback(
                        title: env.preferences.t("分享失败", en: "Share failed"),
                        message: activityError.localizedDescription
                    )
                    return
                }
                // User dismissed without choosing an action — not an error.
                if completed, activityType != nil {
                    feedback = ActionFeedback(
                        title: env.preferences.t("已完成", en: "Done"),
                        message: env.preferences.t(
                            "已通过系统分享面板处理：\(target.filename)",
                            en: "Shared via system sheet: \(target.filename)"
                        )
                    )
                }
            }
            .presentationDetents([.medium, .large])
        }
        .sheet(item: $exportFile) { file in
            DocumentExportView(fileURL: file.url) { result in
                exportFile = nil
                switch result {
                case .success(let saved):
                    if saved {
                        feedback = ActionFeedback(
                            title: env.preferences.t("下载成功", en: "Downloaded"),
                            message: env.preferences.t(
                                "已保存：\(target.filename)",
                                en: "Saved \(target.filename)"
                            )
                        )
                    }
                    // cancelled → no toast (matches Android SAF cancel)
                case .failure(let err):
                    feedback = ActionFeedback(
                        title: env.preferences.t("无法下载", en: "Unable to download"),
                        message: err.localizedDescription
                    )
                }
            }
            .presentationDetents([.medium, .large])
        }
        .alert(item: $feedback) { item in
            Alert(
                title: Text(item.title),
                message: Text(item.message),
                dismissButton: .default(Text(env.preferences.t("好的", en: "OK")))
            )
        }
        .interactiveDismissDisabled(pending)
    }

    private var actionsBody: some View {
        VStack(spacing: 2) {
            actionRow(
                systemImage: "square.and.arrow.up",
                label: env.preferences.t("分享", en: "Share"),
                danger: false,
                disabled: false
            ) {
                Task { await runShare() }
            }
            actionRow(
                systemImage: "arrow.down.circle",
                label: env.preferences.t("下载", en: "Download"),
                danger: false,
                disabled: false
            ) {
                Task { await runDownload() }
            }
            actionRow(
                systemImage: "pencil",
                label: env.preferences.t("重命名", en: "Rename"),
                danger: false,
                disabled: !canMutate
            ) {
                mode = .rename
            }
            Rectangle()
                .fill(Color(hex: 0xE2E8F0))
                .frame(height: 1)
                .padding(.vertical, 4)
            actionRow(
                systemImage: "trash",
                label: env.preferences.t("删除", en: "Delete"),
                danger: true,
                disabled: !canMutate
            ) {
                showDeleteConfirm = true
            }
            if !canMutate {
                Text(env.preferences.t(
                    "资源同步完成后才能重命名或删除。",
                    en: "Rename and delete are available after the resource has synced."
                ))
                .font(.system(size: 12))
                .foregroundStyle(Color(hex: 0x64748B))
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 4)
            }
        }
        .padding(.top, 8)
    }

    private var renameBody: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(env.preferences.t("文件名", en: "Filename"))
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(Color(hex: 0x475569))
            TextField("", text: $filename)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .padding(.horizontal, 12)
                .frame(minHeight: 46)
                .background(
                    RoundedRectangle(cornerRadius: 9)
                        .stroke(Color(hex: 0xCBD5E1), lineWidth: 1)
                )
                .disabled(pending)

            HStack(spacing: 10) {
                Spacer()
                Button {
                    mode = .actions
                } label: {
                    Text(env.preferences.t("取消", en: "Cancel"))
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Color(hex: 0x475569))
                        .frame(minWidth: 84, minHeight: 42)
                        .overlay(
                            RoundedRectangle(cornerRadius: 9)
                                .stroke(Color(hex: 0xCBD5E1), lineWidth: 1)
                        )
                }
                .buttonStyle(.plain)
                .disabled(pending)

                Button {
                    Task { await runRename() }
                } label: {
                    Group {
                        if pending {
                            ProgressView().tint(.white)
                        } else {
                            Text(env.preferences.t("保存", en: "Save"))
                                .font(.system(size: 14, weight: .bold))
                                .foregroundStyle(.white)
                        }
                    }
                    .frame(minWidth: 84, minHeight: 42)
                    .background(Color(hex: 0x059669))
                    .clipShape(RoundedRectangle(cornerRadius: 9))
                }
                .buttonStyle(.plain)
                .disabled(pending || filename.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                .opacity(pending || filename.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? 0.45 : 1)
            }
            .padding(.top, 6)
        }
        .padding(.top, 14)
    }

    private func actionRow(
        systemImage: String,
        label: String,
        danger: Bool,
        disabled: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 14) {
                Image(systemName: systemImage)
                    .font(.system(size: 17, weight: .semibold))
                    .foregroundStyle(danger ? Color(hex: 0xBE123C) : Color(hex: 0x0F172A))
                    .frame(width: 22)
                Text(label)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(danger ? Color(hex: 0xBE123C) : Color(hex: 0x0F172A))
                Spacer()
            }
            .frame(minHeight: 52)
            .padding(.horizontal, 6)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(disabled || pending)
        .opacity(disabled || pending ? 0.45 : 1)
    }

    // MARK: - Actions

    private func runShare() async {
        pending = true
        error = nil
        defer { pending = false }
        do {
            let fileURL = try await fetchResourceFile()
            // Present as a child sheet (do not dismiss first — that dropped all feedback).
            shareFile = ExportFile(url: fileURL)
        } catch {
            // Keep menu open and surface the error (network / 401 / missing session).
            self.error = error.localizedDescription
            feedback = ActionFeedback(
                title: env.preferences.t("分享失败", en: "Share failed"),
                message: error.localizedDescription
            )
        }
    }

    private func runDownload() async {
        pending = true
        error = nil
        defer { pending = false }
        do {
            let fileURL = try await fetchResourceFile()
            // System Files export picker — user chooses a folder, then we toast success.
            exportFile = ExportFile(url: fileURL)
        } catch {
            self.error = error.localizedDescription
            feedback = ActionFeedback(
                title: env.preferences.t("无法下载", en: "Unable to download"),
                message: error.localizedDescription
            )
        }
    }

    private func runRename() async {
        let next = filename.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !next.isEmpty else { return }
        pending = true
        error = nil
        defer { pending = false }
        do {
            _ = try await env.session.client.renameResource(id: target.resourceId, filename: next)
            onContentChanged?()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func runDelete() async {
        pending = true
        error = nil
        defer { pending = false }
        do {
            try await env.session.client.deleteResource(id: target.resourceId)
            onContentChanged?()
            dismiss()
        } catch {
            self.error = error.localizedDescription
        }
    }

    private func fetchResourceFile() async throws -> URL {
        guard let base = env.session.session.flatMap({ URL(string: $0.baseUrl) }) else {
            throw ResourceActionError.noSession
        }
        let token = env.session.session?.token
        let path = "/api/v1/resources/\(target.resourceId)/blob"
        let client = APIClient(baseURL: base, token: token)
        let result = try await client.getResourceData(path: path)
        guard !result.data.isEmpty else { throw ResourceActionError.emptyFile }
        let safeName = target.filename
            .replacingOccurrences(of: "/", with: "_")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let name = safeName.isEmpty ? "\(target.resourceId).bin" : safeName
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("edgeever-share", isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let fileURL = dir.appendingPathComponent(name)
        if FileManager.default.fileExists(atPath: fileURL.path) {
            try FileManager.default.removeItem(at: fileURL)
        }
        try result.data.write(to: fileURL, options: .atomic)
        // Document picker / share sheet need a file URL that remains readable while presented.
        return fileURL
    }
}

// MARK: - Fullscreen image preview (viewer)

/// SVG-friendly fullscreen preview using WKWebView (handles demo cat SVG).
struct ResourceSVGPreview: UIViewRepresentable {
    let dataURL: String

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        let web = WKWebView(frame: .zero, configuration: config)
        web.isOpaque = false
        web.backgroundColor = .black
        web.scrollView.backgroundColor = .black
        web.scrollView.minimumZoomScale = 1
        web.scrollView.maximumZoomScale = 4
        return web
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        let html = """
        <!DOCTYPE html><html><head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=4">
        <style>
          html,body{margin:0;height:100%;background:#000;display:flex;align-items:center;justify-content:center;}
          img{max-width:100%;max-height:100%;object-fit:contain;}
        </style></head><body>
        <img src="\(dataURL.replacingOccurrences(of: "\"", with: "&quot;"))" />
        </body></html>
        """
        webView.loadHTMLString(html, baseURL: nil)
    }
}

struct ResourceImagePreviewHost: View {
    let source: String
    let alt: String
    let baseURL: URL?
    let token: String?
    var onClose: () -> Void

    @State private var displayURL: String?
    @State private var failed = false

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if let displayURL {
                if displayURL.contains("image/svg") || displayURL.hasPrefix("data:image/svg") {
                    ResourceSVGPreview(dataURL: displayURL)
                        .ignoresSafeArea()
                } else if let data = dataFromDataURL(displayURL), let img = UIImage(data: data) {
                    Image(uiImage: img)
                        .resizable()
                        .scaledToFit()
                        .padding(12)
                } else {
                    ResourceSVGPreview(dataURL: displayURL)
                        .ignoresSafeArea()
                }
            } else if failed {
                Text(alt.isEmpty ? "Image" : alt)
                    .foregroundStyle(.white.opacity(0.7))
            } else {
                ProgressView().tint(.white)
            }

            VStack {
                HStack {
                    Spacer()
                    Button(action: onClose) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .bold))
                            .foregroundStyle(.white)
                            .frame(width: 44, height: 44)
                            .background(Circle().fill(Color.white.opacity(0.18)))
                    }
                    .buttonStyle(.plain)
                    .padding(16)
                }
                Spacer()
            }
        }
        .task { await resolve() }
    }

    private func resolve() async {
        if source.hasPrefix("data:") {
            displayURL = source
            return
        }
        let cache = ResourceCache()
        if let url = await TipTapWebView.Coordinator.loadResourceDataURL(
            source: source,
            baseURL: baseURL,
            token: token,
            resourceCache: cache
        ) {
            displayURL = url
        } else {
            failed = true
        }
    }

    private func dataFromDataURL(_ url: String) -> Data? {
        guard url.hasPrefix("data:"), let comma = url.firstIndex(of: ",") else { return nil }
        let meta = String(url[..<comma])
        let payload = String(url[url.index(after: comma)...])
        if meta.contains(";base64") {
            return Data(base64Encoded: payload)
        }
        return payload.removingPercentEncoding.flatMap { Data($0.utf8) }
    }
}

// MARK: - Share / export helpers

private enum ResourceActionError: LocalizedError {
    case noSession
    case emptyFile
    var errorDescription: String? {
        switch self {
        case .noSession: return "当前无法读取资源，请检查是否已登录实例。"
        case .emptyFile: return "资源内容为空。"
        }
    }
}

/// System share sheet with completion so the user always gets feedback.
private struct ActivityShareView: UIViewControllerRepresentable {
    let items: [Any]
    var onComplete: (_ completed: Bool, _ activityType: UIActivity.ActivityType?, _ error: Error?) -> Void

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let vc = UIActivityViewController(activityItems: items, applicationActivities: nil)
        vc.completionWithItemsHandler = { activityType, completed, _, error in
            onComplete(completed, activityType, error)
        }
        return vc
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

/// "Download" on iOS = export copy via Files document picker (Android SAF parity).
private struct DocumentExportView: UIViewControllerRepresentable {
    let fileURL: URL
    var onFinish: (Result<Bool, Error>) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(onFinish: onFinish) }

    func makeUIViewController(context: Context) -> UIDocumentPickerViewController {
        let picker = UIDocumentPickerViewController(forExporting: [fileURL], asCopy: true)
        picker.delegate = context.coordinator
        picker.shouldShowFileExtensions = true
        return picker
    }

    func updateUIViewController(_ uiViewController: UIDocumentPickerViewController, context: Context) {}

    final class Coordinator: NSObject, UIDocumentPickerDelegate {
        let onFinish: (Result<Bool, Error>) -> Void
        init(onFinish: @escaping (Result<Bool, Error>) -> Void) { self.onFinish = onFinish }

        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
            onFinish(.success(!urls.isEmpty))
        }

        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
            onFinish(.success(false))
        }
    }
}
