import SwiftUI
import Pow

/// Shared motion language for EdgeEver iOS — tuned to feel like Android RN.
///
/// Android is intentionally **restrained**:
/// - Memo cards: Reanimated `scale 0.985` (100ms in / 160ms out), no list enter cascade
/// - Create / filter chips: plain presses (no spring bounce)
/// - No Fabric layout-enter effects on list cards
///
/// Earlier iOS motion overshot (0.97 scale, heavy brightness, springy list reshuffles,
/// Pow angled card-appear) and felt busier / less comfortable than Android. Prefer
/// quiet timing curves and high-damping springs over theatrical micro-effects.
enum Motion {
    // MARK: Timing (match Android Reanimated `withTiming`)

    /// Card press-in: `withTiming(0.985, { duration: 100 })`
    static let cardPressIn = Animation.easeOut(duration: 0.10)
    /// Card press-out: `withTiming(1, { duration: 160 })`
    static let cardPressOut = Animation.easeOut(duration: 0.16)

    /// Short control press (create / chips) — ease, not bouncy spring
    static let controlPress = Animation.easeOut(duration: 0.12)

    /// Filter / chip selection settle (high damping ≈ Material, not iOS bounce)
    static let chip = Animation.spring(response: 0.34, dampingFraction: 0.92)

    /// Bottom-nav create (+) — quiet scale, no rubber-band
    static let createButton = Animation.easeOut(duration: 0.14)

    /// Search bar expand / constraint banner
    static let search = Animation.spring(response: 0.38, dampingFraction: 0.92)

    /// List content changes (filter/search) — calm cross-fade, not floaty
    static let listContent = Animation.easeInOut(duration: 0.22)

    /// Settings / sheet presentation polish
    static let sheet = Animation.spring(response: 0.42, dampingFraction: 0.92)

    /// Stagger delay step between first-paint list cards (entrance cascade).
    static let listEntranceStagger: Double = 0.045

    /// Whole-list container spring when data first lands.
    static let listEntrance = Animation.spring(response: 0.52, dampingFraction: 0.72)

    // MARK: Transitions (Pow Moving Parts)

    /// Filter/search reshuffle: quiet fade.
    static var cardAppear: AnyTransition {
        .opacity
    }

    /// First-paint list cards: elastic “boing” drop from top (clear rebound, not a fade).
    static var listCardEntrance: AnyTransition {
        .asymmetric(
            insertion: .movingParts.boing(edge: .top).combined(with: .opacity),
            removal: .opacity
        )
    }

    static var panelAppear: AnyTransition {
        .opacity.combined(with: .move(edge: .bottom))
    }

    static var softFade: AnyTransition {
        .opacity
    }
}

// MARK: - List entrance + return settle

/// Whole list: soft drop-in when notes first appear this session.
struct NotesListEntranceModifier: ViewModifier {
    var entrancePulse: Int
    var settled: Bool

    func body(content: Content) -> some View {
        content
            .opacity(settled ? 1 : 0.001)
            .offset(y: settled ? 0 : 20)
            .animation(Motion.listEntrance, value: settled)
    }
}

/// Return-from-create/edit settle on one card.
///
/// Designed to run **in the same beat as fullScreenCover dismiss** (~0.35s):
/// 1. Instantly snap to a slightly compressed pose (no animation) — often under the cover
/// 2. Immediately spring to rest — by the time the cover has cleared, motion is already continuous
///
/// Avoids: wait for dismiss → pause ~0.5s → sudden Pow jump (felt discontinuous).
struct MemoReturnBounceModifier: ViewModifier {
    var pulse: Int

    @State private var scale: CGFloat = 1
    @State private var offsetY: CGFloat = 0
    @State private var lastPlayed = 0

    /// Matches UIKit sheet dismiss (~0.35–0.4s) so settle and cover share one motion phrase.
    private static let settle = Animation.spring(response: 0.42, dampingFraction: 0.78)

    func body(content: Content) -> some View {
        content
            .offset(y: offsetY)
            .scaleEffect(scale, anchor: .center)
            .onChange(of: pulse) { _, newValue in
                playIfNeeded(newValue)
            }
            .onAppear {
                playIfNeeded(pulse)
            }
    }

    private func playIfNeeded(_ value: Int) {
        guard value > 0, value != lastPlayed else { return }
        lastPlayed = value
        // Pose A: already mid-settle (no delay, no Transaction lag).
        var snap = Transaction()
        snap.disablesAnimations = true
        withTransaction(snap) {
            scale = 0.96
            offsetY = 14
        }
        // Pose B: spring home immediately — continuous with the covering dismiss.
        withAnimation(Self.settle) {
            scale = 1
            offsetY = 0
        }
    }
}

extension View {
    func edgeEverNotesListEntrance(settled: Bool, entrancePulse: Int) -> some View {
        modifier(NotesListEntranceModifier(entrancePulse: entrancePulse, settled: settled))
    }

