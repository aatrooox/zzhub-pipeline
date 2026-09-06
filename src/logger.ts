/**
 * Daily rolling file logger for zzhub-pipeline CLI commands.
 *
 * Layout (platform-aware, same base as wechat-preview config dir):
 *   macOS:  ~/Library/Application Support/zzhub-pipeline/logs/pipeline-YYYY-MM-DD.log
 *   Linux:  ~/.config/zzhub-pipeline/logs/pipeline-YYYY-MM-DD.log
 *   Windows: %APPDATA%/zzhub-pipeline/logs/pipeline-YYYY-MM-DD.log
 *
 * Override with ZZHUB_PIPELINE_LOG_DIR.
 */

import { appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import { outcomeExitCode, type CommandOutcome } from "./command-outcome";
import { observeCommand, reportLog } from "./monitor/recorder";

const APP_DIR = "zzhub-pipeline";
const LOG_DIR_NAME = "logs";
const LOG_PREFIX = "pipeline-";
const LOG_SUFFIX = ".log";
/** Keep about two weeks of daily files. */
const LOG_RETENTION_DAYS = 14;

function getBaseConfigDir(): string {
  const home = homedir();
  const currentPlatform = platform();

  if (currentPlatform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) return join(appData, APP_DIR);
    return join(home, "AppData", "Roaming", APP_DIR);
  }

  if (currentPlatform === "darwin") {
    return join(home, "Library", "Application Support", APP_DIR);
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome && xdgConfigHome.trim().length > 0) {
    return join(xdgConfigHome, APP_DIR);
  }

  return join(home, ".config", APP_DIR);
}

export function getLogDir(): string {
  const override = process.env.ZZHUB_PIPELINE_LOG_DIR?.trim();
  if (override) return override;
  return join(getBaseConfigDir(), LOG_DIR_NAME);
}

function formatDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function getDailyLogPath(date: Date = new Date()): string {
  return join(getLogDir(), `${LOG_PREFIX}${formatDateKey(date)}${LOG_SUFFIX}`);
}

function ensureLogDir(): string {
  const dir = getLogDir();
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function pruneOldLogs(dir: string): void {
  try {
    const cutoff = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
    for (const name of readdirSync(dir)) {
      if (!name.startsWith(LOG_PREFIX) || !name.endsWith(LOG_SUFFIX)) continue;
      const key = name.slice(LOG_PREFIX.length, -LOG_SUFFIX.length);
      // YYYY-MM-DD
      if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) continue;
      const stamp = Date.parse(`${key}T00:00:00`);
      if (!Number.isFinite(stamp) || stamp >= cutoff) continue;
      unlinkSync(join(dir, name));
    }
  } catch {
    // pruning is best-effort
  }
}

export function appendLogLine(message: string, date: Date = new Date()): void {
  try {
    const dir = ensureLogDir();
    pruneOldLogs(dir);
    const path = getDailyLogPath(date);
    const line = message.endsWith("\n") ? message : `${message}\n`;
    appendFileSync(path, line, "utf-8");
  } catch {
    // never break CLI for logging failures
  }
}

function formatError(err: unknown): string {
  if (err instanceof Error) {
    return `${err.name}: ${err.message}${err.stack ? `\n${err.stack}` : ""}`;
  }
  return String(err);
}

type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug";

function installConsoleTee(write: (chunk: string) => void): () => void {
  const methods: ConsoleMethod[] = ["log", "info", "warn", "error", "debug"];
  const originals = new Map<ConsoleMethod, (...args: unknown[]) => void>();

  for (const method of methods) {
    const original = console[method].bind(console);
    originals.set(method, original);
    console[method] = (...args: unknown[]) => {
      original(...args);
      try {
        const text = args
          .map((arg) => {
            if (typeof arg === "string") return arg;
            if (arg instanceof Error) return formatError(arg);
            try {
              return JSON.stringify(arg);
            } catch {
              return String(arg);
            }
          })
          .join(" ");
        write(`[console.${method}] ${text}`);
        // stdout 包含完整业务 JSON；只采集诊断通道，避免正文或配置进入监控。
        if (method !== "log") reportLog(method, text);
      } catch {
        // ignore
      }
    };
  }

  return () => {
    for (const method of methods) {
      const original = originals.get(method);
      if (original) console[method] = original as typeof console.log;
    }
  };
}

/**
 * Run a CLI command with daily-file logging.
 * Captures console output, start/end markers, duration, and full error stacks.
 */
export async function runWithCommandLog(
  command: string,
  args: string[],
  handler: () => Promise<void | CommandOutcome>,
): Promise<CommandOutcome> {
  return observeCommand(command, async () => {
    const startedAt = new Date();
    const startedMs = Date.now();
    const logPath = getDailyLogPath(startedAt);
    const write = (message: string) => {
      appendLogLine(`[${new Date().toISOString()}] ${message}`, startedAt);
    };

    write(`=== START command=${command} ===`);
    write(`log_file=${logPath}`);
    write(`cwd=${process.cwd()}`);
    write(`argv=${JSON.stringify(args)}`);
    if (process.env.ZZHUB_PIPELINE_ROOT) {
      write(`ZZHUB_PIPELINE_ROOT=${process.env.ZZHUB_PIPELINE_ROOT}`);
    }

    const restoreConsole = installConsoleTee(write);
    try {
      let outcome: CommandOutcome = await handler() ?? { status: "success" };
      if (Number(process.exitCode || 0) !== 0 && !outcomeExitCode(outcome)) {
        outcome = { status: "failed", errors: [{ code: "PROCESS_EXIT", message: `进程退出：${process.exitCode}` }] };
      }
      const label = outcomeExitCode(outcome) ? "FAIL" : outcome.status === "success" ? "OK" : outcome.status.toUpperCase();
      write(`=== ${label} command=${command} duration_ms=${Date.now() - startedMs} ===`);
      for (const error of outcome.errors ?? []) write(`${error.code}: ${error.message}${error.cause ? `\n${error.cause}` : ""}`);
      return outcome;
    } catch (err) {
      write(`=== FAIL command=${command} duration_ms=${Date.now() - startedMs} ===`);
      write(formatError(err));
      throw err;
    } finally {
      restoreConsole();
    }
  });
}
