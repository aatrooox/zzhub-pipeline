import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { findChrome } from "../imgx/runtime";
import { exportMarkdownToWechatHtml } from "./index";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "all-nodes.md",
);

describe("semantic WeChat HTML export", () => {
  let tempDir: string | null = null;

  afterAll(async () => {
    if (tempDir) await rm(tempDir, { recursive: true, force: true });
  });

  test.skipIf(findChrome() === null)("renders all nodes, cascades CSS, and emits a safe exact preview", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "zzhub-wechat-renderer-"));
    const cssPath = join(tempDir, "custom.css");
    const htmlPath = join(tempDir, "article.html");
    const previewPath = join(tempDir, "preview.html");
    await writeFile(cssPath, `
.milkdown .editor { --fixture-paragraph: #123456; }
.milkdown .editor p { color: var(--fixture-paragraph); }
.milkdown .editor h2 { color: #224466; display: grid; position: fixed; }
.milkdown .editor [data-wechat-node="inline-code"] { background-color: #abcdef; }
`, "utf-8");

    const result = await exportMarkdownToWechatHtml({
      markdownPath: fixturePath,
      outPath: htmlPath,
      previewShellOutPath: previewPath,
      customCss: cssPath,
      account: "default",
      title: "全节点精确预览",
    });
    const html = await readFile(htmlPath, "utf-8");
    const preview = await readFile(previewPath, "utf-8");

    expect(result.html).toBe(html);
    expect(html.length).toBeLessThan(65_400);
    expect(html).toContain("一级标题：克制的中文编辑部");
    expect(html).toContain("<blockquote");
    expect(html).toContain("<table");
    expect(html).toContain("<img ");
    expect(html).toContain("图片说明：克制、清晰、适合移动端阅读");
    expect(html).toContain("typescript</p><pre");
    expect(html).toContain("  title: string;");
    expect(html).toContain("white-space: pre");
    expect(html).toContain("☑");
    expect(html).toContain("☐");
    expect(html).toContain("[1] 外部链接: https://example.com/reading-guide?from=wechat");
    expect(html).toContain("[2] 资料链接: https://example.org/reference");
    expect(html).toContain("相关链接");
    expect(html).toMatch(/color: (?:#123456|rgb\(18, 52, 86\))/);
    expect(html).toMatch(/color: (?:#224466|rgb\(34, 68, 102\))/);
    expect(html).toMatch(/background-color: (?:#abcdef|rgb\(171, 205, 239\))/);
    const inlineStyles = Array.from(
      html.matchAll(/<[a-z][^>]*\sstyle="([^"]*)"/gi),
      (match) => match[1] ?? "",
    );
    expect(inlineStyles.some((style) => style.includes("var("))).toBe(false);

    expect(html).not.toMatch(/\sclass=/i);
    expect(html).not.toContain("data-wechat-node");
    expect(html).not.toContain(".milkdown");
    expect(html).not.toContain(".cm-");
    expect(html).not.toMatch(/<(?:script|style|iframe|object|embed|form|button)\b/i);
    expect(html).not.toMatch(/<[^>]+\son[a-z]+=/i);
    expect(inlineStyles.some((style) => (
      /(?:^|;)\s*display:\s*(?:flex|grid)(?:;|$)/i.test(style) ||
      /(?:^|;)\s*position\s*:/i.test(style)
    ))).toBe(false);
    expect(html).not.toMatch(/<(?:h[1-6]|figure|figcaption|div)\b/i);
    expect(html).toContain("&lt;script&gt;alert('never')&lt;/script&gt;");

    const tagNames = Array.from(html.matchAll(/<\/?([a-z][a-z0-9-]*)\b/gi), (match) => match[1]?.toLowerCase());
    const allowedTags = new Set([
      "section", "p", "blockquote", "ul", "ol", "li", "pre", "code",
      "span", "strong", "em", "b", "i", "u", "s", "del", "a", "img",
      "br", "hr", "table", "thead", "tbody", "tr", "th", "td",
    ]);
    expect(tagNames.every((tagName) => tagName !== undefined && allowedTags.has(tagName))).toBe(true);

    expect(preview).toContain(`<main id="wechat-preview-content">${html}</main>`);
    expect(preview).not.toContain("editor-export.js");
    expect(preview).not.toContain("browser-dist");
  }, 30_000);
});
