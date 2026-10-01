import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readArticleTheme, snapshotArticleTheme } from "./article-theme";
import { filterIdempotent } from "./providers/publish-core";

const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "zzp-theme-"));
  roots.push(root);
  const manifest = { schemaVersion: 1, engineVersion: 1, id: "test", name: "样板", version: "1.0.0", assets: ["asset.png"] };
  for (const [name, content] of Object.entries({ "manifest.json": JSON.stringify(manifest), "article.css": "p { color: red; }", "example.md": "==亮点==", "preview.html": "<p>预览</p>", "LICENSE.txt": "test only", "asset.png": "asset-1" })) await writeFile(join(root, name), content);
  return { root, manifest };
}

test("离线包校验、并发安装与样式/素材版本失效", async () => {
  const { root } = await fixture();
  const theme = await readArticleTheme(root);
  const [a, b] = await Promise.all([snapshotArticleTheme(theme, join(root, "installed")), snapshotArticleTheme(theme, join(root, "installed"))]);
  expect(a.path).toBe(b.path);
  expect((await readArticleTheme(a.path)).hash).toBe(theme.hash);
  await writeFile(join(root, "asset.png"), "asset-2");
  expect((await readArticleTheme(root)).hash).not.toBe(theme.hash);
  await writeFile(join(root, "article.css"), "p { color: blue; }");
  const changed = await readArticleTheme(root);
  expect(changed.hash).not.toBe(theme.hash);
  expect(await readFile(join(a.path, "..", "article.css"), "utf8")).toContain("red");
  const target = { route: "wechat-article" as const, account: "default" };
  const result = { ...target, status: "success" as const, content_version: 1, render_version: 1, article_theme_hash: theme.hash };
  expect(filterIdempotent([target], [result as any], 1, 1, new Map([["wechat-article@default", theme.hash]]))).toHaveLength(0);
  expect(filterIdempotent([target], [result as any], 1, 1, new Map([["wechat-article@default", changed.hash]]))).toHaveLength(1);
  expect(filterIdempotent([target], [{ ...result, article_theme_hash: undefined } as any], 1, 1)).toHaveLength(0);
});

test("越界、符号链接、网络样式与不兼容版本不能导入", async () => {
  const { root, manifest } = await fixture();
  for (const patch of [{ assets: ["../outside"] }, { schemaVersion: 2 }, { engineVersion: 2 }, { editorVars: { "--brand": "url(file:///secret)" } }]) {
    await writeFile(join(root, "manifest.json"), JSON.stringify({ ...manifest, ...patch }));
    await expect(readArticleTheme(root)).rejects.toThrow();
  }
  await writeFile(join(root, "manifest.json"), JSON.stringify(manifest));
  await rm(join(root, "asset.png"));
  await symlink(join(root, "LICENSE.txt"), join(root, "asset.png"));
  await expect(readArticleTheme(root)).rejects.toThrow("符号链接");
  await rm(join(root, "asset.png"));
  await writeFile(join(root, "asset.png"), "asset");
  for (const css of ["@import 'https://example.com/css';", String.raw`p { background: u\72l(file:///secret); }`, "p { background: url/**/(file:///secret); }"]) {
    await writeFile(join(root, "article.css"), css);
    await expect(readArticleTheme(root)).rejects.toThrow("外部资源");
  }
});

test("结果未知阻止普通重发，明确重置才建立新发布尝试", async () => {
  const { root } = await fixture();
  const { defaultState, readState, writeState } = await import("./state");
  const { PipelineConfigSchema } = await import("./schema/config");
  const { resolveWorkspacePaths } = await import("./config");
  const { executePublishTargets } = await import("./providers/publish-core");
  const { reset } = await import("./commands/reset");
  const state = defaultState();
  state.run_id = "unknown-result";
  state.workspace_root = root;
  state.state_path = join(root, "state.json");
  state.intent.content_form = "article";
  state.asset_path = root;
  state.publish.results = [{ route: "wechat-article", account: "default", status: "failed", detail: "WX_RESULT_UNKNOWN", published_at: null, content_version: 0, render_version: 0 }];
  const config = PipelineConfigSchema.parse({});
  const result = await executePublishTargets({ state, targets: [{ route: "wechat-article", account: "default" }], dryRun: true, config, workspacePaths: resolveWorkspacePaths(root, config) });
  expect(result.errors[0]?.error).toContain("WX_RESULT_UNKNOWN");
  state.intent.article_theme = join(root, "missing-template");
  const invalidTheme = await executePublishTargets({ state, targets: [{ route: "wechat-article", account: "default" }], dryRun: true, config, workspacePaths: resolveWorkspacePaths(root, config) });
  expect(invalidTheme.errors[0]?.error).toContain("WX_RESULT_UNKNOWN");
  state.intent.article_theme = null;
  await writeState(state.state_path, state);
  await reset(["--state", state.state_path, "--mode", "publish"]);
  const retried = await readState(state.state_path);
  expect(retried.publish.attempt).toBe(1);
  expect(retried.publish.results).toHaveLength(0);
  config.wx.defaultAccount = "main";
  config.wx.accounts = { main: { ...config.wx.accounts.default!, articleTheme: root } };
  const fallback = await executePublishTargets({ state: retried, targets: [{ route: "wechat-article", account: "default" }], dryRun: true, config, workspacePaths: resolveWorkspacePaths(root, config) });
  expect(fallback.errors).toHaveLength(0);
  expect(fallback.results[0]?.article_theme_hash).toBe((await readArticleTheme(root)).hash);
});
