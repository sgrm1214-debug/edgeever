# Release 发布指南

EdgeEver 使用一条本地命令准备 Release。该命令会检查仓库、创建跟踪 Issue、
更新版本、在 Draft Release 中准备并审计原生资产、正式发布 Release，并安装与
维护者 Mac 架构匹配的最终 macOS DMG。

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
  --bump minor \
  --issue-title "Improve the release workflow" \
  --label enhancement \
  --change-en "Run required release checks in parallel." \
  --change-zh "并行执行发布所需检查。"
```

如果一个 Release 包含多项改动，请成对重复传入 `--change-en` 和
`--change-zh`。跟踪 Issue 需要多个 Label 时，可以重复传入 `--label`。
公开 Release 说明只包含用户可感知的变化、影响以及必要的升级或迁移提醒。
类型检查、构建命令、签名、公证和资产审计等技术细节保留在 GitHub Actions
与关联跟踪 Issue 中，不再重复写入公开说明。

`--bump` 为必填项，必须根据整个 Release 对用户和兼容性的影响选择：

- `patch`：修复问题，或进行不增加新使用流程的小幅安全、性能和视觉优化。
- `minor`：增加向后兼容的新功能，或发布一组完整的新能力。
- `major`：引入不兼容的数据格式、同步协议、公共 API 或部署变化；Release
  说明必须写明兼容性影响和迁移方式。

命令会计算下一个稳定版本并将低位归零：`1.6.52 + patch` 得到 `1.6.53`，
`+ minor` 得到 `1.7.0`，`+ major` 得到 `2.0.0`。提交前缀可以辅助判断，但
不会自动决定版本级别，因为代码改动类型不等同于产品影响。

使用 `--dry-run` 可以只查看原生端重建计划和生成的双语说明，不修改本地或
GitHub 状态。`--skip-install` 会跳过发布后的 DMG 安装，仅适用于特殊情况或
非 macOS 环境；维护者正常发布时仍应安装并启动已发布的应用。

## 发布节奏与平台版本

正式 Release 代表一批完整、稳定的产品变化，而不是单个提交或单次部署。相关
修复通常应合并为一个 Patch Release；崩溃、数据丢失风险或安全问题可以紧急
单独发布。两个正式 Release 之间的构建使用 Git 提交或构建标识，不消耗稳定
版本号。

根版本和 GitHub tag 表示整体产品 Release。只有原生运行时需要重建时，才更新
对应的原生展示版本。Android `versionCode` 和 iOS Build Number 继续作为独立、
严格递增的商店构建标识。

正式 Tag 及其对应的 GitHub Release 标题均统一使用 `vX.Y.Z`。

复用已验证的 DMG 或 APK 时，保留其原始文件名和原生版本。每个正式 Release
都同时包含独立的 macOS arm64 与 x64 DMG，以及按架构区分的更新 ZIP。桌面端
和 Android 更新检查从各自在 Release 中的资产读取适用版本，而不是直接比较
整体 GitHub tag，避免原生客户端因为仅涉及 Web 或 API 的 Release 反复提示
无效更新。

## 自动化流程

1. 检查 `main`、工作区、GitHub 认证、上一个正式 Release，以及本地与远端的
   提交关系。
2. 并行执行 Web 类型检查、移动端类型检查、Web 生产构建和 Release 规划测试。
3. 按显式选择的 `patch`、`minor` 或 `major` 计算版本，再使用
   `scripts/plan-native-release.mjs` 判断桌面端和 Android 资产需要重建还是
   可以复用，并且只更新受影响原生端的版本。
4. 创建双语跟踪 Issue，将版本变更提交并推送到 `main`，然后创建带双语说明的
   Draft Release。
5. 并行触发桌面端和 Android 资产工作流。桌面端工作流分别在匹配的原生 Runner
   上构建 arm64 与 x64 包，再合并自动更新元数据；正式发布前检查文件名、大小
   和校验和。
6. 正式发布 Release，且只等待必要的桌面端和 Android 发布后资产审计。
7. 输出 Demo 部署任务或工作流链接。Demo 在后台继续部署，不再延迟 Release
   完成。
8. 回链并关闭跟踪 Issue，下载与维护者 Mac 架构匹配的最终 DMG，验证校验和与
   签名，覆盖 `/Applications/EdgeEver.app` 并启动。

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
