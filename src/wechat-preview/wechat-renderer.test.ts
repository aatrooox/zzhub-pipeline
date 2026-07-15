import { describe, expect, test } from "bun:test";
import { getWechatPreviewTheme } from "./themes";
import {
  buildWechatThemeCss,
  createWechatRendererRegistry,
  type WechatElementRenderer,
} from "./wechat-renderer";

describe("wechat element renderer registry", () => {
  test("registers every built-in semantic element family in pipeline order", () => {
    expect(createWechatRendererRegistry().map((renderer) => renderer.kind)).toEqual([
      "image",
      "code-block",
      "inline-code",
      "heading",
      "paragraph",
      "emphasis",
      "blockquote",
      "link",
      "list",
      "table",
      "divider",
      "hard-break",
      "article",
    ]);
  });

  test("allows a built-in renderer to be replaced without changing the registry", () => {
    const paragraphOverride: WechatElementRenderer = {
      kind: "paragraph",
      selector: "p[data-custom]",
    };
    const registry = createWechatRendererRegistry({ paragraph: paragraphOverride });

    expect(registry.find((renderer) => renderer.kind === "paragraph")).toBe(paragraphOverride);
    expect(registry).toHaveLength(13);
  });

  test("emits compatibility selectors and account theme tokens", () => {
    const theme = getWechatPreviewTheme("default");
    const css = buildWechatThemeCss(theme.editorVars, theme.exportTheme);

    expect(css).toContain(".milkdown .editor");
    expect(css).toContain("--wx-body-line-height: 1.84");
    expect(css).toContain("--wx-brand-ink: #a94473");
    expect(css).toContain('[data-wechat-node="footer"]');
  });
});