    func edgeEverMemoReturnBounce(pulse: Int) -> some View {
        modifier(MemoReturnBounceModifier(pulse: pulse))
    }
}

// MARK: - Reusable modifiers

/// Android memo-card "弹跳压缩": scale down on finger-down, spring back on release.
///
/// Android RN: Reanimated `withTiming(0.985 @ 100ms)` / `withTiming(1 @ 160ms)`.
/// 0.985 is nearly invisible on iOS compositing, so we use a slightly stronger
/// compress (still quiet) and a soft spring on release so the bounce-back reads.
enum MemoCardPress {
    /// Compress target — stronger than raw Android 0.985 so it is actually visible.
    static let pressedScale: CGFloat = 0.97
    /// Finger-down: match Android 100ms ease-out compress.
    static let pressIn = Animation.easeOut(duration: 0.10)
    /// Finger-up: soft bounce settle (reads as 弹跳, not rubber-band).
    static let pressOut = Animation.spring(response: 0.30, dampingFraction: 0.62)
}

/// Primary path for list cards — compress on press, soft spring bounce on release.
struct MemoCardPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? MemoCardPress.pressedScale : 1, anchor: .center)
            .animation(
                configuration.isPressed ? MemoCardPress.pressIn : MemoCardPress.pressOut,
                value: configuration.isPressed
            )
            // Keep press animation independent of list LazyVStack springs.
            .geometryGroup()
            .onChange(of: configuration.isPressed) { _, pressed in
                if pressed {
                    UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.4)
                }
            }
    }
}

/// Bottom-nav create (+) compress + soft bounce back.
struct CreateButtonPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.90 : 1, anchor: .center)
            .animation(
                configuration.isPressed
                    ? Animation.easeOut(duration: 0.10)
                    : Animation.spring(response: 0.32, dampingFraction: 0.55),
                value: configuration.isPressed
            )
            .geometryGroup()
    }
}

/// Circular filter chip press compress.
struct FilterChipButtonStyle: ButtonStyle {
    var active: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1, anchor: .center)
            .animation(
                configuration.isPressed
                    ? Animation.easeOut(duration: 0.10)
                    : Animation.spring(response: 0.30, dampingFraction: 0.65),
                value: configuration.isPressed
            )
            .animation(Motion.chip, value: active)
            .geometryGroup()
    }
}

/// Gesture-driven compress for memo cards.
///
/// Why not only `ButtonStyle.isPressed`?
/// `contextMenu` + long-press selection steal the button highlight, so isPressed
/// often never becomes true. We track finger-down ourselves (Android onPressIn/Out).
///
/// Why `@State` not `@GestureState`?
/// `@GestureState` snaps back without driving a spring animation — release looked dead.
struct MemoCardPressHighlight: ViewModifier {
    @State private var isPressed = false

    private static let scrollCancelDistance: CGFloat = 12

    func body(content: Content) -> some View {
        content
            .scaleEffect(isPressed ? MemoCardPress.pressedScale : 1, anchor: .center)
            .animation(
                isPressed ? MemoCardPress.pressIn : MemoCardPress.pressOut,
                value: isPressed
            )
            .geometryGroup()
            .contentShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .simultaneousGesture(
                DragGesture(minimumDistance: 0, coordinateSpace: .local)
                    .onChanged { value in
                        let moved = hypot(value.translation.width, value.translation.height)
                        let next = moved < Self.scrollCancelDistance
                        guard isPressed != next else { return }
                        isPressed = next
                        if next {
                            UIImpactFeedbackGenerator(style: .soft).impactOccurred(intensity: 0.45)
                        }
                    }
                    .onEnded { _ in
                        guard isPressed else { return }
                        isPressed = false
                    }
            )
    }
}

extension View {
    /// Android-style memo-card compress + bounce-back (works with contextMenu).
    func edgeEverMemoCardPress() -> some View {
        modifier(MemoCardPressHighlight())
    }
}

extension View {
    /// Haptic selection tick when `value` changes (Pow).
    func edgeEverSelectionFeedback<V: Equatable>(_ value: V) -> some View {
        changeEffect(.feedbackHapticSelection, value: value)
    }

    /// Soft shine when a boolean toggles true (e.g. pin).
    func edgeEverSuccessShine(trigger: Bool) -> some View {
        changeEffect(.shine, value: trigger, isEnabled: trigger)
    }

    /// Jump micro-bounce when value changes (e.g. create success / sync done).
    func edgeEverJump(on value: some Equatable, height: CGFloat = 4) -> some View {
        changeEffect(.jump(height: height), value: value)
    }

    /// Shake on error flag rising.
    func edgeEverErrorShake(on error: String?) -> some View {
        changeEffect(.shake, value: error ?? "", isEnabled: error != nil && !(error?.isEmpty ?? true))
    }

    /// Soft ping on the create button (single, quieter than before).
    func edgeEverCreatePing(count: Int) -> some View {
        changeEffect(
            .ping(shape: Circle(), style: AppTheme.accentBright.opacity(0.28), count: 1),
            value: count
        )
    }
}
