import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { PACKAGE_ROOT } from "../runtime-paths";
import { resolveBunBinary } from "../spawn";
import { monitorDir } from "./runtime";
import type { MonitorDescriptor } from "./types";

/** 本机描述文件严格限制协议和地址，不能借其访问远程服务。 */
export function readMonitorDescriptor(root = monitorDir()): MonitorDescriptor | null {
  try {
    const descriptor = JSON.parse(readFileSync(join(root, "server.json"), "utf8")) as MonitorDescriptor;
    const url = new URL(descriptor.url);
    if (descriptor.version !== 1 || url.protocol !== "http:" || url.hostname !== "127.0.0.1"
      || !url.port || url.username || url.password || !/^[0-9a-f]{64}$/.test(descriptor.token)
      || typeof descriptor.instance_id !== "string" || !Number.isSafeInteger(descriptor.pid)) return null;
    return descriptor;
  } catch { return null; }
}

export async function monitorHealth(descriptor: MonitorDescriptor): Promise<boolean> {
  try {
    const response = await fetch(`${descriptor.url}/v1/health`, {
      headers: { Authorization: `Bearer ${descriptor.token}` }, signal: AbortSignal.timeout(500),
    });
    const health = await response.json() as { service?: string; instance_id?: string; ready?: boolean };
    return response.ok && health.service === "zzhub-pipeline-monitor" && health.instance_id === descriptor.instance_id && health.ready === true;
  } catch { return false; }
}

/** 只有显式 monitor start 才拉起进程，普通业务命令永不等待服务。 */
export async function startMonitor(): Promise<MonitorDescriptor> {
  const existing = readMonitorDescriptor();
  if (existing && await monitorHealth(existing)) return existing;
  mkdirSync(monitorDir(), { recursive: true, mode: 0o700 });
  const child = spawn(resolveBunBinary(), [resolve(PACKAGE_ROOT, "src/cli.ts"), "monitor", "serve"], {
    detached: true, stdio: "ignore", env: { ...process.env, ZZHUB_PIPELINE_MONITOR: "0" },
  });
  let spawnError: Error | null = null;
  child.on("error", (error) => { spawnError = error; });
  child.unref();
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (spawnError) throw spawnError;
    const descriptor = readMonitorDescriptor();
    if (descriptor && await monitorHealth(descriptor)) return descriptor;
    await new Promise((done) => setTimeout(done, 100));
  }
  throw new Error("监控服务启动超时；可运行 zzp monitor serve 查看错误。");
}

export async function stopMonitor(): Promise<boolean> {
  const descriptor = readMonitorDescriptor();
  if (!descriptor || !await monitorHealth(descriptor)) return false;
  const response = await fetch(`${descriptor.url}/v1/stop`, {
    method: "POST", headers: { Authorization: `Bearer ${descriptor.token}` }, signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) throw new Error(`停止监控失败：HTTP ${response.status}`);
  return true;
}
