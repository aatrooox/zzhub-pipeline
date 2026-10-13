import type { MonitorProgress } from "./monitor/types";

/** 子进程只执行一次插件调用，进度与结果通过 IPC 返回。 */
process.on("message", async (request: { specifier: string; action: "describe" | "doctor" | "render"; input?: Record<string, unknown> }) => {
  try {
    const module = await import(request.specifier);
    const plugin = module.default ?? module.plugin ?? module;
    if (!plugin || typeof plugin !== "object" || typeof plugin.name !== "string" || !plugin.name.trim() ||
        typeof plugin.render !== "function" || (plugin.doctor !== undefined && typeof plugin.doctor !== "function")) {
      throw new Error("插件必须导出 name、render，以及可选的 doctor 函数");
    }
    // 故障插件频繁报告进度时，限制 IPC 消息数量。
    let lastProgressAt = 0;
    const onProgress = (progress: MonitorProgress) => {
      const now = Date.now();
      if (now - lastProgressAt < 100) return;
      lastProgressAt = now;
      process.send?.({ type: "progress", value: progress });
    };
    const value = request.action === "describe"
      ? { name: plugin.name, version: plugin.version, hasDoctor: typeof plugin.doctor === "function" }
      : request.action === "doctor"
        ? await plugin.doctor()
        : await plugin.render({ ...request.input, onProgress });
    process.send?.({ type: "result", value });
  } catch (error) {
    process.send?.({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
process.send?.({ type: "ready" });
