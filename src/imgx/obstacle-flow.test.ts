import { describe, expect, test } from "bun:test";
import { parseInlineText, splitCoverText } from "./inline-text";
import { paginateBlocks, type FlowBlock } from "./obstacle-flow";
import { getLongformTheme } from "./longform-theme";
import { parseContentBlocks, runRenderArticleCli, toFlowBlocks } from "./render-article";

const font = '400 40px "LXGWNeoZhiSongPlus"';
const paragraph = (text: string): FlowBlock => ({ text, runs: parseInlineText(text), font, lineHeight: 64, className: "body-line" });

describe("rich text pagination", () => {
  test("keeps original title, English word spaces and emphasis across lines", () => {
    expect(splitCoverText("Recordly：开源工具发布")).toEqual({ title: "Recordly：", subtitle: "开源工具发布" });
    expect(splitCoverText("https://example.com").subtitle).toBe("");
    const source = "使用 **AI Agent 和跨行核心重点** 继续完成全部内容。";
    const pages = paginateBlocks([paragraph(source)], 240, 160, []);
    const lines = pages.flatMap(page => page.lines);
    expect(lines.filter(line => line.runs.some(run => run.bold)).length).toBeGreaterThan(1);
    expect(lines.map(line => line.text).join("").replace(/\s/g, "")).toBe(source.replace(/\*|\s/g, ""));
    expect(parseInlineText("使用 AI Agent 编写内容")[0]!.text).toContain("AI Agent");
  });

  test("moves a heading with the following two lines", () => {
    const heading: FlowBlock = { ...paragraph("标题"), font: '700 56px "AlimamaShuHeiTi"', lineHeight: 72, className: "heading", keepWithNext: true, gapAfter: 24 };
    const pages = paginateBlocks([paragraph("前文"), heading, paragraph("正文正文正文正文正文正文")], 240, 250, []);
    expect(pages).toHaveLength(2);
    expect(pages[0]!.lines.every(line => line.className !== "heading")).toBe(true);
    expect(pages[1]!.lines[0]!.className).toBe("heading");
    expect(pages[1]!.lines.length).toBeGreaterThanOrEqual(3);
  });

  test("skips an image that blocks the full line and keeps remaining images", () => {
    const picture = { src: "fixture.png", alt: "", x: 0, y: 0, width: 400, height: 120 };
    const pages = paginateBlocks([paragraph("正文不能覆盖图片")], 400, 400, [picture, picture], { pageImageLimit: 1 });
    expect(pages).toHaveLength(2);
    expect(pages[0]!.lines[0]!.y).toBeGreaterThanOrEqual(140);
    expect(pages.flatMap(page => page.images)).toHaveLength(2);
    expect(() => paginateBlocks([paragraph("正文")], 400, 20, [])).toThrow("页面高度不足");
  });

  test("uses comfortable sizes for headings and body, and retains ordered bullets", () => {
    const blocks = toFlowBlocks(parseContentBlocks("# 一级\n## 二级\n### 三级\n\n正文\n\n1. 第一项\n2. 第二项"), getLongformTheme("paper-sage"));
    expect(blocks.map(block => block.lineHeight)).toEqual([72, 66, 60, 64, 64, 64]);
    expect(blocks[3]!.font).toContain("40px");
    expect(blocks[4]!.bullet).toBe("1.");
  });

  test("impossible page limits terminate with useful errors before rendering", async () => {
    await expect(runRenderArticleCli(["--title", "页数", "--text", "正文内容。".repeat(300), "--max-pages", "1", "--out-dir", "/unused"])).rejects.toThrow("至少需要");
    await expect(runRenderArticleCli(["--title", "页数", "--text", "正文", "--min-pages", "3", "--out-dir", "/unused"])).rejects.toThrow("min_pages=3");
    await expect(runRenderArticleCli(["--title", "配图", "--text", "正文", "--require-image-every-page", "--out-dir", "/unused"])).rejects.toThrow("缺少要求的图片");
  });
});
