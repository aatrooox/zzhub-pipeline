import { describe, test, expect, it } from "bun:test";
import {
  stripFrontmatter,
  extractFrontmatter,
  fixCjkSpacing,
  downgradeH1,
  removeHeadingNumbers,
  removeHorizontalRules,
  compressBlankLines,
  removeIllustrationMarkers,
  findIllustrationMarkers,
  injectIllustrationImages,
  stripMarkdown,
  generateSlug,
  extractDescription,
  generateCoverTitle,
  extractHighlightWords,
  formatArticle,
  prepareBodyForImgx,
  prepareBodyForNewspic,
  buildFrontmatter,
} from "./text";

// ── stripFrontmatter ──────────────────────────────────────────────

describe("stripFrontmatter", () => {
  test("strips valid frontmatter", () => {
    const input = "---\ntitle: Hello\n---\nBody text here";
    expect(stripFrontmatter(input)).toBe("Body text here");
  });

  test("returns content as-is when no frontmatter", () => {
    const input = "Just body text\nNo frontmatter";
    expect(stripFrontmatter(input)).toBe(input);
  });

  test("handles frontmatter with CRLF", () => {
    const input = "---\r\ntitle: Hello\r\n---\r\nBody text";
    expect(stripFrontmatter(input)).toBe("Body text");
  });

  test("handles frontmatter at end of file", () => {
    const input = "---\ntitle: Hello\n---";
    expect(stripFrontmatter(input)).toBe("");
  });

  test("handles no closing delimiter", () => {
    const input = "---\ntitle: Hello\nno closing";
    expect(stripFrontmatter(input)).toBe(input);
  });

  test("handles empty body after frontmatter", () => {
    const input = "---\ntitle: Hello\n---\n";
    expect(stripFrontmatter(input)).toBe("");
  });

  test("preserves content that starts with --- inside text", () => {
    const input = "Some text\n---\nMore text";
    expect(stripFrontmatter(input)).toBe(input);
  });
});

// ── extractFrontmatter ────────────────────────────────────────────

describe("extractFrontmatter", () => {
  test("extracts frontmatter content", () => {
    const input = "---\ntitle: Hello\ndate: 2025-01-01\n---\nBody";
    expect(extractFrontmatter(input)).toBe("title: Hello\ndate: 2025-01-01");
  });

  test("returns null when no frontmatter", () => {
    expect(extractFrontmatter("No frontmatter here")).toBeNull();
  });

  test("returns null when no closing delimiter", () => {
    const input = "---\ntitle: Hello\nno closing";
    expect(extractFrontmatter(input)).toBeNull();
  });

  test("extracts frontmatter at end of file", () => {
    const input = "---\ntitle: Hello\n---";
    expect(extractFrontmatter(input)).toBe("title: Hello");
  });
});

// ── fixCjkSpacing ─────────────────────────────────────────────────

describe("fixCjkSpacing", () => {
  test("adds space between CJK and ASCII", () => {
    expect(fixCjkSpacing("使用OpenClaw管理")).toBe("使用 OpenClaw 管理");
  });

  test("adds space between ASCII digit and CJK", () => {
    expect(fixCjkSpacing("版本3发布")).toBe("版本 3 发布");
  });

  test("does not double-space if already spaced", () => {
    expect(fixCjkSpacing("使用 OpenClaw 管理")).toBe("使用 OpenClaw 管理");
  });

  test("handles pure ASCII text", () => {
    expect(fixCjkSpacing("Hello World")).toBe("Hello World");
  });

  test("handles pure CJK text", () => {
    expect(fixCjkSpacing("你好世界")).toBe("你好世界");
  });

  test("handles mixed CJK and numbers", () => {
    expect(fixCjkSpacing("第1章")).toBe("第 1 章");
  });

  test("handles empty string", () => {
    expect(fixCjkSpacing("")).toBe("");
  });

  test("handles Japanese kana", () => {
    expect(fixCjkSpacing("テストtest")).toBe("テスト test");
  });
});

// ── downgradeH1 ───────────────────────────────────────────────────

