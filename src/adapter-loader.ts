/**
 * Adapter loader — resolves and validates rendering plugins.
 *
 * Priority:
 * 1. User-provided plugin (via config.plugins, executed in an isolated process)
 * 2. Built-in adapter (builtin-imgx / builtin-wechat-preview)
 */

import type { PipelineConfig } from "./schema/config";
import type {
  ImageRenderPlugin,
  MarkdownRenderPlugin,
  PipelinePluginDoctorCheck,
} from "./adapter-types";
import { builtinImageRenderer } from "./adapters/builtin-image-renderer";
import { builtinMarkdownRenderer } from "./adapters/builtin-markdown-renderer";
import { PluginDoctorSchema, PluginImageOutputSchema, PluginMarkdownOutputSchema, PluginMetadataSchema, runExternalPlugin } from "./plugin-runtime";

// ── Public API ───────────────────────────────────────────────────

/**
 * Resolve the image renderer plugin.
 * 配置外部插件时，加载与调用在子进程执行。
 * Otherwise returns the built-in imgx adapter.
 */
export async function resolveImageRenderer(
  config: PipelineConfig,
): Promise<ImageRenderPlugin> {
  const specifier = config.plugins.imageRenderer;

  if (specifier && specifier.trim()) {
    const pluginPath = specifier.trim();
    const metadata = await runExternalPlugin(pluginPath, "describe", PluginMetadataSchema);
    return {
      name: metadata.name,
      version: metadata.version,
      ...(metadata.hasDoctor ? { doctor: () => runExternalPlugin(pluginPath, "doctor", PluginDoctorSchema) } : {}),
      render: ({ onProgress, ...input }) => runExternalPlugin(pluginPath, "render", PluginImageOutputSchema, input, onProgress),
    };
  }

  return builtinImageRenderer;
}

/**
 * Resolve the markdown renderer plugin.
 * 配置外部插件时，加载与调用在子进程执行。
 * Otherwise returns the built-in wechat-preview adapter.
 */
export async function resolveMarkdownRenderer(
  config: PipelineConfig,
): Promise<MarkdownRenderPlugin> {
  const specifier = config.plugins.markdownRenderer;

  if (specifier && specifier.trim()) {
    const pluginPath = specifier.trim();
    const metadata = await runExternalPlugin(pluginPath, "describe", PluginMetadataSchema);
    return {
      name: metadata.name,
      version: metadata.version,
      ...(metadata.hasDoctor ? { doctor: () => runExternalPlugin(pluginPath, "doctor", PluginDoctorSchema) } : {}),
      render: ({ onProgress, ...input }) => runExternalPlugin(pluginPath, "render", PluginMarkdownOutputSchema, input, onProgress,
        input.timeoutMs && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0 ? input.timeoutMs + 10_000 : 120_000),
    };
  }

  return builtinMarkdownRenderer;
}

/**
 * Run doctor checks on resolved plugins.
 */
export async function runPluginDoctorChecks(
  config: PipelineConfig,
): Promise<PipelinePluginDoctorCheck[]> {
  const checks: PipelinePluginDoctorCheck[] = [];

  try {
    const imageRenderer = await resolveImageRenderer(config);
    if (imageRenderer.doctor) {
      checks.push(...(await imageRenderer.doctor()));
    } else {
      checks.push({ name: imageRenderer.name, ok: true, message: "no doctor check defined" });
    }
  } catch (err) {
    checks.push({
      name: "image-renderer",
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  try {
    const markdownRenderer = await resolveMarkdownRenderer(config);
    if (markdownRenderer.doctor) {
      checks.push(...(await markdownRenderer.doctor()));
    } else {
      checks.push({ name: markdownRenderer.name, ok: true, message: "no doctor check defined" });
    }
  } catch (err) {
    checks.push({
      name: "markdown-renderer",
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    });
  }

  return checks;
}
