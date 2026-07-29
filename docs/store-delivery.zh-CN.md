# 移动端商店交付

GitHub Release 与移动端商店交付是两个独立操作：

- `bun run release` 只创建并审计 GitHub Release，不会访问 Google Play 或
  App Store Connect。
- `bun run publish:stores` 针对一个已经存在的正式 Release tag，触发手动商店
  交付工作流。
- 商店正式发布仍然是独立决策。Google Play Production 上传会保持 Draft，
  iOS 上传只到 App Store Connect/TestFlight。

## 安全模型

工作流检出不可变的 Release tag，而不是 `main`。开始任何商店构建前都会验证：

- tag 属于正式、非 Prerelease 的 GitHub Release；
- Release 目标提交与 Git tag 指向同一个提交；
- 与上一个正式 Release 相比，审计范围内确实包含移动端运行时代码变化；
- 根版本和移动端 App 版本都与 Release tag 一致；
- Android `versionCode` 已递增；
- Google Play Production 请求再次输入了完全一致的 Release tag。

如果某个 Release 复用了上一版移动端二进制，工作流会主动拒绝。它不代表新的
商店二进制，不应重复上传。

## 前置配置

在 GitHub 仓库中配置以下 Secrets：

- `EXPO_TOKEN`
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`

将 Google Play 服务账号密钥上传到 Android 应用的 EAS Submit Credentials。
在 EAS 中配置 iOS 分发凭据和 App Store Connect API Key。凭据和私钥禁止提交
到仓库。

创建以下 GitHub Environments：

- `store-delivery`：用于 Internal/Alpha/Beta 和 TestFlight 交付。
- `store-production`：用于 Google Play Production 交付，并为该 Environment
  配置 Required Reviewers。

EAS Submit 要求应用已经在对应商店中创建；Google Play API 提交还要求服务账号
拥有该应用的访问权限。配置方法参考官方
[EAS Android 提交指南](https://docs.expo.dev/submit/android/)和
[EAS Submit 配置参考](https://docs.expo.dev/submit/eas-json/)。

## 命令

同时交付到 Google Play Internal 与 App Store Connect/TestFlight：

```sh
bun run publish:stores -- --release v1.7.0
```

只将 Android 交付到封闭测试轨道：

```sh
bun run publish:stores -- \
  --release v1.7.0 \
  --platform android \
  --android-track beta
```

准备 Google Play Production Draft：

```sh
bun run publish:stores -- \
  --release v1.7.0 \
  --platform android \
  --android-track production \
  --confirm-production v1.7.0
```

使用 `--dry-run` 可以只输出将要触发的 GitHub 工作流，不实际启动。

## 各平台行为

### Google Play

自托管发布 Runner 会从指定 tag 构建签名 AAB，验证签名和 R8 Mapping，将两者
保留为 GitHub Actions Artifacts，然后通过 EAS Submit 上传 AAB。

Internal、Alpha 和 Beta 配置会在对应测试轨道创建 Completed Release。
Production 使用 `releaseStatus: draft` 和 `changesNotSentForReview: true`；
完成审核和发布仍需在 Google Play Console 中手动操作。

### App Store Connect

EAS Build 从指定 tag 创建签名 iOS Archive，并递增远端 iOS Build Number。
EAS Submit 将同一个构建上传到 App Store Connect；Apple 处理完成后，它会出现在
TestFlight 中。工作流不会为 App Store 版本选择构建，也不会自动提交 App Review。
