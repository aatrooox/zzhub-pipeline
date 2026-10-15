import type { MonitorProgress } from "./monitor/types";

/** 子进程只执行一次插件调用，进度与结果通过 IPC 返回。 */
process.on("message", async (request: { specifier: string; action: "describe" | "doctor" | "render" | "studio" | "browser"; input?: Record<string, unknown>; options?: Record<string, unknown> }) => {
  try {
    const module = await import(request.specifier);
    const plugin = module.default ?? module.plugin ?? module;
    if (!plugin || typeof plugin !== "object" || typeof plugin.name !== "string" || !plugin.name.trim() ||
        (typeof plugin.render !== "function" && typeof plugin.browser !== "function") ||
        (plugin.browser !== undefined && typeof plugin.browser !== "function") || (plugin.doctor !== undefined && typeof plugin.doctor !== "function") ||
        (plugin.studio !== undefined && typeof plugin.studio !== "function")) {
      throw new Error("插件必须导出 name、render 或 browser，以及可选的 doctor 函数和 studio 函数");
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
      ? { name: plugin.name, version: plugin.version, hasDoctor: typeof plugin.doctor === "function", hasStudio: typeof plugin.studio === "function", hasBrowser: typeof plugin.browser === "function" }
      : request.action === "doctor"
        ? await plugin.doctor(request.options)
        : request.action === "studio"
          ? await plugin.studio(request.options)
        : request.action === "browser"
          ? await plugin.browser(request.options)
        : await plugin.render({ ...request.input, onProgress }, request.options);
    process.send?.({ type: "result", value });
  } catch (error) {
    process.send?.({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
process.send?.({ type: "ready" });
