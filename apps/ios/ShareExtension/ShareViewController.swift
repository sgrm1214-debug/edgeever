import UIKit
import UniformTypeIdentifiers

/// Lightweight share extension: text + web URL → App Group → open main app.
class ShareViewController: UIViewController {
    private let appGroupId = "group.org.edgeever.mobile"
    private let hostScheme = "edgeever"

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .systemBackground
        Task { await handleShare() }
    }

    private func handleShare() async {
        guard let items = extensionContext?.inputItems as? [NSExtensionItem] else {
            extensionContext?.completeRequest(returningItems: nil)
            return
        }
        var text: String?
        var urlString: String?
        var title: String?

        for item in items {
            title = item.attributedContentText?.string
            for provider in item.attachments ?? [] {
                if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier),
                   let url = try? await provider.loadItem(forTypeIdentifier: UTType.url.identifier) as? URL
                {
                    urlString = url.absoluteString
                } else if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier),
                          let str = try? await provider.loadItem(forTypeIdentifier: UTType.plainText.identifier) as? String
                {
                    text = str
                }
            }
        }

        let payload: [[String: Any]] = [[
            "text": text as Any,
            "url": urlString as Any,
            "title": title as Any,
        ]]
        if let data = try? JSONSerialization.data(withJSONObject: payload),
           let defaults = UserDefaults(suiteName: appGroupId)
        {
            defaults.set(data, forKey: "edgeever.share.payload")
        }

        if let url = URL(string: "\(hostScheme)://share") {
            extensionContext?.open(url) { [weak self] _ in
                self?.extensionContext?.completeRequest(returningItems: nil)
            }
            return
        }
        extensionContext?.completeRequest(returningItems: nil)
    }
}
