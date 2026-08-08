import SwiftUI

/// Exact visual tokens from Android `workspace-styles.ts`.
enum AppTheme {
    // Surfaces
    static let background = Color(hex: 0xF8FAFC)
    static let card = Color.white
    static let cardBorder = Color(hex: 0xF1F5F9)
    static let border = Color(hex: 0xE2E8F0)
    static let searchFill = Color(hex: 0xF1F5F9)
    static let searchActiveFill = Color(hex: 0xECFDF5)

    // Text
    static let title = Color(hex: 0x0F172A)
    static let body = Color(hex: 0x0F172A)
    static let secondary = Color(hex: 0x64748B)
    static let meta = Color(hex: 0x334155)
    static let muted = Color(hex: 0x94A3B8)
    static let slate = Color(hex: 0x475569)
    static let filterActive = Color(hex: 0x334155)

    // Brand
    static let accent = Color(hex: 0x059669)
    static let accentStrong = Color(hex: 0x047857)
    static let accentBright = Color(hex: 0x10B981)
    static let accentSoft = Color(hex: 0xECFDF5)
    static let accentBorder = Color(hex: 0xA7F3D0)
    static let accentText = Color(hex: 0x065F46)
    static let danger = Color(hex: 0xDC2626)

    // First-sync progress / error (Android memoSync* + memoListLoading* / memoListError*)
    static let syncProgressTrack = Color(hex: 0xD1FAE5)
    static let syncProgressFill = Color(hex: 0x059669)
    static let syncErrorBackground = Color(hex: 0xFFFBEB)
    static let syncErrorBorder = Color(hex: 0xFCD34D)
    static let syncErrorTitle = Color(hex: 0x451A03)
    static let syncErrorBody = Color(hex: 0x92400E)
    static let syncErrorRetryFill = Color(hex: 0xFEF3C7)
    static let emptyDashBorder = Color(hex: 0xCBD5E1)

    // Tag chip
    static let tagBackground = Color(hex: 0xF1F5F9)

    static let fabShadow = Color(hex: 0x10B981).opacity(0.28)

    // Typography helpers matching RN sizes
    static let notebookTitleFont = Font.system(size: 17, weight: .bold)
    static let memoTitleFont = Font.system(size: 16, weight: .bold)
    static let memoExcerptFont = Font.system(size: 14)
    static let memoDateFont = Font.system(size: 12, weight: .medium)
    static let tagFont = Font.system(size: 12, weight: .medium)
    static let searchFont = Font.system(size: 14)
    static let bottomNavFont = Font.system(size: 11, weight: .bold)

    /// Android `fontWeight: "800"`.
    static let heavy = Font.Weight.heavy
}

extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        let r = Double((hex >> 16) & 0xFF) / 255
        let g = Double((hex >> 8) & 0xFF) / 255
        let b = Double(hex & 0xFF) / 255
        self.init(.sRGB, red: r, green: g, blue: b, opacity: opacity)
    }
}