describe("downgradeH1", () => {
  test("converts H1 to H2", () => {
    expect(downgradeH1("# Title")).toBe("## Title");
  });

  test("does not affect H2+", () => {
    expect(downgradeH1("## Subtitle")).toBe("## Subtitle");
    expect(downgradeH1("### H3")).toBe("### H3");
  });

  test("handles multiple H1s", () => {
    const input = "# First\nSome text\n# Second";
    expect(downgradeH1(input)).toBe("## First\nSome text\n## Second");
  });

  test("does not affect inline #", () => {
    const input = "Use #hashtag in text";
    expect(downgradeH1(input)).toBe("Use #hashtag in text");
  });
});

// ── removeHeadingNumbers ──────────────────────────────────────────

describe("removeHeadingNumbers", () => {
  test("removes numeric prefix with dot", () => {
    expect(removeHeadingNumbers("## 1. 标题")).toBe("## 标题");
  });

  test("removes numeric prefix with Chinese comma", () => {
    expect(removeHeadingNumbers("## 1、标题")).toBe("## 标题");
  });

  test("removes numeric prefix with full-width dot", () => {
    expect(removeHeadingNumbers("## 1．标题")).toBe("## 标题");
  });

  test("handles multi-digit numbers", () => {
    expect(removeHeadingNumbers("## 12. 标题")).toBe("## 标题");
  });

  test("does not affect H1 or H3", () => {
    expect(removeHeadingNumbers("# 1. Title")).toBe("# 1. Title");
    expect(removeHeadingNumbers("### 1. Title")).toBe("### 1. Title");
  });

  test("does not affect headings without numbers", () => {
    expect(removeHeadingNumbers("## 标题")).toBe("## 标题");
  });
});

// ── removeHorizontalRules ─────────────────────────────────────────

describe("removeHorizontalRules", () => {
  test("removes ---", () => {
    expect(removeHorizontalRules("above\n---\nbelow")).toBe(
      "above\n\nbelow",
    );
  });

  test("removes ***", () => {
    expect(removeHorizontalRules("above\n***\nbelow")).toBe(
      "above\n\nbelow",
    );
  });

  test("removes ___", () => {
    expect(removeHorizontalRules("above\n___\nbelow")).toBe(
      "above\n\nbelow",
    );
  });

  test("removes long variants", () => {
    expect(removeHorizontalRules("above\n-----\nbelow")).toBe(
      "above\n\nbelow",
    );
  });

  test("does not remove inline dashes", () => {
    expect(removeHorizontalRules("word--word")).toBe("word--word");
  });
});

// ── compressBlankLines ────────────────────────────────────────────

describe("compressBlankLines", () => {
  test("compresses 4+ blank lines to 2", () => {
    const input = "A\n\n\n\n\nB";
    const result = compressBlankLines(input);
    expect(result).toBe("A\n\n\nB");
  });

  test("leaves 2 blank lines as-is", () => {
    const input = "A\n\n\nB";
    expect(compressBlankLines(input)).toBe("A\n\n\nB");
  });

  test("leaves single blank line as-is", () => {
    const input = "A\n\nB";
    expect(compressBlankLines(input)).toBe("A\n\nB");
  });

  test("respects custom max parameter", () => {
    const input = "A\n\n\n\nB";
    expect(compressBlankLines(input, 1)).toBe("A\n\nB");
  });
});

// ── removeIllustrationMarkers / findIllustrationMarkers ───────────

describe("removeIllustrationMarkers", () => {
  test("removes 插图 markers", () => {
    expect(removeIllustrationMarkers("上面是插图1的内容")).toBe(
      "上面是的内容",
    );
  });

  test("removes 配图 markers", () => {
    expect(removeIllustrationMarkers("这是配图2")).toBe("这是");
  });

  test("removes multiple markers", () => {
    expect(removeIllustrationMarkers("插图1和插图2")).toBe("和");
  });

  test("no-op on text without markers", () => {
    const input = "Regular text";
    expect(removeIllustrationMarkers(input)).toBe(input);
  });

  test("does NOT strip 插图 inside image paths", () => {
    const input = "![](/tmp/article_images/插图1.png)";
    expect(removeIllustrationMarkers(input)).toBe(input);
  });

  test("does NOT strip 插图 inside markdown image alt/path", () => {
    const input = "![alt](/path/to/插图2.jpg)";
    expect(removeIllustrationMarkers(input)).toBe(input);
  });

  test("still removes standalone marker after image", () => {
    const input = "![](/img/img1.png)\n\n插图3\n\n后续文字";
    expect(removeIllustrationMarkers(input)).toBe("![](/img/img1.png)\n\n\n\n后续文字");
  });
});

