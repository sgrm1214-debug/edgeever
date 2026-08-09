import SwiftUI

/// Android `WorkspaceSettingsView` parity: full-screen “我的”, not a system Form/List.
struct SettingsView: View {
    @Environment(AppEnvironment.self) private var env
    @Environment(\.dismiss) private var dismiss

    private enum RootTab: Hashable {
        case general
        case account
        case system
        // Extended (not on Android root Me, but reachable from system/account extras)
        case tags
        case tokens
        case devices
        case users
    }

    @State private var tab: RootTab?
    @State private var showLocalePicker = false

    private var title: String {
        switch tab {
        case .general: return env.preferences.t("常规设置", en: "General")
        case .account: return env.preferences.t("登录设置", en: "Account")
        case .system: return env.preferences.t("系统信息", en: "System info")
        case .tags: return env.preferences.t("标签管理", en: "Tags")
        case .tokens: return "API Token"
        case .devices: return env.preferences.t("登录设备", en: "Devices")
        case .users: return env.preferences.t("用户管理", en: "Users")
        case nil: return env.preferences.t("我的", en: "Me")
        }
    }

    private var headerIcon: String {
        switch tab {
        case .general: return "slider.horizontal.3"
        case .account: return "shield.checkered"
        case .system: return "info.circle"
        case .tags: return "tag"
        case .tokens: return "key"
        case .devices: return "iphone"
        case .users: return "person.2"
        case nil: return "person"
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            settingsHeader
            ScrollView {
                Group {
                    if let tab {
                        detailContent(tab)
                            .transition(.opacity.combined(with: .move(edge: .trailing)))
                    } else {
                        rootMenu
                            .transition(.opacity)
                    }
                }
                .padding(16)
                .padding(.bottom, 96)
                .animation(Motion.listContent, value: tab)
            }
            .background(AppTheme.background)
        }
        .background(AppTheme.background.ignoresSafeArea())
        .preferredColorScheme(env.preferences.colorScheme)
    }

    // MARK: - Header (Android settingsHeader)

