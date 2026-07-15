import { describe, expect, test } from "bun:test";
import { extractFrontmatter, parseYAML } from "./wechat-preview/frontmatter-handler";
import { getWechatPreviewStyleName, getWechatPreviewTheme } from "./wechat-preview/themes";

describe("wechat preview theme mapping", () => {
  test("resolves account-specific theme metadata", () => {
    const ancientone = getWechatPreviewTheme("ancientone");
    expect(ancientone.name).toBe("rose-ledger");
    expect(ancientone.exportTheme.footerText).toBe("公众号 · 古一软件");
    expect(getWechatPreviewStyleName("default")).toBe("sage-journal");
  });

  test("falls back to default theme for unknown account", () => {
    const theme = getWechatPreviewTheme("missing-account");
    expect(theme.account).toBe("default");
    expect(theme.exportTheme.footerText).toBe("公众号 · 早早集市");
  });

  test("uses the quiet editorial typography tokens", () => {
    const theme = getWechatPreviewTheme("default");
    expect(theme.exportTheme.bodyLineHeight).toBe("1.84");
    expect(theme.exportTheme.bodyLetterSpacing).toBe("0.012em");
    expect(theme.exportTheme.primaryColor).toBe("#a94473");
    expect(theme.exportTheme.fontFamily).not.toContain("SweiCurveLeg");
  });

  test("uses quiet editorial accents in the built-in stylesheet", async () => {
    const css = await Bun.file(
      new URL("./wechat-preview/browser/editor-export.css", import.meta.url),
    ).text();

    expect(css).toMatch(/\.milkdown \.editor h2 \{[^}]*padding-left: 0;[^}]*border-left: 0;[^}]*color: #292526;/s);
    expect(css).toMatch(/\.milkdown \.editor blockquote \{[^}]*border-left: 3px solid #c9c3c5;[^}]*background-color: #fbfafb;/s);
    expect(css).toMatch(/\[data-wechat-node="inline-code"\] \{[^}]*border: 1px solid #ded9db;[^}]*background-color: #f7f5f6;[^}]*color: #4d484a;/s);
  });
});

describe("wechat preview frontmatter helpers", () => {
  test("extracts frontmatter and body", () => {
    const parsed = extractFrontmatter("---\nslug: hello-world\ntags: [\"a\", \"b\"]\n---\n# Title\nbody");
    expect(parsed.frontmatter).toContain("slug: hello-world");
    expect(parsed.content).toBe("# Title\nbody");
  });

  test("parses basic yaml values", () => {
    const parsed = parseYAML("slug: hello-world\ntags: [\"a\", \"b\"]");
    expect(parsed.slug).toBe("hello-world");
    expect(parsed.tags).toEqual(["a", "b"]);
  });
});
