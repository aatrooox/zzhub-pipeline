export type ParsedArgs = {
  flags: Map<string, string[]>;
  booleans: Set<string>;
};

export function parseArgs(argv: string[]): ParsedArgs {
  const flags = new Map<string, string[]>();
  const booleans = new Set<string>();

  for (let index = 0; index < argv.length; index++) {
    const token = argv[index];
    if (!token?.startsWith("--")) continue;

    const name = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) {
      booleans.add(name);
      continue;
    }

    const current = flags.get(name) ?? [];
    current.push(next);
    flags.set(name, current);
    index += 1;
  }

  return { flags, booleans };
}

export function getArg(parsed: ParsedArgs, name: string, fallback = ""): string {
  const values = parsed.flags.get(name);
  if (values === undefined || values.length === 0) return fallback;
  return values[values.length - 1] ?? fallback;
}

export function getArgs(parsed: ParsedArgs, name: string): string[] {
  return parsed.flags.get(name) ?? [];
}

export function hasFlag(parsed: ParsedArgs, name: string): boolean {
  return parsed.booleans.has(name);
}

export function requireArg(parsed: ParsedArgs, name: string): string {
  const value = getArg(parsed, name);
  if (value.length === 0) {
    throw new Error(`Missing required argument --${name}`);
  }
  return value;
}

export function getIntArg(parsed: ParsedArgs, name: string, fallback: number): number {
  const raw = getArg(parsed, name);
  if (raw.length === 0) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}
