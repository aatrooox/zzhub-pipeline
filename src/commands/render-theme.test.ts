import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig, normalizeConfig, saveConfig } from "../config";
import { defaultState, normalizeNewspicRenderSpec, readState, writeState } from "../state";
import { resolveFullRoute } from "../routes";
import { init } from "./init";
import { ingestHandoff } from "./ingest-handoff";
import { render } from "./render";
import { configCommand } from "./config";
import { getTaskByStatePath } from "../task-manager";

let workspace: string;
let previousConfig: string | undefined;
let output: ReturnType<typeof spyOn>;
beforeEach(async () => {
  workspace = await mkdtemp(join(tmpdir(), "zzhub-cover-contract-"));
  previousConfig = process.env.ZZHUB_PIPELINE_CONFIG;
  process.env.ZZHUB_PIPELINE_CONFIG = join(workspace, "config.json");
  saveConfig(normalizeConfig({}));
  output = spyOn(console, "log").mockImplementation(() => {});
});
afterEach(async () => {
  output.mockRestore();
  if (previousConfig === undefined) delete process.env.ZZHUB_PIPELINE_CONFIG;
  else process.env.ZZHUB_PIPELINE_CONFIG = previousConfig;
  await rm(workspace, { recursive: true, force: true });
});

async function preparedTask() {
  const assetPath = join(workspace, "posts", "2026-09-07-cover");
  await mkdir(assetPath, { recursive: true });
  await writeFile(join(assetPath, "post.md"), "完整正文保持不变。", "utf8");
  const state = defaultState();
  state.run_id = "cover-contract";
  state.workspace_root = workspace;
  state.asset_path = assetPath;
  state.state_path = join(assetPath, "workflow-state.json");
  state.route = resolveFullRoute("发公众号文章", { account: "default", contentForm: "article", targets: ["wechat"] });
  state.intent.intent_text = "发公众号文章";
  state.intent.content_form = "article";
  state.intent.targets = ["wechat"];
  state.intent.cover_theme = "business";
  state.metadata = { ...state.metadata, title: "完整标题：保留副标题", slug: "cover", date: "2026-09-07" };
  state.content_review.status = "passed";
  state.phase.prepare.status = "done";
  await writeState(state.state_path, state);
  return state;
}

