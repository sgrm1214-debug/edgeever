# Firefox Add-ons Submission

## Listing

- Name: EdgeEver Web Clipper
- Summary: Save webpages and selected text directly to your self-hosted EdgeEver instance.
- Category: Bookmarks
- Homepage: https://edgeever.org
- Support: https://github.com/tianma-if/edgeever/issues
- Privacy policy: https://edgeever.org/en/privacy

## Description

EdgeEver Web Clipper saves the current webpage or selected text directly to the self-hosted EdgeEver instance you configure.

- Extract readable article content or preserve the current selection.
- Convert captured HTML to Markdown locally.
- Choose a default EdgeEver notebook.
- Send content directly to your instance without an EdgeEver-operated relay.
- No advertising, analytics, tracking, or telemetry.

Before using the extension, enter your EdgeEver instance URL and API token in the extension settings. The extension reads and sends page content only after you click **Clip current page**.

## Data collection and transmission

- `authenticationInfo`: the API token is sent only to the EdgeEver instance configured by the user.
- `browsingActivity`: the current page URL is included in the note created by the user.
- `websiteContent`: the selected text or extracted article body is included in the note created by the user.

The project maintainers do not receive or retain this data. Instance settings are stored in the browser's local extension storage.

## Reviewer notes

1. Open the extension settings.
2. Enter the provided review EdgeEver instance URL and API token.
3. Choose **Test connection**, select a notebook, and save.
4. Open a normal HTTP or HTTPS webpage.
5. Open the extension, choose **Clip current page**, and verify that the success message appears.
6. Verify the created note in the review EdgeEver instance.

Restricted browser pages, extension stores, built-in PDF viewers, and other privileged pages cannot be captured.

## Reproducible build

Requirements:

- Bun 1.3.14 or later
- Node.js 20 or later, required by `web-ext`

Commands:

```sh
bun install --frozen-lockfile
bun run test:extension
bun run build:extension:firefox
bun run lint:extension:firefox
```

The reviewable source is the repository source before Vite bundling. Third-party packages are installed from the npm registry through the committed Bun lockfile.

## 中文商店说明

EdgeEver 网页裁剪插件可将当前网页或选中的文字直接保存到用户配置的自托管 EdgeEver 实例。

- 提取适合阅读的文章正文，也可只保存当前选区。
- 在浏览器本地将 HTML 转换为 Markdown。
- 可选择默认 EdgeEver 笔记本。
- 数据直接发送到用户自己的实例，不经过 EdgeEver 中转服务。
- 不包含广告、分析、追踪或遥测。

使用前，请在插件设置中填写 EdgeEver 实例地址和 API Token。插件只会在用户点击“裁剪当前网页”后读取并发送网页内容。
