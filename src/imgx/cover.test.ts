import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { PNG } from "pngjs";
import { CoverConfigSchema, resolveCoverTheme } from "../schema/cover-theme";
import { renderThemedCover, resolveCoverImage } from "./cover";
import { runRenderCardCli } from "./render-card";
import { ICONS_DIR, findChrome } from "./runtime";

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), "zzhub-cover-images-")); });
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe("cover image sources", () => {
  test("configured HTTP Logo, custom signature and system fonts render together", async () => {
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch() {
      return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#1267ab"/></svg>', { headers: { "content-type": "image/svg+xml" } });
    } });
    const previousConfig = process.env.ZZHUB_PIPELINE_CONFIG;
    process.env.ZZHUB_PIPELINE_CONFIG = join(directory, "config.json");
    try {
      const config = { render: { branding: { logo: `http://127.0.0.1:${server.port}/logo.svg`, footerText: "公众号：自由配置" } } };
      await writeFile(process.env.ZZHUB_PIPELINE_CONFIG, JSON.stringify(config));
      const theme = resolveCoverTheme(CoverConfigSchema.parse({}), "wechat-cover-split", null, "minimal");
      for (const font of Object.values(theme.typography)) font.fontFamily = "system-ui";
      const outPath = join(directory, "configured-brand.png");
      await runRenderCardCli(["--template", "wechat-cover-split", "--text", "按配置生成：本机字体与远程 Logo", "--out", outPath], undefined, theme);
      const png = PNG.sync.read(await readFile(outPath));
      const offset = (200 * png.width + 1140) * 4;
      expect([...png.data.slice(offset, offset + 4)]).toEqual([18, 103, 171, 255]);
    } finally {
      if (previousConfig === undefined) delete process.env.ZZHUB_PIPELINE_CONFIG;
      else process.env.ZZHUB_PIPELINE_CONFIG = previousConfig;
      await server.stop(true);
    }
  }, 30_000);

  test("resolves local files and rejects missing or invalid images", async () => {
    const logo = join(ICONS_DIR, "logo.png");
    const snapshot = fileURLToPath(await resolveCoverImage(logo, directory, 0));
    expect(snapshot.startsWith(directory)).toBe(true);
    expect(await readFile(snapshot)).toEqual(await readFile(logo));
    const invalid = join(directory, "invalid.png");
    await writeFile(invalid, "not an image");
    await expect(resolveCoverImage(invalid, directory, 1)).rejects.toThrow("有效图片");
    await expect(resolveCoverImage(join(directory, "missing.png"), directory, 2)).rejects.toThrow();
  });

  test("downloads HTTP images before rendering and reports HTTP failures", async () => {
    const bytes = await readFile(join(ICONS_DIR, "logo.png"));
    const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch(request) {
      return new URL(request.url).pathname === "/ok" ? new Response(bytes, { headers: { "content-type": "image/png" } }) : new Response("missing", { status: 404 });
    } });
    try {
      const url = await resolveCoverImage(`http://127.0.0.1:${server.port}/ok`, directory, 0);
      expect(await readFile(fileURLToPath(url))).toEqual(bytes);
      await expect(resolveCoverImage(`http://127.0.0.1:${server.port}/missing`, directory, 1)).rejects.toThrow("HTTP 404");
    } finally { await server.stop(true); }
  });

  test("renders a transparent frame above a background and fails on overflowing text", async () => {
    const chromePath = findChrome();
    if (!chromePath) throw new Error("Chrome is required for this focused render check");
    const frame = '<svg xmlns="http://www.w3.org/2000/svg" width="1340" height="400"><rect x="8" y="8" width="1324" height="384" fill="none" stroke="#ff4477" stroke-width="12"/></svg>';
    const framePath = join(directory, "frame.svg");
    await writeFile(framePath, frame);
    const theme = resolveCoverTheme(CoverConfigSchema.parse({}), "wechat-cover-split", null, "minimal");
    theme.background.image = { src: join(ICONS_DIR, "logo.png"), fit: "contain", position: { x: 100, y: 50 }, opacity: 0.1 };
    theme.decoration.image = { src: framePath, fit: "contain", position: { x: 50, y: 50 }, opacity: 1 };
    const outPath = join(directory, "cover.png");
    const input = { chromePath, outPath, text: "完整标题：主题支持背景与边框", footer: "唯一署名", iconPath: join(ICONS_DIR, "logo.png"), theme, highlightWords: ["主题"] };
    await renderThemedCover(input);
    const png = PNG.sync.read(await readFile(outPath));
    expect([png.width, png.height]).toEqual([1340, 400]);
    expect([...png.data.slice((8 * png.width + 8) * 4, (8 * png.width + 8) * 4 + 4)]).toEqual([255, 68, 119, 255]);
    await expect(renderThemedCover({ ...input, outPath: join(directory, "overflow.png"), text: "长标题".repeat(160) })).rejects.toThrow("最小字号");
  }, 30_000);
});
