import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { defaultState } from "../state";
import { resolveImageRenderer } from "../adapter-loader";
import { PipelineConfigSchema } from "../schema/config";

test("@akairos/typeset-studio npm plugin dynamically loads and renders in pipeline", async () => {
  const config = PipelineConfigSchema.parse({
    plugins: {
      imageRenderer: "@akairos/typeset-studio/adapter",
    },
  });

  const renderer = await resolveImageRenderer(config);
  expect(renderer.name).toBe("typeset-studio");
  expect(renderer.version).toBe("0.2.0");

  const doctorChecks = await renderer.doctor?.();
  expect(doctorChecks).toBeDefined();
  expect(doctorChecks?.some((c) => c.name === "@napi-rs/canvas" && c.ok)).toBe(true);

  const workspace = await mkdtemp(join(tmpdir(), "zzhub-typeset-studio-test-"));
  try {
    const outputDir = join(workspace, "images");
    await mkdir(outputDir);

    const state = defaultState();
    state.run_id = "test-typeset-studio";
    state.workspace_root = workspace;
    state.route.primary = "wechat-newspic";

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

    const pageAsset = result.assets.find((a) => a.kind === "page");
    expect(pageAsset).toBeDefined();
    const pageBuffer = await readFile(pageAsset!.path);
    expect(pageBuffer.subarray(1, 4).toString()).toBe("PNG");
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}, 30_000);
