import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { remoteImageRenderer } from "./remote-image-renderer";
import { resolveImageRenderer } from "../adapter-loader";
import { defaultState } from "../state";
import type { ImageRenderInput } from "../adapter-types";

const TEST_CONFIG_PATH = join(
  tmpdir(),
  `zzhub-pipeline-test-remote-${process.pid}.json`,
);
process.env.ZZHUB_PIPELINE_CONFIG = TEST_CONFIG_PATH;

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

describe("remoteImageRenderer", () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await makeTempDir("zzhub-remote-");
    await writeFile(TEST_CONFIG_PATH, JSON.stringify({
      render: { backend: "remote", dispatchTimeoutMs: 200 },
    }), "utf-8");
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  test("returns pending when no client completes the cover within the timeout", async () => {
    const state = defaultState();
    state.run_id = "run-remote";
    state.workspace_root = workspace;
    state.state_path = join(workspace, "state.json");
    state.route.primary = "wechat-article";
    state.metadata.title = "Hello";
    state.route.highlight_words = ["Hello"];

    const outputDir = join(workspace, "posts", "x", "images", "wechat");
    const input: ImageRenderInput = {
      state,
      bodyText: "# Hello",
      outputDir,
      title: "Hello",
      route: "wechat-article",
    };

    const out = await remoteImageRenderer.render(input);

    expect(out.assets).toEqual([]);
    expect(out.pageCount).toBe(0);
    expect(out.pending).toBeDefined();
    expect(out.pending?.job_id).toBeTruthy();
  });

  test("resolveImageRenderer selects remote when config.render.backend=remote", async () => {
    const renderer = await resolveImageRenderer({
      paths: { workspaceRoot: null, postsDirName: "posts", postsPathPattern: "{date}-{slug}", blogRoot: null, zotepadExportHtml: null },
      services: { zotepadBaseUrl: "", zotepadToken: "" },
      commands: { blogPublish: ["pnpm", "publish:post"] },
      wx: { baseUrl: "", timeout: 30000, defaultAccount: "default", accounts: {} } as never,
      cos: { pat: "", baseUrl: null, publicBaseUrl: "" },
      plugins: { imageRenderer: null, markdownRenderer: null },
      imgx: { icon: null },
      render: { backend: "remote", brokerUrl: null, brokerToken: "", dispatchTimeoutMs: 200 },
    });
    expect(renderer.name).toBe("remote-browser");
  });
});
