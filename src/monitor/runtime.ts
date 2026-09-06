import { createHash } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { homedir, platform } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

export const LOG_LIMIT = 10 * 1024 * 1024;
export const RETENTION_MS = 14 * 24 * 60 * 60 * 1000;
export const STORAGE_LIMIT = 512 * 1024 * 1024;

/** 独立于业务配置文件，保证同一用户的多个工作区共享监控。 */
export function monitorDir(): string {
  if (process.env.ZZHUB_PIPELINE_MONITOR_DIR) return resolve(process.env.ZZHUB_PIPELINE_MONITOR_DIR);
  const base = platform() === "darwin" ? join(homedir(), "Library", "Application Support")
    : platform() === "win32" ? process.env.APPDATA || join(homedir(), "AppData", "Roaming")
      : process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "zzhub-pipeline", "monitor");
}

export function canonicalPath(path: string): string {
  try { return realpathSync(path); } catch { return resolve(path); }
}

export function taskId(workspace: string, runId: string): string {
  return createHash("sha256").update(`${canonicalPath(workspace)}\n${runId}`).digest("hex");
}

/** 过滤常见凭据和正文参数；监控从不采集完整 argv、环境或结果正文。 */
export function redact(value: string): string {
  return value
    .replace(/Bearer\s+[^\s"',}]+/gi, "Bearer [redacted]")
    .replace(/((?:[?&]|["']?)(?:access[_-]?token|refresh[_-]?token|token|pat|password|secret(?:key)?|appsecret|authorization|cookie)["']?\s*[:=]\s*)["']?[^\s"'&,}\r\n]+["']?/gi, "$1[redacted]")
    .replace(/(--(?:pat|token|password|secret|body-text|text|intent-text)(?:=|\s+))(?:"[^"]*"|'[^']*'|\S+)/gi, "$1[redacted]")
    .slice(0, 4096);
}

/** PID 加系统启动指纹，避免 PID 复用造成错误的运行中判断。 */
export function processIdentity(pid: number): string | null {
  try {
    if (platform() === "linux") {
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      return `${readFileSync("/proc/sys/kernel/random/boot_id", "utf8").trim()}:${stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19]}`;
    }
    if (platform() === "darwin") {
      const result = spawnSync("/bin/ps", ["-p", String(pid), "-o", "lstart="], { encoding: "utf8", timeout: 1000 });
      return result.status === 0 ? result.stdout.trim() || null : null;
    }
  } catch { /* 身份查询失败不影响 CLI。 */ }
  return null;
}

export function processStatus(pid: number, identity: string | null): "running" | "interrupted" | "unknown" {
  try { process.kill(pid, 0); } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ESRCH" ? "interrupted" : "unknown";
  }
  const current = processIdentity(pid);
  return identity && current ? (identity === current ? "running" : "interrupted") : "unknown";
}
