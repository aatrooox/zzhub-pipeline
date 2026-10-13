import { expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configCommand } from "../commands/config";
import { loadConfig, normalizeConfig, saveConfig, setConfigValue } from "../config";
import { PipelineConfigSchema } from "./config";

test("plugin entries accept strings, module/options, and builtin defaults", () => {
  expect(PipelineConfigSchema.parse({}).plugins).toEqual({ imageRenderer: null, markdownRenderer: null });
  const config = PipelineConfigSchema.parse({ plugins: {
    imageRenderer: "@akairos/typeset-studio/adapter",
    markdownRenderer: { module: " ./renderer.ts " },
  } });
  expect(config.plugins.imageRenderer).toBe("@akairos/typeset-studio/adapter");
  expect(config.plugins.markdownRenderer).toEqual({ module: "./renderer.ts", options: {} });
  for (const entry of [{ module: " " }, { options: {} }, { module: "plugin", options: [] }, { module: "plugin", options: null }]) {
    expect(PipelineConfigSchema.safeParse({ plugins: { imageRenderer: entry } }).success).toBe(false);
  }
});

test("plugin options preserve nested rules and support dot-path updates", () => {
  const original = normalizeConfig({ plugins: {
    imageRenderer: { module: "@akairos/typeset-studio/adapter", options: { dataDir: "./studio", rules: { enabled: false, values: [1, "two"] } } },
  } });
  const updated = setConfigValue(original, "plugins.imageRenderer.options.dataDir", "./new-studio");
  expect(updated.plugins.imageRenderer).toEqual({
    module: "@akairos/typeset-studio/adapter", options: { dataDir: "./new-studio", rules: { enabled: false, values: [1, "two"] } },
  });
  expect(setConfigValue(updated, "plugins.imageRenderer", "null").plugins.imageRenderer).toBeNull();
});

test("config CLI imports and persists module/options plugin entries", async () => {
  const workspace = await mkdtemp(join(tmpdir(), "zzp-studio-config-"));
  const previousConfig = process.env.ZZHUB_PIPELINE_CONFIG;
  const output = spyOn(console, "log").mockImplementation(() => {});
  try {
    process.env.ZZHUB_PIPELINE_CONFIG = join(workspace, "config.json");
    saveConfig(normalizeConfig({ plugins: {
      imageRenderer: "@akairos/typeset-studio/adapter",
    } }));
    const importPath = join(workspace, "import.json");
    const entry = { module: "@akairos/typeset-studio/adapter", options: { dataDir: "./studio", rules: { label: "cover" } } };
    await writeFile(importPath, JSON.stringify({ plugins: { imageRenderer: entry } }));
    await configCommand(["--import", importPath]);
    expect(loadConfig().plugins.imageRenderer).toEqual(entry);
    expect(JSON.parse(await readFile(process.env.ZZHUB_PIPELINE_CONFIG, "utf8")).plugins.imageRenderer).toEqual(entry);
    await configCommand(["--key", "plugins.imageRenderer.options.dataDir", "--value", "./updated-studio"]);
    expect(loadConfig().plugins.imageRenderer).toEqual({ ...entry, options: { ...entry.options, dataDir: "./updated-studio" } });
  } finally {
    output.mockRestore();
    if (previousConfig === undefined) delete process.env.ZZHUB_PIPELINE_CONFIG;
    else process.env.ZZHUB_PIPELINE_CONFIG = previousConfig;
    await rm(workspace, { recursive: true, force: true });
  }
});
