import { parseArgs } from "../args";
import { printHelp, printResult } from "../output";
import { monitorHealth, readMonitorDescriptor, startMonitor, stopMonitor } from "../monitor/client";
import { serveMonitor } from "../monitor/server";

/** 服务管理不进入业务日志，防止描述文件令牌被日志复制。 */
export async function monitor(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  const action = (JSON.parse(String(parsed._)) as string[])[0] || "status";
  if (parsed.help) { printHelp("Usage: zzp monitor start | serve | status | stop\nLocal HTTP/SSE monitoring; business commands run independently."); return; }
  if (action === "start") { printResult(await startMonitor()); return; }
  if (action === "serve") { const server = await serveMonitor(); printResult(server?.descriptor || await startMonitor()); return; }
  if (action === "stop") { printResult({ stopped: await stopMonitor() }); return; }
  if (action === "status") {
    const descriptor = readMonitorDescriptor();
    const running = !!descriptor && await monitorHealth(descriptor);
    printResult({ running, ...(running ? { url: descriptor.url, instance_id: descriptor.instance_id, version: 1 } : {}) });
    return;
  }
  throw new Error(`Unknown monitor action: ${action}`);
}