describe("findIllustrationMarkers", () => {
  test("finds markers", () => {
    expect(findIllustrationMarkers("插图1和配图2")).toEqual(["插图1", "配图2"]);
  });

  test("returns empty array when none found", () => {
    expect(findIllustrationMarkers("no markers")).toEqual([]);
  });
});

describe("injectIllustrationImages", () => {
  test("replaces markers with markdown image blocks", () => {
    const result = injectIllustrationImages("开头\n\n插图1\n\n结尾", [
      { marker: "插图1", path: "/tmp/body-image.png" },
    ]);
    expect(result).toContain("![](</tmp/body-image.png>)");
    expect(result).not.toContain("插图1");
  });

  test("leaves unrelated content untouched", () => {
    const input = "没有标记的正文";
    expect(injectIllustrationImages(input, [
      { marker: "插图1", path: "/tmp/body-image.png" },
    ])).toBe(input);
  });
});

// ── stripMarkdown ─────────────────────────────────────────────────

describe("stripMarkdown", () => {
  test("strips headings", () => {
    expect(stripMarkdown("## Title\nBody")).toBe("Title\nBody");
  });

  test("strips bold and italic", () => {
    expect(stripMarkdown("**bold** and *italic*")).toBe("bold and italic");
  });

  test("strips links (keeps text)", () => {
    expect(stripMarkdown("[link](https://example.com)")).toBe("link");
  });

  test("strips images", () => {
    expect(stripMarkdown("![alt](image.png)")).toBe("");
  });

  test("strips inline code", () => {
    expect(stripMarkdown("Use `code` here")).toBe("Use  here");
  });

  test("strips code fences", () => {
    expect(stripMarkdown("Before\n```js\ncode\n```\nAfter")).toBe(
      "Before\n\nAfter",
    );
  });

  test("strips blockquotes", () => {
    expect(stripMarkdown("> Quote")).toBe("Quote");
  });
});

// ── generateSlug ──────────────────────────────────────────────────

describe("generateSlug", () => {
  test("generates slug from English title", () => {
    expect(generateSlug("Hello World")).toBe("hello-world");
  });

  test("handles mixed CJK and English", () => {
    const slug = generateSlug("Hello World 管理工具介绍");
    expect(slug).toBe("hello-world");
  });

  test("removes punctuation", () => {
    expect(generateSlug("Hello, World!")).toBe("hello-world");
  });

  test("falls back to date for pure CJK", () => {
    const slug = generateSlug("你好世界");
    expect(slug).toMatch(/^post-\d{8}$/);
  });

  test("handles empty string", () => {
    const slug = generateSlug("");
    expect(slug).toMatch(/^post-\d{8}$/);
  });

  test("no leading/trailing dashes", () => {
    expect(generateSlug("  Hello  ")).toBe("hello");
  });
});

// ── extractDescription ────────────────────────────────────────────

describe("extractDescription", () => {
  test("extracts first non-heading line", () => {
    const input = "## Title\nThis is the description.\nMore text.";
    expect(extractDescription(input)).toBe("This is the description.");
  });

  test("skips empty lines", () => {
    const input = "\n\n## Title\n\nFirst paragraph.";
    expect(extractDescription(input)).toBe("First paragraph.");
  });

  test("strips inline markdown", () => {
    const input = "**Bold** description with `code`";
    expect(extractDescription(input)).toBe("Bold description with code");
  });

  test("returns empty for heading-only content", () => {
    const input = "## Title\n## Another Title";
    expect(extractDescription(input)).toBe("");
  });

  test("strips links", () => {
    const input = "Check [this](https://example.com) out";
    expect(extractDescription(input)).toBe("Check this out");
  });
});

// ── generateCoverTitle ────────────────────────────────────────────

describe("generateCoverTitle", () => {
  test("returns short title as-is", () => {
    expect(generateCoverTitle("短标题")).toBe("短标题");
  });

  test("takes part before colon", () => {
    expect(generateCoverTitle("主标题：副标题")).toBe("主标题");
  });

  test("takes part before ASCII colon", () => {
    expect(generateCoverTitle("Main: Subtitle")).toBe("Main");
  });

  test("removes common suffixes", () => {
    expect(generateCoverTitle("功能发布")).toBe("功能");
    expect(generateCoverTitle("版本更新")).toBe("版本");
  });

  test("returns full title if result > 15 chars", () => {
    const longTitle =
      "这是一个非常非常非常非常非常非常长的标题";
    expect(generateCoverTitle(longTitle)).toBe(longTitle);
  });
});

