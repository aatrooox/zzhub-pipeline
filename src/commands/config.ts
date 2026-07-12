import { readFileSync } from "fs";
import { parseArgs, optionalArg, flagArg } from "../args";
import { printResult, renderConfig } from "../output";
import {
  configSummary,
  getConfigValue,
  loadConfig,
  PipelineConfigSchema,
  redactConfig,
  redactConfigValue,
  saveConfig,
  setConfigValue,
} from "../config";

export async function configCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline config [options]

Options:
  --key        Dot-path key to read or update
  --value      New value for --key
  --json       Force JSON output for scalar reads
  --export     Print full config as JSON (secrets redacted; use --raw to show all)
  --import     Path to a JSON file to merge into current config
  --raw        Show secrets unredacted (use with --export)
`.trim());
    return;
  }

  const config = loadConfig();

  // --export
  if (flagArg(parsed, "export")) {
    const raw = flagArg(parsed, "raw");
    const output = raw ? config : redactConfig(config);
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // --import
  const importPath = optionalArg(parsed, "import");
  if (importPath) {
    let imported: unknown;
    try {
      imported = JSON.parse(readFileSync(importPath, "utf-8"));
    } catch (err) {
      throw new Error(`Failed to read import file: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Merge: existing values win, imported fills gaps
    const importedObj = (typeof imported === "object" && imported !== null ? imported : {}) as Record<string, unknown>;
    const mergedWx = {
      ...config.wx,
      ...(importedObj.wx as Record<string, unknown> ?? {}),
      accounts: {
        ...config.wx.accounts,
        ...((importedObj.wx as Record<string, unknown>)?.accounts as Record<string, unknown> ?? {}),
      },
    };
    const raw = {
      paths: { ...config.paths, ...(importedObj.paths ?? {}) },
      services: { ...config.services, ...(importedObj.services ?? {}) },
      commands: { ...config.commands, ...(importedObj.commands ?? {}) },
      wx: mergedWx,
      cos: { ...config.cos, ...(importedObj.cos ?? {}) },
      plugins: { ...config.plugins, ...(importedObj.plugins ?? {}) },
      imgx: { ...config.imgx, ...(importedObj.imgx ?? {}) },
    };
    // Validate through Zod schema — strips unknown fields, applies defaults
    const merged = PipelineConfigSchema.parse(raw);

    saveConfig(merged);
    printResult(configSummary(merged), renderConfig);
    return;
  }

  // --key / --value
  const key = optionalArg(parsed, "key");
  const value = optionalArg(parsed, "value");
  const forceJson = flagArg(parsed, "json");

  if (!key) {
    printResult(configSummary(config), renderConfig);
    return;
  }

  if (value === undefined) {
    const currentValue = getConfigValue(config, key);
    const redactedValue = redactConfigValue(key, currentValue);
    if (forceJson || typeof currentValue !== "string") {
      printResult({ key, value: redactedValue }, renderConfig);
      return;
    }
    printResult(String(redactedValue), renderConfig);
    return;
  }

  const nextConfig = setConfigValue(config, key, value);
  saveConfig(nextConfig);
  printResult(
    { key, value: redactConfigValue(key, getConfigValue(nextConfig, key)) },
    renderConfig,
  );
}
