import { describe, expect, test } from "bun:test";
import {
  escapeHtml,
  normalizeCssLength,
  rewriteStyleDeclarations,
  normalizeInlineEmphasisStyles,
  normalizeLinkStyles,
  normalizeHrStyles,
  parseHtmlTag,
  resolveImageDimensionStyles,
  minifyHtmlPreservingCodeBlocks,
} from "./wechat-formatter";

describe("escapeHtml", () => {
  test("escapes ampersand", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b");
  });

  test("escapes angle brackets", () => {
    expect(escapeHtml("<div>")).toBe("&lt;div&gt;");
  });

  test("escapes double quotes", () => {
    expect(escapeHtml('"hello"')).toBe("&quot;hello&quot;");
  });

  test("escapes single quotes", () => {
    expect(escapeHtml("'hello'")).toBe("&#39;hello&#39;");
  });

  test("handles empty string", () => {
    expect(escapeHtml("")).toBe("");
  });

  test("escapes multiple special characters", () => {
    expect(escapeHtml('<a href="x&y">')).toBe("&lt;a href=&quot;x&amp;y&quot;&gt;");
  });
});

describe("normalizeCssLength", () => {
  test("appends px to bare integer", () => {
    expect(normalizeCssLength("100")).toBe("100px");
  });

  test("appends px to bare decimal", () => {
    expect(normalizeCssLength("10.5")).toBe("10.5px");
  });

  test("returns existing unit values as-is", () => {
    expect(normalizeCssLength("100%")).toBe("100%");
    expect(normalizeCssLength("2em")).toBe("2em");
    expect(normalizeCssLength("16px")).toBe("16px");
  });

  test("returns null for auto", () => {
    expect(normalizeCssLength("auto")).toBeNull();
  });

  test("returns null for empty or whitespace", () => {
    expect(normalizeCssLength("")).toBeNull();
    expect(normalizeCssLength("  ")).toBeNull();
    expect(normalizeCssLength(null)).toBeNull();
    expect(normalizeCssLength(undefined)).toBeNull();
  });
});

describe("rewriteStyleDeclarations", () => {
  test("adds new properties", () => {
    const result = rewriteStyleDeclarations("color: red", { "font-size": "16px" });
    expect(result).toContain("color: red");
    expect(result).toContain("font-size: 16px");
  });

  test("overrides existing properties", () => {
    const result = rewriteStyleDeclarations("color: red; font-size: 12px", { "font-size": "16px" });
    expect(result).toContain("font-size: 16px");
    expect(result).not.toContain("font-size: 12px");
  });

  test("handles empty style string", () => {
    const result = rewriteStyleDeclarations("", { "font-size": "16px" });
    expect(result).toBe("font-size: 16px");
  });

  test("handles style with no value parts", () => {
    const result = rewriteStyleDeclarations("color: red; invalid", { "font-weight": "bold" });
    expect(result).toContain("color: red");
    expect(result).toContain("font-weight: bold");
  });
});

describe("normalizeInlineEmphasisStyles", () => {
  test("injects inherit properties into strong tag with style", () => {
    const input = '<strong style="color: red">text</strong>';
    const result = normalizeInlineEmphasisStyles(input);
    expect(result).toContain("font-size: inherit");
    expect(result).toContain("line-height: inherit");
    expect(result).toContain("letter-spacing: inherit");
    expect(result).toContain("color: red");
  });

  test("handles em, b, i tags", () => {
    for (const tag of ["em", "b", "i"]) {
      const input = `<${tag} style="font-weight: bold">text</${tag}>`;
      const result = normalizeInlineEmphasisStyles(input);
      expect(result).toContain("font-size: inherit");
    }
  });

  test("leaves tags without style untouched", () => {
    const input = "<strong>text</strong>";
    expect(normalizeInlineEmphasisStyles(input)).toBe(input);
  });
});

describe("normalizeLinkStyles", () => {
  test("rewrites underline to wavy underline", () => {
    const input = '<a style="color: blue; text-decoration: underline">link</a>';
    const result = normalizeLinkStyles(input);
    expect(result).toContain("text-decoration: underline wavy");
  });

  test("handles span tags with underline", () => {
    const input = '<span style="text-decoration: underline">text</span>';
    const result = normalizeLinkStyles(input);
    expect(result).toContain("text-decoration: underline wavy");
  });

  test("leaves non-underlined links untouched", () => {
    const input = '<a style="color: blue">link</a>';
    expect(normalizeLinkStyles(input)).toBe(input);
  });
});

describe("normalizeHrStyles", () => {
  test("rewrites hr with style to standardized inline style", () => {
    const input = '<hr style="border: 1px solid red">';
    const result = normalizeHrStyles(input);
    expect(result).toContain("border: none");
    expect(result).toContain("height: 0");
  });
});

