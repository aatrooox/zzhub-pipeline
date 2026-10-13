import { existsSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import type { MonitorProgress } from "./monitor/types";
import { notifyProgress } from "./monitor/recorder";
import { PACKAGE_ROOT } from "./runtime-paths";
import { resolveBunBinary } from "./spawn";

/** 插件错误保留阶段和错误码，终端与调用方使用同一提示。 */
export class PluginExecutionError extends Error {
  constructor(readonly code: string, specifier: string, action: string, detail: string) {
    const stage = action === "describe" ? "加载" : action === "doctor" ? "检查" : "渲染";
    super(`[${code}] 插件「${specifier}」${stage}失败：${detail}。请检查插件配置、运行 zzp doctor 或切换内置渲染器，修复后再重试；本次未自动重试。`);
    this.name = "PluginExecutionError";
  }
}

export const PluginMetadataSchema = z.object({
  name: z.string().trim().min(1),
  version: z.string().optional(),
  hasDoctor: z.boolean(),
});
export const PluginDoctorSchema = z.array(z.object({
  name: z.string().min(1), ok: z.boolean(), message: z.string().optional(), detail: z.unknown().optional(),
}));
export const PluginImageOutputSchema = z.object({
  assets: z.array(z.object({
    kind: z.enum(["cover", "page"]), route: z.enum(["wechat-article", "wechat-newspic", "blog"]),
    path: z.string().trim().min(1), index: z.number().int().positive().optional(),
  })),
  pageCount: z.number().int().nonnegative(),
  pages: z.array(z.object({
    page: z.number().int().positive(), imageCount: z.number().int().nonnegative(), imageSources: z.array(z.string()),
  })),
});
export const PluginMarkdownOutputSchema = z.object({
  html: z.string().refine(value => value.trim().length > 0, "HTML 不能为空"), htmlPath: z.string().trim().min(1), account: z.string().min(1), previewStyle: z.string(),
  previewShellPath: z.string().optional(), durationMs: z.number().nonnegative().optional(),
  bundleRebuilt: z.boolean().optional(), bundleStale: z.boolean().optional(), debugDir: z.string().optional(), semanticHtml: z.string().optional(),
});
const ProgressSchema = z.object({
  stage: z.string(), message: z.string().optional(), current: z.number().nonnegative().optional(),
  total: z.number().nonnegative().optional(), unit: z.enum(["pages", "files", "bytes", "targets"]).optional(),
  route: z.string().optional(), account: z.string().optional(),
});

/** 外部插件独立执行；父进程可终止同步死循环、异常退出和永不结束的 Promise。 */
export async function runExternalPlugin<T>(
  specifier: string,
  action: "describe" | "doctor" | "render",
  schema: z.ZodType<T>,
  input?: Record<string, unknown>,
  configuration: { options?: Record<string, unknown>; environment?: Record<string, string> } = {},
  onProgress?: (progress: MonitorProgress) => void,
  defaultTimeoutMs = action === "render" ? 120_000 : 10_000,
): Promise<T> {
  const override = Number(process.env.ZZHUB_PIPELINE_PLUGIN_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(override) && override > 0 && override <= 2_147_483_647 ? override : defaultTimeoutMs;
  let importSpecifier: string;
  try {
    importSpecifier = specifier.startsWith(".") || isAbsolute(specifier)
      ? pathToFileURL(resolve(specifier)).href : import.meta.resolve(specifier);
  } catch (error) {
    throw new PluginExecutionError("PLUGIN_LOAD_FAILED", specifier, action, error instanceof Error ? error.message : String(error));
  }
  const sourceRunner = join(PACKAGE_ROOT, "src/plugin-runner.ts");
  const runner = existsSync(sourceRunner) ? sourceRunner : join(PACKAGE_ROOT, "plugin-runner.js");
  let stderr = "";
  let settled = false;
  let child: ReturnType<typeof Bun.spawn<"ignore", "ignore", "pipe">> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<T>((resolveResult, reject) => {
      const finish = (error?: Error, value?: T) => {
        if (settled) return;
        settled = true;
        if (error) reject(error);
        else resolveResult(value!);
      };
      child = Bun.spawn({
        cmd: [resolveBunBinary(), runner], stdin: "ignore", stdout: "ignore", stderr: "pipe",
        detached: process.platform !== "win32",
        env: { ...process.env, ...configuration.environment, ZZHUB_PIPELINE_MONITOR: "0" },
        ipc(message, processHandle) {
          if (settled || !message || typeof message !== "object") return;
          try {
          if (message.type === "ready") {
            processHandle.send({ specifier: importSpecifier, action, input, options: configuration.options ?? {} });
          } else if (message.type === "progress") {
            const progress = ProgressSchema.safeParse(message.value);
            if (progress.success) notifyProgress(onProgress, progress.data);
          } else if (message.type === "result") {
            const parsed = schema.safeParse(message.value);
            if (parsed.success) finish(undefined, parsed.data);
            else finish(new PluginExecutionError("PLUGIN_INVALID_RESULT", specifier, action,
              `返回格式不符合约定：${parsed.error.issues.slice(0, 3).map(issue => `${issue.path.join(".") || "result"}: ${issue.message}`).join("; ")}`));
          } else if (message.type === "error") {
            finish(new PluginExecutionError("PLUGIN_EXECUTION_FAILED", specifier, action, String(message.message).slice(-4000)));
          }
          } catch (error) {
            finish(new PluginExecutionError("PLUGIN_EXECUTION_FAILED", specifier, action, error instanceof Error ? error.message : String(error)));
          }
        },
      });
      timer = setTimeout(() => finish(new PluginExecutionError("PLUGIN_TIMEOUT", specifier, action,
        `超过 ${timeoutMs}ms，已终止插件进程；可通过 ZZHUB_PIPELINE_PLUGIN_TIMEOUT_MS 调整上限`)), timeoutMs);
      // 只保留诊断尾部，插件大量输出不能占满父进程内存。
      const reader = child.stderr.getReader();
      const decoder = new TextDecoder();
      const drain = async () => {
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) return;
          stderr = (stderr + decoder.decode(chunk.value, { stream: true })).slice(-4000);
        }
      };
      void drain().catch(() => {});
      void child.exited.then(code => finish(new PluginExecutionError("PLUGIN_PROCESS_EXIT", specifier, action,
        `插件进程退出（${child?.signalCode || code}），未返回结果${stderr.trim() ? `：${stderr.trim()}` : ""}`)),
      error => finish(new PluginExecutionError("PLUGIN_PROCESS_EXIT", specifier, action, String(error))));
    });
  } catch (error) {
    if (error instanceof PluginExecutionError) throw error;
    throw new PluginExecutionError("PLUGIN_EXECUTION_FAILED", specifier, action, error instanceof Error ? error.message : String(error));
  } finally {
    if (timer) clearTimeout(timer);
    if (child) {
      if (process.platform !== "win32") {
        try { process.kill(-child.pid, "SIGKILL"); } catch { /* 进程组已经退出。 */ }
      }
      if (child.exitCode === null) child.kill("SIGKILL");
    }
    await child?.exited;
  }
}
