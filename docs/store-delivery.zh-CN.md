# 移动端商店交付

GitHub Release 与移动端商店交付是两个独立操作：

- `bun run release` 只创建并审计 GitHub Release，不会访问 Google Play 或
  App Store Connect。
- `bun run publish:stores` 针对一个已经存在的正式 Release tag，触发手动商店
  交付工作流。
- 触发商店交付就代表已经授权正式提交。默认情况下，Google Play 使用
  Production 轨道；iOS 在上传 App Store Connect 后继续提交 App Review。审核
  通过后自动发布。

## 安全模型

工作流检出不可变的 Release tag，而不是 `main`。开始任何商店构建前都会验证：

- tag 属于正式、非 Prerelease 的 GitHub Release；
- Release 目标提交与 Git tag 指向同一个提交；
- 与上一个正式 Release 相比，审计范围内确实包含移动端运行时代码变化；
- 根版本和移动端 App 版本都与 Release tag 一致；
- Android `versionCode` 已递增。

如果某个 Release 复用了上一版移动端二进制，工作流会主动拒绝。它不代表新的
商店二进制，不应重复上传。

## 前置配置

在 GitHub 仓库中配置以下 Secrets：

- `EXPO_TOKEN`
- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_ALIAS`
- `ANDROID_KEY_PASSWORD`
- `APP_STORE_CONNECT_API_KEY_ID`
- `APP_STORE_CONNECT_API_ISSUER_ID`
- `APP_STORE_CONNECT_API_KEY_P8_BASE64`

将 Google Play 服务账号密钥上传到 Android 应用的 EAS Submit Credentials。
在 EAS 中配置 iOS 分发凭据和 App Store Connect API Key。凭据和私钥禁止提交
到仓库。

创建以下 GitHub Environments：

- `store-delivery`：用于 Android 测试轨道和 Apple App Review 交付。
- `store-production`：用于 Google Play Production 交付。

EAS Submit 要求应用已经在对应商店中创建；Google Play API 提交还要求服务账号
拥有该应用的访问权限。配置方法参考官方
[EAS Android 提交指南](https://docs.expo.dev/submit/android/)和
[EAS Submit 配置参考](https://docs.expo.dev/submit/eas-json/)。

## 命令

同时提交 Google Play Production 和 Apple App Review：

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

使用 `--dry-run` 可以只输出将要触发的 GitHub 工作流，不实际启动。

## 各平台行为

### Google Play

自托管发布 Runner 会从指定 tag 构建签名 AAB，验证签名和 R8 Mapping，将两者
保留为 GitHub Actions Artifacts，然后通过 EAS Submit 上传 AAB。

Internal、Alpha、Beta 和 Production 配置都会在所选轨道创建 Completed
Release。默认命令直接使用 Production；只有明确要求测试交付时才使用
`--android-track internal`、`alpha` 或 `beta`。

### App Store Connect

EAS Build 从指定 tag 创建签名 iOS Archive，并递增远端 iOS Build Number。
EAS Submit 将同一个构建上传到 App Store Connect；Apple 处理完成后，它会出现在
TestFlight 中。随后 Fastlane 使用 App Store Connect API Key 精确选择相同的
App Version 和 Build Number，提交 App Review，并设置为审核通过后自动发布。
如果元数据、协议、审核信息或凭据不完整，工作流会失败，不会改为提交其他构建。
