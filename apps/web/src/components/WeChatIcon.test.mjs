import { describe, expect, test } from "bun:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { WeChatIcon } from "./WeChatIcon.tsx";

describe("WeChatIcon", () => {
  test("embeds its artwork without a separately deployed public asset", () => {
    const markup = renderToStaticMarkup(createElement(WeChatIcon, { className: "test-icon" }));

    expect(markup).toContain('src="data:image/png;base64,');
    expect(markup).not.toContain("/icons/");
    expect(markup).toContain('aria-hidden="true"');
  });
});
