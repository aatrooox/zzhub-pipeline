import { readFileSync } from "fs";
import { parseArgs, optionalArg, flagArg } from "../args";
import { printResult, renderConfig } from "../output";
import {
  configSummary,
  getConfigValue,
  loadConfig,
  normalizeConfig,
  redactConfig,
  redactConfigValue,
  saveConfig,
  setConfigValue,
} from "../config";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

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

Examples:
  zzhub-pipeline config --key wx.defaultAccount
  zzhub-pipeline config --key wx.accounts.default.name --value "大号（早早集市）"
  zzhub-pipeline config --export
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

    // Merge: top-level shallow; wx.accounts deep-merge per key so partial imports
    // keep existing fields (e.g. display `name`) unless overridden.
    const importedObj = isPlainObject(imported) ? imported : {};
    const importedWx = isPlainObject(importedObj.wx) ? importedObj.wx : {};
    const importedAccounts = isPlainObject(importedWx.accounts) ? importedWx.accounts : {};
    const mergedAccounts: Record<string, unknown> = { ...config.wx.accounts };
    for (const [key, value] of Object.entries(importedAccounts)) {
      const accountKey = key.trim();
      if (!accountKey) continue;
      const existing = isPlainObject(mergedAccounts[accountKey])
        ? mergedAccounts[accountKey]
        : {};
      const incoming = isPlainObject(value) ? value : {};
      mergedAccounts[accountKey] = { ...existing, ...incoming };
    }
    const raw = {
      paths: { ...config.paths, ...(isPlainObject(importedObj.paths) ? importedObj.paths : {}) },
      services: {
        ...config.services,
        ...(isPlainObject(importedObj.services) ? importedObj.services : {}),
      },
      commands: {
        ...config.commands,
        ...(isPlainObject(importedObj.commands) ? importedObj.commands : {}),
      },
      wx: {
        ...config.wx,
        ...importedWx,
        accounts: mergedAccounts,
      },
      cos: { ...config.cos, ...(isPlainObject(importedObj.cos) ? importedObj.cos : {}) },
      plugins: {
        ...config.plugins,
        ...(isPlainObject(importedObj.plugins) ? importedObj.plugins : {}),
      },
      imgx: { ...config.imgx, ...(isPlainObject(importedObj.imgx) ? importedObj.imgx : {}) },
    };
    // Soft-fill known account display names + Zod defaults / strip unknowns
    const merged = normalizeConfig(raw);

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
