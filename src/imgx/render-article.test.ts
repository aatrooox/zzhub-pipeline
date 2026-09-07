import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { PNG } from "pngjs";

import { runRenderArticleCli, splitTextByPageMarkers } from "./render-article";

describe("splitTextByPageMarkers", () => {
  test("splits chinese page markers into fixed page text segments", () => {
    const result = splitTextByPageMarkers([
      "导语第一行",
      "导语第二行",
      "",
      "【第一页】",
      "第一页正文",
      "",
      "【第二页】",
      "第二页正文",
    ].join("\n"));

    expect(result).toEqual([
      {
        page: 1,
        text: [
          "导语第一行",
          "导语第二行",
          "",
          "第一页正文",
        ].join("\n"),
      },
      {
        page: 2,
        text: "第二页正文",
      },
    ]);
  });

  test("supports english page markers", () => {
    const result = splitTextByPageMarkers([
      "【Page 2】",
      "Second page copy",
      "",
      "【Page 3】",
      "Third page copy",
    ].join("\n"));

    expect(result).toEqual([
      { page: 2, text: "Second page copy" },
      { page: 3, text: "Third page copy" },
    ]);
  });

  test("returns an empty list when there are no page markers", () => {
    expect(splitTextByPageMarkers("纯正文，没有页标记")).toEqual([]);
  });
});

test("explicit pages keep their text and images inside the real content area", async () => {
  const directory = mkdtempSync(join(tmpdir(), "zzhub-spec-pages-"));
  try {
    const imagePath = join(directory, "wide.png");
    const png = new PNG({ width: 800, height: 200 });
    for (let offset = 0; offset < png.data.length; offset += 4) {
      png.data[offset] = 66; png.data[offset + 1] = 120; png.data[offset + 2] = 162; png.data[offset + 3] = 255;
    }
    writeFileSync(imagePath, PNG.sync.write(png));
    const specPath = join(directory, "pages.json");
    writeFileSync(specPath, JSON.stringify({ default_image_layout: "fill", target_fill_ratio: 0.8, page_specs: [1, 2].map(page => ({ page, images: [{ src: imagePath, caption: "配图说明" }] })) }));
    const result = await runRenderArticleCli(["--title", "显式分页", "--text", "【第一页】\n## 第一页标题\n\n第一段文字，**跨行重点仍然保留**。\n\n【第二页】\n## 第二页标题\n\n第二页的文字与图片不应重叠。", "--page-image-spec-file", specPath, "--max-pages", "2", "--out-dir", directory]);
    expect(result.pageCount).toBe(2);
    expect(result.pages.map(page => page.imageSources)).toEqual([[imagePath], [imagePath]]);
    for (const page of result.pages) {
      const rendered = PNG.sync.read(readFileSync(join(directory, `article-${String(page.page).padStart(2, "0")}.png`)));
      expect([rendered.width, rendered.height]).toEqual([900, 1200]);
    }
  } finally { rmSync(directory, { recursive: true, force: true }); }
}, 30_000);
