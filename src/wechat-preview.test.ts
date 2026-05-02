import { describe, expect, test } from "bun:test";
import { extractFrontmatter, parseYAML } from "./wechat-preview/frontmatter-handler";
import { getWechatPreviewStyleName, getWechatPreviewTheme } from "./wechat-preview/themes";
import { minifyHtmlPreservingCodeBlocks, resolveImageDimensionStyles } from "./wechat-preview/wechat-formatter";

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

describe("wechat preview html minify", () => {
  test("keeps indentation inside protected code blocks", () => {
    const input = `<section>\n  <section data-code-block="true"><pre>if (ok) {\n  return 1;\n}</pre></section>\n  <section>after</section>\n</section>`;
    const output = minifyHtmlPreservingCodeBlocks(input);

    expect(output).toContain("<pre>if (ok) {\n  return 1;\n}</pre>");
    expect(output).toContain("</section><section>after</section>");
  });

  test("does not exit preservation mode on nested section closes inside code blocks", () => {
    const input = `<section data-code-block="true"><section><section>  const a = 1;</section><section>  return a;</section></section></section><section>after</section>`;
    const output = minifyHtmlPreservingCodeBlocks(input);

    expect(output).toContain("<section>  const a = 1;</section><section>  return a;</section>");
    expect(output).toContain("</section><section>after</section>");
  });
});

describe("wechat preview image dimensions", () => {
  test("preserves Crepe image-block height when width is implicit", () => {
    const styles = resolveImageDimensionStyles({
      styleHeight: "180.5px",
      renderedWidth: 320,
      renderedHeight: 120,
    });

    expect(styles).toEqual(["width: 320px", "max-width: 100%", "height: 180.5px"]);
  });

  test("uses Crepe image-block data-height when inline height is absent", () => {
    const styles = resolveImageDimensionStyles({
      dataHeight: "210.25",
      renderedWidth: 360,
      renderedHeight: 140,
    });

    expect(styles).toEqual(["width: 360px", "max-width: 100%", "height: 210.25px"]);
  });
});