describe("parseHtmlTag", () => {
  test("parses opening tag", () => {
    const result = parseHtmlTag('<div class="test">');
    expect(result.tagName).toBe("div");
    expect(result.isClosing).toBe(false);
    expect(result.isSelfClosing).toBe(false);
  });

  test("parses closing tag", () => {
    const result = parseHtmlTag("</div>");
    expect(result.tagName).toBe("div");
    expect(result.isClosing).toBe(true);
  });

  test("parses self-closing tags", () => {
    expect(parseHtmlTag("<br/>").isSelfClosing).toBe(true);
    expect(parseHtmlTag("<img src='x'>").isSelfClosing).toBe(true);
    expect(parseHtmlTag("<hr>").isSelfClosing).toBe(true);
  });

  test("detects whitespace-preserving tags", () => {
    expect(parseHtmlTag("<pre>").preservesWhitespace).toBe(true);
    expect(parseHtmlTag("<code>").preservesWhitespace).toBe(true);
    expect(parseHtmlTag('<section data-code-block="true">').preservesWhitespace).toBe(true);
    expect(parseHtmlTag("<div>").preservesWhitespace).toBe(false);
  });

  test("returns null tagName for non-tag input", () => {
    expect(parseHtmlTag("plain text").tagName).toBeNull();
    expect(parseHtmlTag("<!-- comment -->").tagName).toBeNull();
  });

  test("normalizes tag name to lowercase", () => {
    expect(parseHtmlTag("<DIV>").tagName).toBe("div");
    expect(parseHtmlTag("<Section>").tagName).toBe("section");
  });
});

describe("resolveImageDimensionStyles (extended)", () => {
  test("explicit attrWidth takes precedence", () => {
    const styles = resolveImageDimensionStyles({
      attrWidth: "300",
      styleWidth: "500px",
      renderedWidth: 400,
      renderedHeight: 200,
    });
    expect(styles[0]).toBe("width: 300px");
    expect(styles[1]).toBe("height: auto");
  });

  test("styleWidth used when attrWidth is absent", () => {
    const styles = resolveImageDimensionStyles({
      styleWidth: "500px",
      renderedWidth: 400,
      renderedHeight: 200,
    });
    expect(styles[0]).toBe("width: 500px");
    expect(styles[1]).toBe("height: auto");
  });

  test("uses renderedWidth when no explicit width", () => {
    const styles = resolveImageDimensionStyles({
      renderedWidth: 320,
      renderedHeight: 240,
    });
    expect(styles).toContain("width: 320px");
    expect(styles).toContain("max-width: 100%");
    expect(styles).toContain("height: 240px");
  });

  test("falls back to max-width when no width info", () => {
    const styles = resolveImageDimensionStyles({});
    expect(styles).toContain("max-width: 100%");
    expect(styles).toContain("height: auto");
  });

  test("dataHeight used when no style/attr height", () => {
    const styles = resolveImageDimensionStyles({
      renderedWidth: 320,
      dataHeight: "210.5",
    });
    expect(styles).toContain("height: 210.5px");
  });

  test("zero dimensions treated as absent", () => {
    const styles = resolveImageDimensionStyles({
      renderedWidth: 0,
      renderedHeight: 0,
    });
    expect(styles).toContain("max-width: 100%");
    expect(styles).toContain("height: auto");
  });

  test("null/undefined dimensions treated as absent", () => {
    const styles = resolveImageDimensionStyles({
      renderedWidth: null,
      renderedHeight: undefined,
    });
    expect(styles).toContain("max-width: 100%");
    expect(styles).toContain("height: auto");
  });

  test("explicitHeight preferred over renderedHeight", () => {
    const styles = resolveImageDimensionStyles({
      renderedWidth: 320,
      styleHeight: "500px",
      renderedHeight: 200,
    });
    expect(styles).toContain("height: 500px");
    expect(styles).not.toContain("height: 200px");
  });
});

describe("minifyHtmlPreservingCodeBlocks (extended)", () => {
  test("handles empty input", () => {
    expect(minifyHtmlPreservingCodeBlocks("")).toBe("");
  });

  test("strips whitespace between regular tags", () => {
    const input = "<div>  <span>text</span>  </div>";
    const result = minifyHtmlPreservingCodeBlocks(input);
    expect(result).not.toContain("  ");
  });

  test("preserves whitespace inside <pre> tags", () => {
    const input = "<pre>\n  const a = 1;\n  return a;\n</pre>";
    const result = minifyHtmlPreservingCodeBlocks(input);
    expect(result).toContain("\n  const a = 1;\n");
  });

  test("handles self-closing tags", () => {
    const input = '<div>  <img src="x" />  <br/>  </div>';
    const result = minifyHtmlPreservingCodeBlocks(input);
    expect(result).toContain('<img src="x" />');
    expect(result).toContain("<br/>");
  });

  test("handles quoted attributes containing >", () => {
    const input = '<div data-x="a > b">content</div>';
    const result = minifyHtmlPreservingCodeBlocks(input);
    expect(result).toContain('data-x="a > b"');
    expect(result).toContain("content");
  });
});
