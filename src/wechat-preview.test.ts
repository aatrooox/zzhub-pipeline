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

  test("ships the article stylesheet wired to the export wrapper and node hooks", async () => {
    // Only assert the integration contract this repo depends on:
    //   - the stylesheet resolves and targets the `.milkdown .editor` wrapper,
    //   - it styles both bare <code> (live editor) and the export-only
    //     [data-wechat-node] hooks emitted by wechat-renderer.
    // Exact colors/padding values belong to the external
    // @zzclub/milkdown-article-style package and must NOT be pinned here, or a
    // package theme bump breaks this repo for no functional reason.
    const { resolveMilkdownArticleStylePath } = await import("./wechat-preview/index");
    const css = await Bun.file(resolveMilkdownArticleStylePath()).text();

    expect(css).toContain(".milkdown .editor");
    expect(css).toContain("code:not(pre code)");
    expect(css).toContain('[data-wechat-node="inline-code"]');
    expect(css).toContain('[data-wechat-node="code-block"]');
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
