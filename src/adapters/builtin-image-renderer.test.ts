import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultState, normalizeNewspicRenderSpec } from "../state";
import { builtinImageRenderer } from "./builtin-image-renderer";

test("multi mode without page specs renders body pages and excludes stale files", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "zzhub-auto-pages-"));
  const previous = process.env.TEST_RENDER_CARD_STUB;
  process.env.TEST_RENDER_CARD_STUB = "1";
  try {
    const outputDir = join(workspace, "images");
    await mkdir(outputDir);
    await writeFile(join(outputDir, "article-99.png"), "previous output");
    const state = defaultState();
    state.run_id = "auto-pages";
    state.workspace_root = workspace;
    state.route.primary = "wechat-newspic";
    state.intent.newspic_render = normalizeNewspicRenderSpec({ pagination_mode: "multi", min_pages: 2, target_fill_ratio: 0.8 });
    const result = await builtinImageRenderer.render({ state, route: "wechat-newspic", outputDir, title: "完整标题：副标题", bodyText: "正文应该舒适易读，不需要手工指定每一页。".repeat(24) });
    expect(result.pageCount).toBeGreaterThanOrEqual(2);
    expect(result.assets.filter(asset => asset.kind === "page")).toHaveLength(result.pageCount);
    expect(result.assets.every(asset => !asset.path.endsWith("article-99.png"))).toBe(true);
    expect((await readFile(result.assets.find(asset => asset.kind === "page")!.path)).subarray(1, 4).toString()).toBe("PNG");
    expect(await readFile(join(outputDir, "article-99.png"), "utf8")).toBe("previous output");
  } finally {
    if (previous === undefined) delete process.env.TEST_RENDER_CARD_STUB;
    else process.env.TEST_RENDER_CARD_STUB = previous;
    await rm(workspace, { recursive: true, force: true });
  }
}, 30_000);
