import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { resolveImageRenderer, resolveMarkdownRenderer, runPluginDoctorChecks } from "./adapter-loader";
import { PluginImageOutputSchema, runExternalPlugin } from "./plugin-runtime";
import { PipelineConfigSchema } from "./schema/config";
import { getPipelineConfigPath } from "./config";
import { defaultState } from "./state";

let directory: string;
let previousTimeout: string | undefined;
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "zzp-plugin-boundary-"));
  previousTimeout = process.env.ZZHUB_PIPELINE_PLUGIN_TIMEOUT_MS;
  process.env.ZZHUB_PIPELINE_PLUGIN_TIMEOUT_MS = "1500";
});
afterEach(async () => {
  if (previousTimeout === undefined) delete process.env.ZZHUB_PIPELINE_PLUGIN_TIMEOUT_MS;
  else process.env.ZZHUB_PIPELINE_PLUGIN_TIMEOUT_MS = previousTimeout;
  await rm(directory, { recursive: true, force: true });
});

/** 只生成当前测试使用的插件，测试后删除。 */
async function fixture(renderBody: string, extra = "") {
  const path = join(directory, `${crypto.randomUUID()}.mjs`);
  await writeFile(path, `export default {name:"boundary-test",${extra}async render(input){${renderBody}}};`);
  return path;
}
function input() {
  return { state: defaultState(), route: "wechat-article" as const, title: "test", bodyText: "body", outputDir: directory };
}

test("external plugins cannot mutate caller state and progress remains observable", async () => {
  const plugin = await resolveImageRenderer(PipelineConfigSchema.parse({ plugins: { imageRenderer: await fixture(`
    console.log("plugin diagnostics do not contaminate CLI JSON");
    input.state.mode="done";
    input.onProgress({stage:"render.plugin",current:1,total:1});
    return {assets:[],pageCount:0,pages:[]};
  `) } }));
  const request = input();
  const progress: string[] = [];
  expect(await plugin.render({ ...request, onProgress: item => { progress.push(item.stage); throw new Error("observer failed"); } })).toEqual({ assets: [], pageCount: 0, pages: [] });
  expect(request.state.mode).not.toBe("done");
  expect(progress).toEqual(["render.plugin"]);
});

test("Studio uses its shared data directory and local methods without service authentication", async () => {
  const variables = ["TYPESET_DATA_DIR", "TYPESET_STUDIO_URL", "TYPESET_ADMIN_KEY"] as const;
  const previous = Object.fromEntries(variables.map(key => [key, process.env[key]]));
  try {
    delete process.env.TYPESET_DATA_DIR;
    process.env.TYPESET_STUDIO_URL = "https://standalone-studio.example.com";
    process.env.TYPESET_ADMIN_KEY = "standalone-service-key";
    const pluginPath = join(directory, "studio-env.mjs");
    await writeFile(pluginPath, `
      const values = [process.env.TYPESET_DATA_DIR, process.env.TYPESET_STUDIO_URL, process.env.TYPESET_ADMIN_KEY];
      export default {
        name: "typeset-studio",
        async doctor() { return [{name:"studio-env", ok:true, detail:values}]; },
        async render() { return {assets:[], pageCount:1, pages:[{page:1, imageCount:0, imageSources:values}]}; },
      };
    `);
    const config = PipelineConfigSchema.parse({ plugins: {
      imageRenderer: { module: pluginPath, options: { dataDir: "studio-data" } },
    } });
    const expected = [resolve(dirname(getPipelineConfigPath()), "studio-data"), "", ""];
    const plugin = await resolveImageRenderer(config);
    expect((await plugin.doctor!())[0].detail).toEqual(expected);
    expect((await plugin.render(input())).pages[0].imageSources).toEqual(expected);
    expect(process.env.TYPESET_DATA_DIR).toBeUndefined();
    expect(process.env.TYPESET_STUDIO_URL).toBe("https://standalone-studio.example.com");
    expect(process.env.TYPESET_ADMIN_KEY).toBe("standalone-service-key");

    process.env.TYPESET_DATA_DIR = directory;
    const overridden = await resolveImageRenderer(config);
    expect((await overridden.render(input())).pages[0].imageSources).toEqual([directory, "", ""]);
    await expect(resolveImageRenderer(PipelineConfigSchema.parse({ plugins: {
      imageRenderer: { module: pluginPath, options: { dataDir: 42 } },
    } }))).rejects.toThrow("options.dataDir");
  } finally {
    for (const key of variables) {
      if (previous[key] === undefined) delete process.env[key];
      else process.env[key] = previous[key];
    }
  }
});