// ── extractHighlightWords ─────────────────────────────────────────

describe("extractHighlightWords", () => {
  it("extracts English acronyms like AI, API, GPU", () => {
    expect(extractHighlightWords("AI Agent 时代的 API 设计")).toContain("AI");
    expect(extractHighlightWords("AI Agent 时代的 API 设计")).toContain("API");
  });

  it("extracts camelCase and capitalized English terms", () => {
    expect(extractHighlightWords("OpenClaw 集群管理实战")).toContain("OpenClaw");
    expect(extractHighlightWords("ChatGPT 与 Agent 开发")).toContain("Agent");
  });

  it("does NOT extract CJK fragments", () => {
    const result = extractHighlightWords("深度学习框架对比指南");
    for (const word of result) {
      expect(/^[A-Za-z]/.test(word)).toBe(true);
    }
  });

  it("filters common English stopwords", () => {
    const result = extractHighlightWords("the and for with this that have");
    expect(result.length).toBe(0);
  });

  it("returns empty array for pure CJK title with no English terms", () => {
    expect(extractHighlightWords("深度学习框架对比指南")).toEqual([]);
  });

  it("returns empty array for empty title", () => {
    expect(extractHighlightWords("")).toEqual([]);
  });

  it("returns at most 3 words, sorted shortest first", () => {
    const result = extractHighlightWords("AI Agent Framework OpenClaw API Gateway");
    expect(result.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < result.length; i++) {
      expect(result[i - 1].length).toBeLessThanOrEqual(result[i].length);
    }
  });

  it("excludes short prepositions and single letters (min length rules)", () => {
    const result = extractHighlightWords("How to use AI in your work at A B C");
    expect(result).not.toContain("to");
    expect(result).not.toContain("in");
    expect(result).not.toContain("A");
    expect(result).not.toContain("B");
    expect(result).toContain("AI");
  });
});

// ── formatArticle ─────────────────────────────────────────────────

