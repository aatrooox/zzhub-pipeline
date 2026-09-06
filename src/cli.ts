#!/usr/bin/env bun

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getDailyLogPath, runWithCommandLog } from "./logger";
import { formatUsage, getCommandRegistry } from "./plugins";
import { outcomeExitCode } from "./command-outcome";

const COMMANDS = getCommandRegistry();

function printVersion() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const pkgPath = join(scriptDir, "..", "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  console.log(pkg.version);
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "--help" || cmd === "-h") {
    printUsage();
    process.exit(0);
  }

  if (cmd === "--version" || cmd === "-V") {
    printVersion();
    process.exit(0);
  }

  const command = COMMANDS[cmd];
  if (!command) {
    console.error(`Unknown command: ${cmd}`);
    printUsage();
    process.exit(1);
  }

  try {
    // monitor 输出包含本机认证令牌，不能经过日志复制或监控自身。
    const outcome = cmd === "monitor"
      ? await command.handler(args.slice(1))
      : await runWithCommandLog(cmd, args.slice(1), () => command.handler(args.slice(1)));
    if (outcome) {
      process.exitCode = outcomeExitCode(outcome);
      for (const error of outcome.errors ?? []) console.error(`[zzhub-pipeline ${cmd}] ${error.code}: ${error.message}`);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[zzhub-pipeline ${cmd}] Error: ${msg}`);
    console.error(`[zzhub-pipeline ${cmd}] Full log: ${getDailyLogPath()}`);
    process.exitCode = 1;
  }
}

function printUsage() {
  console.log(formatUsage());
}

main();