    private var settingsHeader: some View {
        HStack(spacing: 0) {
            Button {
                if tab != nil {
                    withAnimation(Motion.chip) { tab = nil }
                } else {
                    dismiss()
                }
            } label: {
                Image(systemName: "chevron.left")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(AppTheme.secondary)
                    .frame(width: 36, height: 36)
            }
            .buttonStyle(.plain)

            HStack(spacing: 8) {
                Image(systemName: headerIcon)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundStyle(AppTheme.accentStrong)
                Text(title)
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundStyle(AppTheme.title)
                    .lineLimit(1)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.leading, 4)

            Button {
                withAnimation(Motion.chip) {
                    // cycle: system → light → dark → system
                    switch env.preferences.theme {
                    case "light": env.preferences.theme = "dark"
                    case "dark": env.preferences.theme = "system"
                    default: env.preferences.theme = "light"
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: env.preferences.theme == "dark" ? "sun.max" : "moon")
                        .font(.system(size: 16, weight: .semibold))
                    Text(themeToggleLabel)
                        .font(.system(size: 14, weight: .bold))
                        .lineLimit(1)
                }
                .foregroundStyle(AppTheme.slate)
                .padding(.horizontal, 8)
                .frame(height: 36)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 12)
        .frame(minHeight: 56)
        .background(Color.white)
        .overlay(alignment: .bottom) {
            Rectangle().fill(AppTheme.border).frame(height: 1)
        }
    }

    private var themeToggleLabel: String {
        // Android shows the *action* text: switch to light when dark, else switch to dark
        if env.preferences.theme == "dark" || (env.preferences.theme == "system" && env.preferences.colorScheme == .dark) {
            return env.preferences.t("切换到浅色模式", en: "Light mode")
        }
        return env.preferences.t("切换到深色模式", en: "Dark mode")
    }

    // MARK: - Root Me menu (Android activeTab === null)

    private var rootMenu: some View {
        VStack(spacing: 16) {
            // Card 1: general + account
            settingsMenuCard {
                menuRow(
                    icon: "slider.horizontal.3",
                    iconTint: AppTheme.accent,
                    iconBg: AppTheme.accentSoft,
                    title: env.preferences.t("常规设置", en: "General"),
                    showBorder: false
                ) {
                    withAnimation(Motion.chip) { tab = .general }
                }
                menuRow(
                    icon: "shield.checkered",
                    iconTint: AppTheme.accent,
                    iconBg: AppTheme.accentSoft,
                    title: env.preferences.t("登录设置", en: "Account"),
                    showBorder: true
                ) {
                    withAnimation(Motion.chip) { tab = .account }
                }
            }

            // Card 2: system + feedback
            settingsMenuCard {
                menuRow(
                    icon: "info.circle",
                    iconTint: AppTheme.accent,
                    iconBg: AppTheme.accentSoft,
                    title: env.preferences.t("系统信息", en: "System info"),
                    subtitle: env.preferences.t(
                        "查看版本与运行环境信息。",
                        en: "View version and runtime info."
                    ),
                    showBorder: false
                ) {
                    withAnimation(Motion.chip) { tab = .system }
                }
                menuRow(
                    icon: "bubble.left.and.bubble.right",
                    iconTint: AppTheme.secondary,
                    iconBg: AppTheme.searchFill,
                    title: env.preferences.t("意见反馈", en: "Feedback"),
                    subtitle: env.preferences.t(
                        "报告问题或提出功能建议",
                        en: "Report issues or suggest features"
                    ),
                    trailing: .external,
                    showBorder: true
                ) {
                    if let url = URL(string: "https://github.com/tianma-if/edgeever/issues") {
                        UIApplication.shared.open(url)
                    }
                }
            }
        }
    }

    private enum TrailingKind { case chevron, external }

    private func settingsMenuCard<Content: View>(@ViewBuilder _ content: () -> Content) -> some View {
        VStack(spacing: 0) {
            content()
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(AppTheme.border, lineWidth: 1)
        )
    }

    private func menuRow(
        icon: String,
        iconTint: Color,
        iconBg: Color,
        title: String,
        subtitle: String? = nil,
        trailing: TrailingKind = .chevron,
        showBorder: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                ZStack {
                    RoundedRectangle(cornerRadius: 8, style: .continuous)
                        .fill(iconBg)
                        .frame(width: 32, height: 32)
                    Image(systemName: icon)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundStyle(iconTint)
                }
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(Color(hex: 0x1E293B))
                    if let subtitle {
                        Text(subtitle)
                            .font(.system(size: 12))
                            .foregroundStyle(AppTheme.secondary)
                            .lineLimit(2)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                Image(systemName: trailing == .external ? "arrow.up.right" : "chevron.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(AppTheme.muted)
            }
            .padding(.horizontal, 16)
            .frame(minHeight: 64)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .overlay(alignment: .top) {
            if showBorder {
                Rectangle().fill(AppTheme.cardBorder).frame(height: 1)
                    .padding(.leading, 16)
            }
        }
    }

    // MARK: - Detail tabs

    @ViewBuilder
    private func detailContent(_ tab: RootTab) -> some View {
        switch tab {
        case .general:
            generalContent
        case .account:
            accountContent
        case .system:
            systemContent
        case .tags:
            TagsManagementView()
        case .tokens:
            ApiTokensView()
        case .devices:
            DevicesView()
        case .users:
            UsersManagementView()
        }
    }

    private var generalContent: some View {
        VStack(spacing: 16) {
            settingsGroup(
                title: env.preferences.t("偏好设置", en: "Preferences"),
                icon: "photo"
            ) {
                preferenceBlock(
                    title: env.preferences.t("界面语言", en: "Language"),
                    description: env.preferences.t("切换产品界面的显示语言。", en: "Switch the product UI language.")
                ) {
                    Menu {
                        Button(env.preferences.t("跟随系统", en: "System")) { env.preferences.localeCode = "system" }
                        Button("简体中文") { env.preferences.localeCode = "zh-CN" }
                        Button("English") { env.preferences.localeCode = "en-US" }
                    } label: {
                        HStack {
                            Text(localeLabel)
                                .font(.system(size: 14))
                                .foregroundStyle(AppTheme.title)
                            Spacer()
                            Image(systemName: "chevron.down")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundStyle(AppTheme.secondary)
                        }
                        .padding(.horizontal, 12)
                        .frame(minHeight: 40)
                        .background(Color.white)
                        .clipShape(RoundedRectangle(cornerRadius: 8))
                        .overlay(
                            RoundedRectangle(cornerRadius: 8).stroke(AppTheme.border, lineWidth: 1)
                        )
                    }
                }

                preferenceBlock(
                    title: env.preferences.t("压缩笔记内图片", en: "Compress note images"),
                    description: env.preferences.t(
                        "上传前将大图压缩为 WebP（最长边 2560），节省存储与流量。",
                        en: "Compress large images to WebP (max edge 2560) before upload to save storage and bandwidth."
                    ),
                    showTopBorder: true
                ) {
                    Toggle("", isOn: Bindable(env.preferences).useCompression)
                        .labelsHidden()
                        .tint(AppTheme.accent)
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                // List density lives in list-options sheet (Android NotesActionsModal), not here.
            }
        }
    }

    private var accountContent: some View {
        VStack(spacing: 16) {
            // Account summary card
            HStack(spacing: 12) {
                ZStack {
                    Circle().fill(AppTheme.accentSoft).frame(width: 40, height: 40)
                    Image(systemName: "person")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundStyle(AppTheme.accentStrong)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(env.preferences.t("当前账户", en: "Current account"))
                        .font(.system(size: 12, weight: .bold))
                        .foregroundStyle(AppTheme.secondary)
                    Text(env.session.session?.user?.displayName ?? env.session.session?.user?.username ?? "—")
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundStyle(AppTheme.title)
                    let role = env.session.session?.user?.role == "owner"
                        ? env.preferences.t("实例管理员", en: "Owner")
                        : env.preferences.t("成员", en: "Member")
                    Text("@\(env.session.session?.user?.username ?? "—") · \(role)")
                        .font(.system(size: 12))
                        .foregroundStyle(AppTheme.secondary)
                        .padding(.top, 1)
                }
                Spacer(minLength: 0)
            }
            .padding(16)
            .background(Color.white)
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke(AppTheme.border, lineWidth: 1)
            )

            // Change password panel (Android AccountSecurityPanel)
            AccountPasswordPanel()

            // Extended links (tokens/devices/users/tags) — compact rows, not on Android root Me
            settingsMenuCard {
                menuRow(icon: "iphone", iconTint: AppTheme.accent, iconBg: AppTheme.accentSoft,
                        title: env.preferences.t("登录设备", en: "Devices"), showBorder: false) {
                    withAnimation(Motion.chip) { tab = .devices }
                }
                menuRow(icon: "key", iconTint: AppTheme.accent, iconBg: AppTheme.accentSoft,
                        title: "API Token", showBorder: true) {
                    withAnimation(Motion.chip) { tab = .tokens }
                }
                menuRow(icon: "tag", iconTint: AppTheme.accent, iconBg: AppTheme.accentSoft,
                        title: env.preferences.t("标签管理", en: "Tags"), showBorder: true) {
                    withAnimation(Motion.chip) { tab = .tags }
                }
                if env.session.session?.user?.role == "owner" {
                    menuRow(icon: "person.2", iconTint: AppTheme.accent, iconBg: AppTheme.accentSoft,
                            title: env.preferences.t("用户管理", en: "Users"), showBorder: true) {
                        withAnimation(Motion.chip) { tab = .users }
                    }
                }
            }

            // Logout card
            VStack(alignment: .leading, spacing: 0) {
                Button {
                    Task {
                        await env.session.signOut()
                        dismiss()
                    }
                } label: {
                    HStack(spacing: 8) {
                        Image(systemName: "rectangle.portrait.and.arrow.right")
                            .font(.system(size: 15, weight: .bold))
                        Text(env.preferences.t("退出登录", en: "Sign out"))
                            .font(.system(size: 14, weight: .heavy))
                    }
                    .foregroundStyle(.white)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 40)
                    .background(Color(hex: 0xE11D48))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
                }
                .buttonStyle(.plain)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(16)
            .background(Color(hex: 0xFFF1F2))
            .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(Color(hex: 0xFECACA), lineWidth: 1)
            )
        }
    }

    private var systemContent: some View {
        VStack(spacing: 16) {
            settingsGroup(title: env.preferences.t("系统信息", en: "System info"), icon: "info.circle") {
                infoRow(env.preferences.t("版本", en: "Version"),
                        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—",
                        showBorder: false)
                infoRow("Build",
                        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—",
                        showBorder: true)
                infoRow(env.preferences.t("实例", en: "Instance"),
                        env.session.session?.baseUrl ?? "—",
                        showBorder: true)
                infoRow(env.preferences.t("运行环境", en: "Runtime"),
                        "Native SwiftUI",
                        showBorder: true)
            }

            Button {
                Task { await env.runSyncCycle() }
            } label: {
                HStack {
                    Image(systemName: "arrow.clockwise")
                    Text(env.preferences.t("立即同步", en: "Sync now"))
                        .font(.system(size: 14, weight: .bold))
                    if env.isSyncing { ProgressView() }
                }
                .frame(maxWidth: .infinity)
                .frame(minHeight: 44)
                .foregroundStyle(AppTheme.title)
                .background(Color.white)
                .clipShape(RoundedRectangle(cornerRadius: 12))
                .overlay(RoundedRectangle(cornerRadius: 12).stroke(AppTheme.border, lineWidth: 1))
            }
            .buttonStyle(.plain)

            if let err = env.lastSyncError {
                Text(err)
                    .font(.system(size: 12, weight: .semibold))
                    .foregroundStyle(AppTheme.danger)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }

    // MARK: - Building blocks

    private var localeLabel: String {
        switch env.preferences.localeCode {
        case "zh-CN": return "简体中文"
        case "en-US": return "English"
        default: return env.preferences.t("跟随系统", en: "System")
        }
    }

    private func settingsGroup<Content: View>(
        title: String,
        icon: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(AppTheme.accentStrong)
                Text(title)
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(AppTheme.title)
            }
            .padding(16)
            content()
        }
        .background(Color.white)
        .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(AppTheme.border, lineWidth: 1)
        )
    }

    private func preferenceBlock<Content: View>(
        title: String,
        description: String,
        showTopBorder: Bool = false,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            VStack(alignment: .leading, spacing: 4) {
                Text(title)
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(AppTheme.title)
                Text(description)
                    .font(.system(size: 12))
                    .foregroundStyle(AppTheme.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .overlay(alignment: .top) {
            if showTopBorder {
                Rectangle().fill(AppTheme.cardBorder).frame(height: 1)
            }
        }
    }

    private func infoRow(_ title: String, _ value: String, showBorder: Bool) -> some View {
        HStack(alignment: .top) {
            Text(title)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(AppTheme.secondary)
            Spacer()
            Text(value)
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(AppTheme.title)
                .multilineTextAlignment(.trailing)
        }
        .padding(16)
        .overlay(alignment: .top) {
            if showBorder {
                Rectangle().fill(AppTheme.cardBorder).frame(height: 1)
            }
        }
    }
}

// MARK: - Password panel (Android AccountSecurityPanel)
