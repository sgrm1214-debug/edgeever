import SwiftUI

@main
struct EdgeEverApp: App {
    @State private var env = AppEnvironment()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(env)
                .onOpenURL { url in
                    // Share Extension opens edgeever://share after writing App Group payload.
                    guard url.scheme == "edgeever" else { return }
                    // WorkspaceView consumes pending share payloads on appear / foreground.
                    NotificationCenter.default.post(name: .edgeEverShareReceived, object: nil)
                }
        }
    }
}

/// Simulator / debug helper. Enabled only when launch args provide credentials:
/// `-EdgeEverAutoLoginURL` `-EdgeEverAutoLoginUser` `-EdgeEverAutoLoginPassword`
enum AutoLogin {
    @MainActor
    static func attemptIfConfigured(env: AppEnvironment) async {
        let args = ProcessInfo.processInfo.arguments
        func value(for flag: String) -> String? {
            guard let idx = args.firstIndex(of: flag), args.index(after: idx) < args.endIndex else {
                return nil
            }
            return args[args.index(after: idx)]
        }
        guard
            let base = value(for: "-EdgeEverAutoLoginURL"),
            let user = value(for: "-EdgeEverAutoLoginUser"),
            let password = value(for: "-EdgeEverAutoLoginPassword")
        else { return }
        guard !env.session.isSignedIn else { return }
        do {
            try await env.session.signIn(baseUrl: base, username: user, password: password)
            await env.runSyncCycle()
        } catch {
            // Surface on login screen via next manual attempt; keep silent for automation logs.
            print("AutoLogin failed: \(error.localizedDescription)")
        }
    }
}

extension Notification.Name {
    static let edgeEverShareReceived = Notification.Name("edgeEverShareReceived")
    static let edgeEverResourcePress = Notification.Name("edgeEverResourcePress")
}
