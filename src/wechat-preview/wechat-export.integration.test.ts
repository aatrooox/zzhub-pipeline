import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { PNG } from "pngjs";
import { findChrome } from "../imgx/runtime";
import { replaceImageUrls } from "../providers/wechat";
import { exportMarkdownToWechatHtml } from "./index";

const fixturePath = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures",
  "all-nodes.md",
);

describe("semantic WeChat HTML export", () => {
  let tempDir: string | null = null;

  afterEach(async () => {
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

  test.skipIf(findChrome() === null)("preserves Crepe image scaling and captions through export and upload URL replacement", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "zzhub-wechat-images-"));
    for (const [name, width, height] of [["large", 1200, 600], ["small", 200, 400]] as const) {
      const png = new PNG({ width, height });
      png.data.fill(255);
      await writeFile(join(tempDir, `${name}.png`), PNG.sync.write(png));
    }

    // 同一图片的不同缩放必须各自生效，小图不能按正文宽度放大。
    const scaledImages = [
      { name: "large", ratio: "0.50", width: 50, maxWidth: 600 },
      { name: "large", ratio: "1.00", width: 100, maxWidth: 1200 },
      { name: "large", ratio: "1.50", width: 100, maxWidth: 1800 },
      { name: "small", ratio: "0.50", width: 50, maxWidth: 100 },
      { name: "small", ratio: "1.00", width: 100, maxWidth: 200 },
      { name: "small", ratio: "1.50", width: 100, maxWidth: 300 },
    ];
    const ordinaryAlts = ["普通说明", "", "2026", "0.00", "-0.50", "0.5", "1.00x", "Infinity"];
    const markdownPath = join(tempDir, "images.md");
    await writeFile(markdownPath, [
      ...scaledImages.map(({ name, ratio }, index) => `![${ratio}](./${name}.png "缩放图注 ${index}")`),
      ...ordinaryAlts.map(alt => `![${alt}](./small.png "普通图注")`),
      '行内图片 ![0.50](./small.png "行内图注") 后文',
    ].join("\n\n"));

    const result = await exportMarkdownToWechatHtml({
      markdownPath,
      outPath: join(tempDir, "images.html"),
      account: "default",
    });
    const uploadedHtml = replaceImageUrls(result.html, {
      [join(tempDir, "large.png")]: "https://mmbiz.qpic.cn/large.png",
      [join(tempDir, "small.png")]: "https://mmbiz.qpic.cn/small.png",
    });
    const images = uploadedHtml.match(/<img\b[^>]*>/g) ?? [];
    expect(images).toHaveLength(scaledImages.length + ordinaryAlts.length + 1);
    scaledImages.forEach(({ name, width, maxWidth }, index) => {
      expect(images[index]).toContain(`width: ${width}%;`);
      expect(images[index]).toContain(`max-width: ${maxWidth}px;`);
      expect(images[index]).toContain("height: auto;");
      expect(images[index]).toContain(`src="https://mmbiz.qpic.cn/${name}.png"`);
      expect(images[index]).toContain(`data-src="https://mmbiz.qpic.cn/${name}.png"`);
      expect(uploadedHtml).toMatch(new RegExp(`<p[^>]*>缩放图注 ${index}</p>`));
    });
    ordinaryAlts.forEach((alt, index) => {
      expect(images[scaledImages.length + index]).toContain(`alt="${alt}"`);
      expect(images[scaledImages.length + index]).toContain("width: auto;");
      expect(images[scaledImages.length + index]).toContain("max-width: 100%;");
    });
    expect(uploadedHtml).toMatch(/<p[^>]*>普通图注<\/p>/);
    expect(images.at(-1)).toContain('alt="0.50"');
    expect(images.at(-1)).toContain("width: auto;");
    expect(uploadedHtml).not.toContain(">行内图注</p>");
    expect(uploadedHtml).not.toContain(tempDir);
  }, 30_000);

  test.skipIf(findChrome() === null)("reports an export error when a scaled image cannot be decoded", async () => {
    tempDir = await mkdtemp(join(tmpdir(), "zzhub-wechat-image-error-"));
    const markdownPath = join(tempDir, "images.md");
    await writeFile(join(tempDir, "broken.png"), "not an image");
    await writeFile(markdownPath, '![0.50](./broken.png "失败图注")');

    await expect(exportMarkdownToWechatHtml({
      markdownPath,
      outPath: join(tempDir, "images.html"),
      account: "default",
    })).rejects.toMatchObject({
      kind: "render_error",
      message: expect.stringContaining("无法读取缩放图片的原始尺寸"),
    });
  }, 30_000);
});
