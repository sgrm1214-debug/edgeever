# AGENTS.md

本文件用于约束和指导参与本项目的 AI 代理与协作者。

## 文档与分支约束

- **技术栈与背景**：优先参考 `README.md`。
- **双语同步**：修改中文文档时必须同步更新对应的英文文档。
- **分支规范**：严禁创建新分支，所有修改与提交必须直接在 `main` 分支上完成。

## GitHub Release 约束与流程

1. **版本号与基线**：使用 `vX.Y.Z` 格式（非 Draft/Prerelease）。递增根目录 `package.json`；若含移动端修改，同步更新 `apps/mobile/app.json` 的 `expo.version` 并递增 `android.versionCode`。上一个实际 Release 为审计基线。
2. **跨平台 Release 资产**：每个正式 Release 页面必须同时包含 macOS arm64 DMG 和 Android arm64 APK。若本次未修改对应原生运行时代码、依赖、配置或构建工具，直接复用上一个正式 Release 中已验证的原始资产，保留原文件名与校验和，禁止仅为匹配新版本号而重命名。
3. **验证命令**：必须通过 `bun run typecheck`、`bun run typecheck:mobile` 和 `bun run build:web`。
4. **原生资产构建与复用**：由 `scripts/plan-native-release.mjs` 决定重建或复用；桌面资产包含 `apps/web`。修改判定规则时同步更新测试。移动端重建使用 `bun run build:android:apk:local`，签名配置保存在仓库外。
5. **Draft 内准备资产**：通过带 `release_tag` 的 `workflow_dispatch` 在 Draft 中准备并验证资产；`published` 事件只审计，禁止重新构建或上传。
6. **桌面验证职责**：桌面 Release 工作流负责测试、包结构检查、签名与公证；代理不再重复下载 Draft 或执行本地首次启动验收，除非用户明确要求。
7. **发布后安装**：正式发布后，从该 GitHub Release 下载最终 DMG，覆盖安装 `/Applications/EdgeEver.app` 并启动，保留用户数据。功能体验由用户在实际使用中验证。
8. **失败处理**：工作流或资产审计失败时保持或恢复 Draft，修复后重跑；不得公开已知损坏的 Release。
9. **Release 说明结构**：使用中英文双语格式（正文禁止包含字面量 `\n`）。功能/修复关联对应 Issue 并标记 Label，发布后回链并关闭 Issue。正文结构：

```md
## Key Changes

- User-facing summary of changes in English.

Related Issue: #<issue-number>

## Verification

- List completed tests, type checks, and build results in English.

## 🇨🇳 中文说明 / Chinese Changelog

## 主要更新

- 面向用户说明本次变化及影响。

关联 Issue：#<issue-number>

## 验证

- 列出实际完成的测试、类型检查和构建结果。
```

## 环境、部署与组件约束

- **Cloudflare 部署**：严格按 `docs/agent-deploy-cloudflare.md` 执行。
- **数据库 Migration**：数据库或种子变化时，在 `migrations/` 下新增递增编号 SQL，禁止修改已执行的旧 Migration。
- **本地启动**：默认 `bun run dev`（纯本地环境）；指定远程实例用 `EDGE_EVER_INSTANCE=<实例名> bun run dev:remote`；纯前端用 `bun run dev:web`。
- **Demo 示例同步**：修改示例笔记后，在 `main` 分支干净状态下执行 `bun run demo:sync` 重置公开 Demo。
- **组件复用**：优先复用 `shadcn/ui` 与已成熟依赖，禁止无意义造轮子；复杂或重复模块封装为独立组件。
