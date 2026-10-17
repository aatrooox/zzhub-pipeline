import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultState } from "../state";
import { resolveImageRenderer } from "../adapter-loader";
import { PipelineConfigSchema } from "../schema/config";
import { getDefaultConfig } from "@akairos/typeset-studio";

test("@akairos/typeset-studio npm plugin dynamically loads and renders in pipeline", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "zzhub-typeset-studio-test-"));
  try {
    // 独立数据目录验证账号槽位，避免修改真实模板或下载示例图片。
    const dataDir = join(workspace, "studio-data");
    await mkdir(join(dataDir, "templates"), { recursive: true });
    const template = getDefaultConfig("longform-3-4");
    await writeFile(join(dataDir, "templates", "test-cover.json"), JSON.stringify({
      ...template, id: "test-cover", aspectRatio: "square-1-1", images: [],
    }));
    await writeFile(join(dataDir, "templates", "test-content.json"), JSON.stringify({
      ...template, id: "test-content", images: [],
    }));
    await writeFile(join(dataDir, "default-template.json"), JSON.stringify({
      accounts: { "test-account": { newspic_cover: "test-cover", newspic_content: "test-content" } },
    }));
    const config = PipelineConfigSchema.parse({
      plugins: {
        imageRenderer: {
          module: "@akairos/typeset-studio/adapter",
          options: { dataDir },
        },
      },
    });

    const renderer = await resolveImageRenderer(config);
    expect(renderer.name).toBe("typeset-studio");
    expect(renderer.version).toMatch(/^0\.4\./);

    const doctorChecks = await renderer.doctor?.();
    expect(doctorChecks).toBeDefined();
    expect(doctorChecks?.some((c) => c.name === "@napi-rs/canvas" && c.ok)).toBe(true);

    const outputDir = join(workspace, "images");
    await mkdir(outputDir);

    const state = defaultState();
    state.run_id = "test-typeset-studio";
    state.workspace_root = workspace;
    state.route.primary = "wechat-newspic";
    state.route.account = "test-account";

    const result = await renderer.render({
      state,
      route: "wechat-newspic",
      outputDir,
      title: "关于排版引擎的深度评测",
      bodyText: "# 关于排版引擎的深度评测\n\n测试基于算法的自动化排版能力与分页避障流。\n\n## 自动化设计\n\n完全脱离无头浏览器，以原生 Skia Canvas 直接生成多页高清图片。",
    });

    expect(result.pageCount).toBeGreaterThanOrEqual(1);
    const coverAsset = result.assets.find((a) => a.kind === "cover");
    expect(coverAsset).toBeDefined();
    expect(coverAsset?.route).toBe("wechat-newspic");

    const coverBuffer = await readFile(coverAsset!.path);
    expect(coverBuffer.subarray(1, 4).toString()).toBe("PNG");
    expect(coverBuffer.readUInt32BE(16)).toBe(1200);
    expect(coverBuffer.readUInt32BE(20)).toBe(1200);

    const pageAsset = result.assets.find((a) => a.kind === "page");
    expect(pageAsset).toBeDefined();
    const pageBuffer = await readFile(pageAsset!.path);
    expect(pageBuffer.subarray(1, 4).toString()).toBe("PNG");
    expect(pageBuffer.readUInt32BE(16)).toBe(1080);
    expect(pageBuffer.readUInt32BE(20)).toBe(1440);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}, 30_000);
