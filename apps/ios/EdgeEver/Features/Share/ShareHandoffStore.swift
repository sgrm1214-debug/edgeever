import Foundation

/// Reads share payloads written by Share Extension via App Group.
@MainActor
final class ShareHandoffStore {
    static let appGroupId = "group.org.edgeever.mobile"
    static let payloadKey = "edgeever.share.payload"

    struct SharePayload: Codable, Equatable {
        var text: String?
        var url: String?
        var title: String?
    }

    func consumePending() -> [SharePayload] {
        guard let defaults = UserDefaults(suiteName: Self.appGroupId) else { return [] }
        guard let data = defaults.data(forKey: Self.payloadKey) else { return [] }
        defaults.removeObject(forKey: Self.payloadKey)
        if let typed = try? EdgeEverJSON.decoder.decode([SharePayload].self, from: data) {
            return typed
        }
        // Share extension may write JSONSerialization dictionaries with optional nulls.
        guard let raw = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]] else {
            return []
        }
        return raw.map { dict in
            SharePayload(
                text: dict["text"] as? String,
                url: dict["url"] as? String,
                title: dict["title"] as? String
            )
        }
    }

    static func writeForExtension(_ payloads: [SharePayload]) {
        guard let defaults = UserDefaults(suiteName: appGroupId) else { return }
        guard let data = try? EdgeEverJSON.encoder.encode(payloads) else { return }
        defaults.set(data, forKey: payloadKey)
    }
}
