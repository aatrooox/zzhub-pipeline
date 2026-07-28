#!/usr/bin/env bun

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { getDailyLogPath, runWithCommandLog } from "./logger";
import { formatUsage, getCommandRegistry } from "./plugins";

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
    await runWithCommandLog(cmd, args.slice(1), async () => {
      await command.handler(args.slice(1));
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[zzhub-pipeline ${cmd}] Error: ${msg}`);
    console.error(`[zzhub-pipeline ${cmd}] Full log: ${getDailyLogPath()}`);
    process.exit(1);
  }
}

function printUsage() {
  console.log(formatUsage());
}

main();
