import Foundation
import Observation

@Observable
@MainActor
final class AppEnvironment {
    let session: SessionStore
    let mirror: LocalMirrorRepository
    let outbox: SyncOutboxRepository
    let drafts: DraftRepository
    let syncEngine: SyncEngine
    let outboxFlusher: OutboxFlusher
    let preferences: PreferencesStore
    let shareHandoff: ShareHandoffStore

    private(set) var bootstrapProgress: BootstrapProgress?
    private(set) var isSyncing = false
    private(set) var lastSyncError: String?
    private(set) var lastOutboxResult: SyncRunResult?

    init() {
        let dbQueue = try! AppDatabase.makeShared()
        let mirror = LocalMirrorRepository(dbQueue: dbQueue)
        let outbox = SyncOutboxRepository(dbQueue: dbQueue)
        let drafts = DraftRepository(dbQueue: dbQueue)
        let session = SessionStore()
        let syncEngine = SyncEngine(mirror: mirror, client: session.client)
        let flusher = OutboxFlusher(outbox: outbox, mirror: mirror, client: session.client)
        self.session = session
        self.mirror = mirror
        self.outbox = outbox
        self.drafts = drafts
        self.syncEngine = syncEngine
        self.outboxFlusher = flusher
        self.preferences = PreferencesStore()
        self.shareHandoff = ShareHandoffStore()
    }

    /// Test-friendly initializer.
    init(
        session: SessionStore,
        mirror: LocalMirrorRepository,
        outbox: SyncOutboxRepository,
        drafts: DraftRepository,
        syncEngine: SyncEngine,
        outboxFlusher: OutboxFlusher,
        preferences: PreferencesStore = PreferencesStore(),
        shareHandoff: ShareHandoffStore = ShareHandoffStore()
    ) {
        self.session = session
        self.mirror = mirror
        self.outbox = outbox
        self.drafts = drafts
        self.syncEngine = syncEngine
        self.outboxFlusher = outboxFlusher
        self.preferences = preferences
        self.shareHandoff = shareHandoff
    }

    func bootstrap() async {
        await session.bootstrap()
        if session.isSignedIn {
            // Warm TipTap process + EditorBundle off the critical path of the first note open.
            await MainActor.run { TipTapWarmPool.warmIfNeeded() }
            await runSyncCycle()
        }
    }

    func runSyncCycle() async {
        guard let scope = session.dataScope else { return }
        isSyncing = true
        lastSyncError = nil
        defer { isSyncing = false }
        do {
            _ = try await outboxFlusher.flush(scope: scope)
            _ = try await syncEngine.sync(scope: scope) { [weak self] progress in
                Task { @MainActor in
                    self?.bootstrapProgress = progress
                }
            }
            lastOutboxResult = try await outboxFlusher.flush(scope: scope)
            bootstrapProgress = nil
        } catch {
            lastSyncError = error.localizedDescription
        }
    }
}