test("image plugins receive their own options in doctor and render without mutating config", async () => {
  const pluginPath = await fixture(`
    const label = arguments[1].rules.label;
    arguments[1].rules.label = "changed";
    input.onProgress({stage:"render.options"});
    return {assets:[], pageCount:1, pages:[{page:1, imageCount:0, imageSources:[label]}]};
  `, 'async doctor(options){return [{name:"options", ok:true, detail:options}]},');
  const config = PipelineConfigSchema.parse({ plugins: {
    imageRenderer: { module: pluginPath, options: { rules: { label: "image-rule" }, enabled: true } },
  } });
  const plugin = await resolveImageRenderer(config);
  const progress: string[] = [];
  expect((await plugin.doctor!())[0].detail).toEqual({ rules: { label: "image-rule" }, enabled: true });
  expect((await plugin.render({ ...input(), onProgress: item => progress.push(item.stage) })).pages[0].imageSources).toEqual(["image-rule"]);
  expect(config.plugins.imageRenderer).toEqual({ module: pluginPath, options: { rules: { label: "image-rule" }, enabled: true } });
  expect(progress).toEqual(["render.options"]);
});

test("markdown plugins receive their own options in doctor and render", async () => {
  const pluginPath = await fixture('return {html:arguments[1].html, htmlPath:input.outPath, account:input.account, previewStyle:"options"}',
    'async doctor(options){return [{name:"options", ok:true, detail:options}]},');
  const options = { html: "<p>configured</p>", rules: { numbered: false } };
  const plugin = await resolveMarkdownRenderer(PipelineConfigSchema.parse({ plugins: {
    markdownRenderer: { module: pluginPath, options },
  } }));
  expect((await plugin.doctor!())[0].detail).toEqual(options);
  expect((await plugin.render({ markdownPath: join(directory, "post.md"), outPath: join(directory, "post.html"), account: "default" })).html).toBe(options.html);
});

test("reports thrown errors, process exits, and invalid image results without escaping the parent", async () => {
  for (const [body, code] of [
    ['throw new Error("bad template")', "PLUGIN_EXECUTION_FAILED"],
    ['process.exit(23)', "PLUGIN_PROCESS_EXIT"],
    ['return null', "PLUGIN_INVALID_RESULT"],
    ['return {assets:[{path:42}],pageCount:1,pages:[]}', "PLUGIN_INVALID_RESULT"],
  ]) {
    const specifier = await fixture(body!);
    await expect(runExternalPlugin(specifier, "render", PluginImageOutputSchema, input())).rejects.toMatchObject({ code });
  }
}, 10_000);

test("terminates synchronous loops and unresolved async calls, including top-level plugin loading", async () => {
  for (const body of ['while(true) {}', 'await new Promise(() => {})', 'while(true){input.onProgress({stage:"render.loop"})}']) {
    const specifier = await fixture(body);
    await expect(runExternalPlugin(specifier, "render", PluginImageOutputSchema, input())).rejects.toMatchObject({ code: "PLUGIN_TIMEOUT" });
  }
  const topLevel = join(directory, "import-loop.mjs");
  await writeFile(topLevel, "while(true){}; export default {name:'loop',render(){}};");
  await expect(resolveImageRenderer(PipelineConfigSchema.parse({ plugins: { imageRenderer: topLevel } }))).rejects.toMatchObject({ code: "PLUGIN_TIMEOUT" });
}, 10_000);

test("timeout kills the process before late writes can modify rendered files", async () => {
  const lateFile = join(directory, "late.txt");
  const specifier = await fixture(`await Bun.sleep(2000); await Bun.write(${JSON.stringify(lateFile)}, "late output"); return {assets:[],pageCount:0,pages:[]};`);
  await expect(runExternalPlugin(specifier, "render", PluginImageOutputSchema, input())).rejects.toMatchObject({ code: "PLUGIN_TIMEOUT" });
  await Bun.sleep(700);
  await expect(readFile(lateFile)).rejects.toMatchObject({ code: "ENOENT" });
});

test.skipIf(process.platform === "win32")("timeout also terminates subprocesses started by the plugin", async () => {
  const lateFile = join(directory, "descendant.txt");
  const script = `await Bun.sleep(2000); await Bun.write(${JSON.stringify(lateFile)}, "late descendant output");`;
  const specifier = await fixture(`Bun.spawn([process.execPath,"-e",${JSON.stringify(script)}],{stdout:"ignore",stderr:"ignore"}); await new Promise(() => {});`);
  await expect(runExternalPlugin(specifier, "render", PluginImageOutputSchema, input())).rejects.toMatchObject({ code: "PLUGIN_TIMEOUT" });
  await Bun.sleep(900);
  await expect(readFile(lateFile)).rejects.toMatchObject({ code: "ENOENT" });
});

