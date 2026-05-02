#!/usr/bin/env bun

import { formatUsage, getCommandRegistry } from "./plugins";

const COMMANDS = getCommandRegistry();

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === "--help" || cmd === "-h") {
    printUsage();
    process.exit(0);
  }

  const command = COMMANDS[cmd];
  if (!command) {
    console.error(`Unknown command: ${cmd}`);
    printUsage();
    process.exit(1);
  }

  try {
    await command.handler(args.slice(1));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[zzhub-pipeline ${cmd}] Error: ${msg}`);
    process.exit(1);
  }
}

function printUsage() {
  console.log(formatUsage());
}

main();
