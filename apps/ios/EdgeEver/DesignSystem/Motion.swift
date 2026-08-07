import SwiftUI
import Pow

/// Shared motion language for EdgeEver iOS.
///
/// Strategy:
/// - **Native SwiftUI** springs / transitions for layout, sheets, navigation
/// - **Pow** (Emerge Tools) for polished micro-interactions (press feedback, ping, shake, shine)
///
/// Mirrors Android Reanimated usage: card press scale, subtle feedback — not heavy list enter animations
/// (Android intentionally avoids Fabric layout enter effects on list cards).
enum Motion {
    /// Card press-in: Android `withTiming(0.985, { duration: 100 })`
    static let cardPressIn = Animation.easeOut(duration: 0.10)
    /// Card press-out: Android `withTiming(1, { duration: 160 })`
    static let cardPressOut = Animation.easeOut(duration: 0.16)

    /// Filter / chip selection
    static let chip = Animation.spring(response: 0.32, dampingFraction: 0.78)

    /// Bottom-nav create button
    static let createButton = Animation.spring(response: 0.28, dampingFraction: 0.72)

    /// Search bar expand / constraint banner
    static let search = Animation.spring(response: 0.36, dampingFraction: 0.86)

    /// List content changes (filter/search/sync refresh)
    static let listContent = Animation.spring(response: 0.40, dampingFraction: 0.88)

    /// Settings / sheet presentation polish
    static let sheet = Animation.spring(response: 0.42, dampingFraction: 0.90)

    // MARK: - Pow transitions (list / panel)

    /// Subtle move+fade when a card appears after filter/search — not a full enter cascade.
    static var cardAppear: AnyTransition {
        .movingParts.move(angle: .degrees(8)).combined(with: .opacity)
    }

    static var panelAppear: AnyTransition {
        .movingParts.anvil.combined(with: .opacity)
    }

    static var softFade: AnyTransition {
        .opacity.combined(with: .scale(scale: 0.98))
    }
}

// MARK: - Reusable modifiers

/// Android-style memo card press scale using explicit timing curves.
struct MemoCardPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(
                configuration.isPressed ? Motion.cardPressIn : Motion.cardPressOut,
                value: configuration.isPressed
            )
    }
}

/// Bottom-nav create (+) bounce on press.
struct CreateButtonPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .animation(Motion.createButton, value: configuration.isPressed)
    }
}

/// Circular filter chip with Pow ping when activated.
struct FilterChipButtonStyle: ButtonStyle {
    var active: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.92 : 1)
            .animation(Motion.chip, value: configuration.isPressed)
            .animation(Motion.chip, value: active)
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
    func edgeEverJump(on value: some Equatable, height: CGFloat = 6) -> some View {
        changeEffect(.jump(height: height), value: value)
    }

    /// Shake on error flag rising.
    func edgeEverErrorShake(on error: String?) -> some View {
        changeEffect(.shake, value: error ?? "", isEnabled: error != nil && !(error?.isEmpty ?? true))
    }

    /// Ping ring on the create button when tapped count increases.
    func edgeEverCreatePing(count: Int) -> some View {
        changeEffect(
            .ping(shape: Circle(), style: AppTheme.accentBright.opacity(0.45), count: 2),
            value: count
        )
    }
}
