# Release 发布指南

EdgeEver 使用一条本地命令准备 Release。该命令会检查仓库、创建跟踪 Issue、
更新版本、在 Draft Release 中准备并审计原生资产、正式发布 Release，并安装最终
的 macOS DMG。

该流程不执行移动端商店交付。Google Play 和 App Store Connect 交付是独立且
需要显式触发的操作，详见[移动端商店交付](store-delivery.zh-CN.md)。

## 前置条件

- 在 macOS 上执行，当前必须是干净的 `main` 分支，并且与 `origin/main` 完全一致。
- GitHub CLI 已完成认证，并且有权访问 `tianma-if/edgeever`。
- 开始发布前，所有面向用户的改动都已提交。
- 每条英文更新说明都必须有对应的中文说明。

## 命令

```bash
bun run release -- \
  --issue-title "Improve the release workflow" \
  --label enhancement \
  --change-en "Run required release checks in parallel." \
  --change-zh "并行执行发布所需检查。"
```

如果一个 Release 包含多项改动，请成对重复传入 `--change-en` 和
`--change-zh`。跟踪 Issue 需要多个 Label 时，可以重复传入 `--label`。

使用 `--dry-run` 可以只查看原生端重建计划和生成的双语说明，不修改本地或
GitHub 状态。`--skip-install` 会跳过发布后的 DMG 安装，仅适用于特殊情况或
非 macOS 环境；维护者正常发布时仍应安装并启动已发布的应用。

## 自动化流程

1. 检查 `main`、工作区、GitHub 认证、上一个正式 Release，以及本地与远端的
   提交关系。
2. 并行执行 Web 类型检查、移动端类型检查、Web 生产构建和 Release 规划测试。
3. 使用 `scripts/plan-native-release.mjs` 判断桌面端和 Android 资产需要重建
   还是可以复用，并且只更新受影响原生端的版本。
4. 创建双语跟踪 Issue，将版本变更提交并推送到 `main`，然后创建带双语说明的
   Draft Release。
5. 并行触发桌面端和 Android 资产工作流，等待两者完成，并在正式发布前检查
   文件名、大小和校验和。
6. 正式发布 Release，且只等待必要的桌面端和 Android 发布后资产审计。
7. 输出 Demo 部署任务或工作流链接。Demo 在后台继续部署，不再延迟 Release
   完成。
8. 回链并关闭跟踪 Issue，下载最终 DMG，验证校验和与签名，覆盖
   `/Applications/EdgeEver.app` 并启动。

Release 流程不会构建 Play AAB、启动 EAS iOS Build，也不会上传到移动端商店。

版本发布提交会包含 GitHub Actions 的标准跳过标记。Draft 资产工作流由脚本
显式触发，因此可以避免一次不必要的 push 触发 Android 构建，同时不会跳过
正式发布所需的构建。

## 失败与续跑

- 本地验证或 Draft 资产失败时，Release 会保持未发布状态。
- 如果流程在版本提交和 Draft 创建后中断，重新执行同一条命令即可。脚本会识别
  版本和目标提交都与当前 `main` 匹配的 Draft，不会重复创建 Issue、提交或
  Release。
- 发布后的原生资产审计失败时，脚本会尝试把 Release 恢复为 Draft，并保留
  Issue 供后续修复。
- 替换应用失败时，脚本会尽可能从 macOS 废纸篓备份恢复上一版应用。
- Demo 部署状态有意与 Release 完成状态解耦；可以通过脚本输出的 Actions 链接
  查看或重试。
