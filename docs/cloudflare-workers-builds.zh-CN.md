# Cloudflare Workers Builds

## 配置

使用[在线部署文档](deploy-cloudflare-button.zh-CN.md)中的构建命令和部署命令，仓库根目录为 `/`，生产分支为 `main`。

授权：

1. 为部署仓库授权 **Cloudflare Workers & Pages** GitHub App。
2. 如果 Agent 集成需要 Cloudflare API Token，使用限制到目标账号的 User API Token。
3. 部署 API Token 在 Cloudflare **Worker -> Settings -> Builds -> API token** 中配置。

## 更新与排错

- `main` 推送会自动构建、执行 D1 migration、部署并验证。
- **Update deployed EdgeEver** 把部署用 Fork 当作上游的 **部署镜像** 来维护：
  - 默认 `stable` 通道跟随最新正式 Release tag。
  - 设置 GitHub Repository Variable `EDGE_EVER_UPDATE_CHANNEL=edge` 后跟随上游 `main`。
  - 只读 Fork（未改应用代码）在落后时会 **reset** 到目标版本；有本地业务改动的 Fork 走 **merge**，冲突则失败并保持线上不变。
  - 每次运行都会写 Job **Summary**：通道、目标版本、判定原因、是否 push。若 Summary 写明 *Already on upstream target* / 已对齐，绿色成功表示「已是目标版本」，不是静默故障。
  - 请优先用本工作流，而不是 GitHub **Sync fork**。Sync fork 跟的是上游 `main` 历史，可能让下一次 stable 运行合理变为 no-op。
- 可选：仓库 Secret `EDGE_EVER_CLOUDFLARE_DEPLOY_HOOK_URL`，在成功 push 后触发 Cloudflare Deploy Hook（Git 集成偶发未构建时有用）。
- 可选：Git 已是最新但 Cloudflare 需要再构建时，手动运行工作流并勾选 **force_redeploy**（会推送空 commit）。
- 构建失败：查看 Worker **Deployments** 日志，确认部署 commit SHA 与 Fork `main` 一致。
- 定时任务从不运行：公共 Fork 需在 **Actions** 中启用 **Update deployed EdgeEver**（Fork 上 schedule 默认禁用，长期不活跃也可能被暂停）。
