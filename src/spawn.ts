/**
 * spawn — Runtime-neutral child process wrapper.
 *
 * Why: zzhub-pipeline may be invoked from Bun, Node, or an agent exec
 * sandbox whose PATH differs from the user's interactive shell. We avoid
 * Bun-specific process APIs here so nested commands still work when the
 * outer runtime is not Bun.
 */

import { existsSync } from "fs";
import { homedir } from "os";
import { delimiter } from "path";
import { join } from "path";
import { spawnSync as nodeSpawnSync, type SpawnSyncReturns } from "child_process";

/** Directories to ensure are present on PATH */
const EXTRA_PATH_DIRS = [
  join(homedir(), ".bun", "bin"),
  "/opt/homebrew/bin",
  "/usr/local/bin",
];

/** Build an env object with enriched PATH */
function enrichedEnv(): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  const currentPath = env.PATH ?? "";

  const missing = EXTRA_PATH_DIRS.filter(
    (dir) => !currentPath.split(":").includes(dir),
  );

  if (missing.length > 0) {
    env.PATH = [...missing, currentPath].join(":");
  }

  return env;
}

export interface SpawnOptions {
  cwd?: string;
}

export interface SpawnResult {
  exitCode: number | null;
  error?: Error;
}

function findOnPath(binary: string, envPath: string): string | null {
  for (const dir of envPath.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, binary);
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function resolveBunBinary(): string {
  const env = enrichedEnv();
  const candidates = [
    process.env.BUN_BIN,
    process.execPath?.endsWith("/bun") ? process.execPath : null,
    join(homedir(), ".bun", "bin", "bun"),
    "/opt/homebrew/bin/bun",
    "/usr/local/bin/bun",
    env.PATH ? findOnPath("bun", env.PATH) : null,
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    "Unable to locate bun binary. Set BUN_BIN or ensure bun is installed in a standard location.",
  );
}

function normalizeResult(result: SpawnSyncReturns<Buffer>): SpawnResult {
  return {
    exitCode: result.status,
    ...(result.error ? { error: result.error } : {}),
  };
}

/**
 * Run a command synchronously with enriched PATH.
 * stdout and stderr are inherited (printed to terminal).
 *
 * Returns a normalized spawn result.
 */
export function spawnSync(cmd: string[], opts?: SpawnOptions): SpawnResult {
  const [binary, ...args] = cmd;
  const result = nodeSpawnSync(binary, args, {
    stdio: "inherit",
    env: enrichedEnv(),
    ...(opts?.cwd ? { cwd: opts.cwd } : {}),
  });

  return normalizeResult(result);
}
