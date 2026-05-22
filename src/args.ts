/**
 * args.ts — Minimal argument parser for CLI subcommands.
 * Uses Bun-native parseArgs when available, falls back to manual parsing.
 */

/**
 * Parse CLI arguments into a key-value map.
 * Supports: --key value, --key=value, --flag (boolean true)
 */
export function parseArgs(args: string[]): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = { _: "" };
  let i = 0;
  const positional: string[] = [];

  const assignArg = (rawKey: string, value: string | boolean) => {
    const normalizedKey = rawKey.replaceAll("_", "-");
    result[normalizedKey] = value;
    if (normalizedKey !== rawKey) {
      result[rawKey] = value;
    }
  };

  while (i < args.length) {
    const arg = args[i];

    if (arg === "--help" || arg === "-h") {
      result.help = true;
      i++;
      continue;
    }

    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        // --key=value
        assignArg(arg.slice(2, eqIdx), arg.slice(eqIdx + 1));
      } else if (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        // --key value
        assignArg(arg.slice(2), args[i + 1]);
        i++;
      } else {
        // --flag (boolean)
        assignArg(arg.slice(2), true);
      }
    } else {
      positional.push(arg);
    }
    i++;
  }

  result._ = JSON.stringify(positional);
  return result;
}

/**
 * Require a string argument, throw if missing.
 */
export function requireArg(
  parsed: Record<string, string | boolean>,
  key: string,
  description: string,
): string {
  const val = parsed[key];
  if (val === undefined || typeof val === "boolean") {
    throw new Error(`Missing required argument: --${key} (${description})`);
  }
  return val;
}

/**
 * Get optional string argument.
 */
export function optionalArg(
  parsed: Record<string, string | boolean>,
  key: string,
): string | undefined {
  const val = parsed[key];
  if (val === undefined || typeof val === "boolean") return undefined;
  return val;
}

/**
 * Get boolean flag.
 */
export function flagArg(
  parsed: Record<string, string | boolean>,
  key: string,
): boolean {
  return parsed[key] === true || parsed[key] === "true";
}