describe("cover CLI contract", () => {
  test("init persists the selected theme and rejects unknown themes", async () => {
    const args = ["--workspace", workspace, "--task-kind", "publish", "--content-form", "article", "--targets", "wechat", "--content-origin", "user"];
    await init([...args, "--cover-theme", "business"]);
    const runs = join(workspace, ".zzhub-media", "runs");
    const file = (await readdir(runs)).find(name => name.endsWith(".json"))!;
    expect((await readState(join(runs, file))).intent.cover_theme).toBe("business");
    await expect(init([...args, "--cover-theme", "missing"])).rejects.toThrow("主题不存在");
  });

  test("a theme-only handoff retains reviewed content and reenters render", async () => {
    const state = await preparedTask();
    state.phase.current = "done";
    state.phase.render.status = "done";
    state.mode = "done";
    await writeState(state.state_path, state);
    const handoff = join(workspace, "handoff.json");
    await writeFile(handoff, JSON.stringify({ workflow_handoff: { mode: "resume", state_path: state.state_path, cover_theme: "technology" } }));
    await ingestHandoff(["--file", handoff, "--workspace", workspace]);
    const result = await readState(state.state_path);
    expect(result.intent.cover_theme).toBe("technology");
    expect(result.asset_path).toBe(state.asset_path);
    expect(result.content_review.status).toBe("passed");
    expect(result.phase.prepare.status).toBe("done");
    expect(result.phase.current).toBe("render");
    expect(await readFile(join(state.asset_path, "post.md"), "utf8")).toBe("完整正文保持不变。");
  });

  test("render forwards the latest theme to an existing plugin and command choice wins", async () => {
    const state = await preparedTask();
    const pluginPath = join(workspace, "plugin.mjs");
    await writeFile(pluginPath, 'import {writeFile} from "node:fs/promises"; import {join} from "node:path"; export default {name:"contract-probe",async render(input){await writeFile(join(input.state.asset_path,"received.json"),JSON.stringify(input));const path=join(input.state.asset_path,"cover.png");await writeFile(path,"stub");return {assets:[{kind:"cover",route:input.route,path}],pageCount:1,pages:[]}}};');
    const config = loadConfig();
    config.plugins.imageRenderer = pluginPath;
    config.render.cover.themes.business!.typography.title.fontSize = 101;
    config.render.cover.themes.business!.colors.accent = "#123789";
    config.render.branding.logo = "https://example.com/custom-logo.png";
    config.render.branding.footerText = "公众号：自定义名称";
    saveConfig(config);
    await render(["--state", state.state_path]);
    let received = JSON.parse(await readFile(join(state.asset_path, "received.json"), "utf8"));
    expect(received.coverTheme.id).toBe("business");
    expect(received.coverTheme.typography.title.fontSize).toBe(88);
    expect(received.coverTheme.colors.accent).toBe("#123789");
    expect(received.title).toBe(state.metadata.title);
    expect(received.accountVisualParams.footer).toBe("公众号：自定义名称");
    expect(received.accountVisualParams.fallbackIcon).toBe("https://example.com/custom-logo.png");
    await render(["--state", state.state_path, "--cover-theme", "minimal"]);
    received = JSON.parse(await readFile(join(state.asset_path, "received.json"), "utf8"));
    expect(received.coverTheme.id).toBe("minimal");
    expect((await readState(state.state_path)).intent.cover_theme).toBe("minimal");
    expect((await readState(state.state_path)).images.plan.cover_theme).toBe("minimal");
  });

  test("persists Studio template selections and image replacements independently of body images", async () => {
    const state = await preparedTask();
    const pluginPath = join(workspace, "studio-probe.mjs");
    await writeFile(pluginPath, 'import {writeFile} from "node:fs/promises"; import {join} from "node:path"; export default {name:"studio-probe",async render(input){await writeFile(join(input.state.asset_path,"received.json"),JSON.stringify(input));const path=join(input.state.asset_path,"cover.png");await writeFile(path,"stub");return {assets:[{kind:"cover",route:input.route,path}],pageCount:1,pages:[]}}};');
    const config = loadConfig();
    config.plugins.imageRenderer = pluginPath;
    saveConfig(config);
    const mappingPath = join(workspace, "images.json");
    await writeFile(mappingPath, JSON.stringify({ cover: { background: "replacement.png" }, content: { logo: "https://example.com/logo.png" } }));
    await render(["--state", state.state_path, "--studio-cover-template", "封面模板", "--studio-content-template", "正文模板", "--template-images-file", mappingPath]);
    let received = JSON.parse(await readFile(join(state.asset_path, "received.json"), "utf8"));
    expect(received.studioTemplates).toEqual({ cover: "封面模板", content: "正文模板" });
    expect(received.templateImageOverrides).toEqual({ cover: { background: join(workspace, "replacement.png") }, content: { logo: "https://example.com/logo.png" } });
    expect(received.bodyImages).toEqual([]);
    const persisted = (await readState(state.state_path)).intent.studio_render;
    expect(persisted?.templates?.cover).toBe("封面模板");
    await render(["--state", state.state_path]);
    received = JSON.parse(await readFile(join(state.asset_path, "received.json"), "utf8"));
    expect(received.templateImageOverrides).toEqual(persisted?.image_overrides);
    await writeFile(mappingPath, "{}");
    await render(["--state", state.state_path, "--studio-cover-template", "", "--template-images-file", mappingPath]);
    received = JSON.parse(await readFile(join(state.asset_path, "received.json"), "utf8"));
    expect(received.studioTemplates).toEqual({ content: "正文模板" });
    expect(received.templateImageOverrides).toEqual({});
    expect((await readState(state.state_path)).content_review.status).toBe("passed");
    await writeFile(mappingPath, JSON.stringify({ cover: { background: 123 } }));
    await expect(render(["--state", state.state_path, "--template-images-file", mappingPath])).rejects.toThrow();
  });

  test("config import merges one theme and schema works even with a broken config file", async () => {
    const path = join(workspace, "import.json");
    await writeFile(path, JSON.stringify({ render: { cover: { themes: { business: { colors: { accent: "#135790" } } } } } }));
    await configCommand(["--import", path]);
    expect(loadConfig().render.cover.themes.business!.colors.accent).toBe("#135790");
    expect(Object.keys(loadConfig().render.cover.themes)).toHaveLength(10);
    await writeFile(process.env.ZZHUB_PIPELINE_CONFIG!, "invalid json");
    await configCommand(["--schema", "--key", "render.cover"]);
    expect(output.mock.calls.at(-1)?.[0]).toContain('"defaultTheme"');
  });

  test("rejects plugin pages that violate task constraints before marking render done", async () => {
    const state = await preparedTask();
    state.route = resolveFullRoute("发公众号贴图", { account: "default", contentForm: "newspic", targets: ["wechat"] });
    state.intent.content_form = "newspic";
    state.intent.newspic_render = normalizeNewspicRenderSpec({ pagination_mode: "multi", min_pages: 3, max_pages: 4 });
    await writeState(state.state_path, state);
    const pluginPath = join(workspace, "plugin.mjs");
    await writeFile(pluginPath, 'import {writeFile} from "node:fs/promises"; import {join} from "node:path"; export default {name:"bad-pagination",async render(input){const path=join(input.state.asset_path,"page.png");await writeFile(path,"stub");return {assets:[{kind:"page",route:input.route,index:1,path}],pageCount:1,pages:[{page:1,imageCount:0,imageSources:[]}]}}};');
    const config = loadConfig();
    config.plugins.imageRenderer = pluginPath;
    saveConfig(config);
    await expect(render(["--state", state.state_path])).rejects.toThrow("at least 3");
    expect((await readState(state.state_path)).phase.render.status).not.toBe("done");
    expect((await readState(state.state_path)).artifacts.render_version).toBe(0);
    expect((await readState(state.state_path)).mode).toBe("failed");
    expect((await getTaskByStatePath(state.state_path)).next_action.action).toBe("reset-or-repair");
  });

  test("plugin process exit stops the task and releases the lock for explicit retry", async () => {
    const state = await preparedTask();
    const pluginPath = join(workspace, "crash-plugin.mjs");
    await writeFile(pluginPath, 'export default {name:"crash-plugin",render(){process.exit(42)}};');
    const config = loadConfig();
    config.plugins.imageRenderer = pluginPath;
    saveConfig(config);
    await expect(render(["--state", state.state_path])).rejects.toThrow("任务已停止");
    const failed = await readState(state.state_path);
    expect(failed.phase.render.status).toBe("failed");
    expect(failed.phase.render.error).toContain("插件进程退出");
    expect(failed.content_review.status).toBe("passed");
    const { reset } = await import("./reset");
    await reset(["--state", state.state_path, "--mode", "render"]);
    config.plugins.imageRenderer = join(workspace, "repaired-plugin.mjs");
    await writeFile(config.plugins.imageRenderer, 'import {writeFile} from "node:fs/promises"; import {join} from "node:path"; export default {name:"repaired",async render(input){const path=join(input.state.asset_path,"cover.png");await writeFile(path,"stub");return {assets:[{kind:"cover",route:input.route,path}],pageCount:1,pages:[]}}};');
    saveConfig(config);
    await render(["--state", state.state_path]);
    expect((await readState(state.state_path)).phase.render.status).toBe("done");
  });
});