test("doctor rejects bad checks and times out without blocking the other renderer", async () => {
  const broken = await fixture("return null", "async doctor(){return null},");
  const hung = await fixture("return null", "async doctor(){while(true){}},");
  for (const specifier of [broken, hung]) {
    const checks = await runPluginDoctorChecks(PipelineConfigSchema.parse({ plugins: { imageRenderer: specifier } }));
    expect(checks.find(check => check.name === "image-renderer")).toMatchObject({ ok: false, message: expect.stringContaining("插件") });
    expect(checks.some(check => check.name === "chrome")).toBe(true);
  }
}, 10_000);

test("markdown renderer validates HTML before callers can publish it", async () => {
  const invalid = await fixture("return {html:null,htmlPath:input.outPath,account:input.account,previewStyle:'custom'}");
  const valid = await fixture("return {html:'<p>ok</p>',htmlPath:input.outPath,account:input.account,previewStyle:'custom'}");
  const request = { markdownPath: join(directory, "post.md"), outPath: join(directory, "post.html"), account: "default" };
  const badPlugin = await resolveMarkdownRenderer(PipelineConfigSchema.parse({ plugins: { markdownRenderer: invalid } }));
  await expect(badPlugin.render(request)).rejects.toMatchObject({ code: "PLUGIN_INVALID_RESULT" });
  const goodPlugin = await resolveMarkdownRenderer(PipelineConfigSchema.parse({ plugins: { markdownRenderer: valid } }));
  expect((await goodPlugin.render(request)).html).toBe("<p>ok</p>");
});

test("missing and malformed plugin exports produce actionable load errors", async () => {
  const missing = join(directory, "missing.mjs");
  await expect(resolveImageRenderer(PipelineConfigSchema.parse({ plugins: { imageRenderer: missing } }))).rejects.toThrow("zzp doctor");
  const invalid = join(directory, "invalid.mjs");
  await writeFile(invalid, "export default {name:'invalid',render(){},doctor:42};");
  await expect(resolveImageRenderer(PipelineConfigSchema.parse({ plugins: { imageRenderer: invalid } }))).rejects.toThrow("可选的 doctor 函数");
});

test("doctor CLI reports plugin exits and timeouts without crashing", async () => {
  for (const behavior of ["process.exit(42)", "while(true){}"]) {
    const configPath = join(directory, "config.json");
    const pluginPath = await fixture("return null", `doctor(){${behavior}},`);
    await writeFile(configPath, JSON.stringify(PipelineConfigSchema.parse({ plugins: { imageRenderer: pluginPath } })));
    const child = Bun.spawn([process.execPath, join(import.meta.dir, "cli.ts"), "doctor"], {
      env: { ...process.env, ZZHUB_PIPELINE_CONFIG: configPath, ZZHUB_PIPELINE_MONITOR: "0", NO_COLOR: "1", ZZHUB_PIPELINE_LOG_DIR: join(directory, "logs") },
      stdout: "pipe", stderr: "pipe", timeout: 6000, killSignal: "SIGKILL",
    });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    // doctor 保持原契约：命令完成，失败项通过 plugin_checks 明确表达。
    expect(code).toBe(0);
    const result = JSON.parse(stdout);
    expect(result.plugin_checks.find((check: { name: string }) => check.name === "image-renderer")).toMatchObject({ ok: false, message: expect.stringContaining("PLUGIN_") });
    expect(stderr).not.toContain("unhandled");
  }
}, 15_000);

test("wechat-export CLI returns a clear failure instead of crashing or hanging on a bad plugin", async () => {
  for (const behavior of ["process.exit(42)", "while(true){}", "return null"]) {
    const configPath = join(directory, "export-config.json");
    const pluginPath = await fixture(behavior);
    await writeFile(configPath, JSON.stringify(PipelineConfigSchema.parse({ plugins: { markdownRenderer: pluginPath } })));
    const child = Bun.spawn([process.execPath, join(import.meta.dir, "cli.ts"), "wechat-export", "--markdown", join(directory, "post.md"), "--out", join(directory, "post.html"), "--no-preview"], {
      env: { ...process.env, ZZHUB_PIPELINE_CONFIG: configPath, ZZHUB_PIPELINE_MONITOR: "0", NO_COLOR: "1", ZZHUB_PIPELINE_LOG_DIR: join(directory, "logs") },
      stdout: "pipe", stderr: "pipe", timeout: 6000, killSignal: "SIGKILL",
    });
    const [stdout, stderr, code] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    expect(code).toBe(1);
    expect(stdout).toBe("");
    expect(stderr).toContain("PLUGIN_");
    expect(stderr).toContain("本次未自动重试");
    expect(stderr).not.toContain("unhandled");
  }
}, 15_000);