describe("formatArticle", () => {
  test("applies all formatting rules in sequence", () => {
    const input = "# 1. 使用OpenClaw的方法\n---\nBody text\n\n\n\n\nMore text";
    const result = formatArticle(input);
    // H1 -> H2
    expect(result).toContain("##");
    expect(result).not.toMatch(/^# /m);
    // CJK spacing
    expect(result).toContain("使用 OpenClaw 的方法");
    // No heading numbers
    expect(result).not.toMatch(/## \d+\./);
    // No horizontal rules
    expect(result).not.toMatch(/^---$/m);
    // Compressed blank lines
    expect(result).not.toContain("\n\n\n\n");
  });

  test("is idempotent", () => {
    const input = "## 标题\n\n正文内容\n\n更多内容";
    expect(formatArticle(formatArticle(input))).toBe(formatArticle(input));
  });
});

// ── prepareBodyForImgx ────────────────────────────────────────────

describe("prepareBodyForImgx", () => {
  test("strips frontmatter and illustration markers", () => {
    const input = "---\ntitle: Hello\n---\n正文插图1更多内容";
    const result = prepareBodyForImgx(input);
    expect(result).not.toContain("---");
    expect(result).not.toContain("插图1");
    expect(result).toContain("正文更多内容");
  });

  test("compresses blank lines", () => {
    const input = "A\n\n\n\n\nB";
    const result = prepareBodyForImgx(input);
    expect(result).toBe("A\n\n\nB");
  });
});

// ── prepareBodyForNewspic ─────────────────────────────────────────

describe("prepareBodyForNewspic", () => {
  test("strips frontmatter", () => {
    const input = "---\ntitle: Hello\n---\nBody text";
    const result = prepareBodyForNewspic(input);
    expect(result).not.toContain("---");
    expect(result).toContain("Body text");
  });

  test("strips bold/italic/images/headings/blockquotes/code, keeps links intact", () => {
    const input =
      "**Bold** *italic* [link](url) ![img](img.png)\n## Heading\n> Quote\n`code`\n```\nblock\n```";
    const result = prepareBodyForNewspic(input);
    expect(result).not.toContain("**");
    expect(result).not.toContain("*");
    expect(result).not.toContain("![");
    expect(result).not.toContain("##");
    expect(result).not.toContain(">");
    expect(result).not.toContain("`");
    expect(result).not.toContain("```");
    expect(result).toContain("Bold");
    expect(result).toContain("italic");
    expect(result).toContain("[link](url)");
    expect(result).toContain("Heading");
    expect(result).toContain("Quote");
    expect(result).toContain("code");
  });

  test("ends with single newline", () => {
    const input = "Body text";
    expect(prepareBodyForNewspic(input).endsWith("\n")).toBe(true);
    expect(prepareBodyForNewspic(input).endsWith("\n\n")).toBe(false);
  });

  test("removes newspic page markers from final publish content", () => {
    const input = [
      "【第N页】",
      "占位分页内容",
      "",
      "【第1页】",
      "第一页内容",
      "",
      "【第2页】",
      "第二页内容",
      "",
      "【Page 3】",
      "Third page",
    ].join("\n");

    expect(prepareBodyForNewspic(input)).toBe(
      [
        "占位分页内容",
        "",
        "第一页内容",
        "",
        "第二页内容",
        "",
        "Third page",
        "",
      ].join("\n"),
    );
  });

  test("converts markdown tables into compare blocks", () => {
    const input = [
      "| 维度 | OpenClaw | Hermes |",
      "| --- | --- | --- |",
      "| 记忆 | 弱依赖 | 强依赖 |",
      "| 可控性 | 高 | 中 |",
      "| 成本 | 低 | 高 |",
    ].join("\n");

    expect(prepareBodyForNewspic(input)).toBe(
      [
        "OpenClaw",
        "- 记忆：弱依赖",
        "- 可控性：高",
        "- 成本：低",
        "",
        "Hermes",
        "- 记忆：强依赖",
        "- 可控性：中",
        "- 成本：高",
        "",
      ].join("\n"),
    );
  });

  test("skips empty placeholder cells when converting markdown tables", () => {
    const input = [
      "| 项目 | 方案 A | 方案 B |",
      "| --- | --- | --- |",
      "| 价格 | 免费 | - |",
      "| 部署 | 本地 | / |",
      "| 速度 | 快 | 中 |",
    ].join("\n");

    expect(prepareBodyForNewspic(input)).toBe(
      [
        "方案 A",
        "- 价格：免费",
        "- 部署：本地",
        "- 速度：快",
        "",
        "方案 B",
        "- 速度：中",
        "",
      ].join("\n"),
    );
  });
});

// ── buildFrontmatter ──────────────────────────────────────────────

describe("buildFrontmatter", () => {
  test("builds basic frontmatter", () => {
    const result = buildFrontmatter({
      title: "Hello World",
      date: "2025-04-07",
      platform: "wechat",
    });
    expect(result).toBe(
      '---\ntitle: "Hello World"\ndate: 2025-04-07\nplatform: wechat\n---',
    );
  });

  test("includes description when provided", () => {
    const result = buildFrontmatter({
      title: "Hello",
      date: "2025-04-07",
      platform: "blog",
      description: "A description",
    });
    expect(result).toContain('description: "A description"');
  });

  test("includes tags when provided", () => {
    const result = buildFrontmatter({
      title: "Hello",
      date: "2025-04-07",
      platform: "wechat",
      tags: ["tech", "news"],
    });
    expect(result).toContain("tags:");
    expect(result).toContain("  - tech");
    expect(result).toContain("  - news");
  });

  test("escapes double quotes in title", () => {
    const result = buildFrontmatter({
      title: 'Title with "quotes"',
      date: "2025-04-07",
      platform: "blog",
    });
    expect(result).toContain('title: "Title with \\"quotes\\""');
  });

  test("omits description when null", () => {
    const result = buildFrontmatter({
      title: "Hello",
      date: "2025-04-07",
      platform: "wechat",
      description: null,
    });
    expect(result).not.toContain("description:");
  });

  test("omits tags when empty array", () => {
    const result = buildFrontmatter({
      title: "Hello",
      date: "2025-04-07",
      platform: "wechat",
      tags: [],
    });
    expect(result).not.toContain("tags:");
  });
});
