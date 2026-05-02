import { parseArgs, optionalArg } from "../args";
import { printResult, renderConfig } from "../output";
import {
  configSummary,
  getConfigValue,
  loadConfig,
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
`.trim());
    return;
  }

  const key = optionalArg(parsed, "key");
  const value = optionalArg(parsed, "value");
  const forceJson = parsed.json === true;

  const config = loadConfig();

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
