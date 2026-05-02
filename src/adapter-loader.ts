/**
 * Adapter loader — resolves and validates rendering plugins.
 *
 * Priority:
 * 1. User-provided plugin (via config.plugins, loaded via dynamic import)
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

// ── Validation ───────────────────────────────────────────────────

function validateImageRenderPlugin(plugin: unknown, specifier: string): ImageRenderPlugin {
  if (!plugin || typeof plugin !== "object") {
    throw new Error(`image renderer plugin "${specifier}" must export an object`);
  }
  const p = plugin as Record<string, unknown>;
  if (typeof p.name !== "string" || !p.name) {
    throw new Error(`image renderer plugin "${specifier}" must have a string "name" property`);
  }
  if (typeof p.render !== "function") {
    throw new Error(`image renderer plugin "${specifier}" must have a "render" function`);
  }
  return plugin as ImageRenderPlugin;
}

function validateMarkdownRenderPlugin(plugin: unknown, specifier: string): MarkdownRenderPlugin {
  if (!plugin || typeof plugin !== "object") {
    throw new Error(`markdown renderer plugin "${specifier}" must export an object`);
  }
  const p = plugin as Record<string, unknown>;
  if (typeof p.name !== "string" || !p.name) {
    throw new Error(`markdown renderer plugin "${specifier}" must have a string "name" property`);
  }
  if (typeof p.render !== "function") {
    throw new Error(`markdown renderer plugin "${specifier}" must have a "render" function`);
  }
  return plugin as MarkdownRenderPlugin;
}

// ── Dynamic import ───────────────────────────────────────────────

async function importPlugin(specifier: string): Promise<unknown> {
  try {
    const mod = await import(specifier);
    // Support both default exports and named `plugin` exports
    return mod.default ?? mod.plugin ?? mod;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`failed to load plugin "${specifier}": ${message}`);
  }
}

// ── Public API ───────────────────────────────────────────────────

/**
 * Resolve the image renderer plugin.
 * If config.plugins.imageRenderer is set, loads it via dynamic import.
 * Otherwise returns the built-in imgx adapter.
 */
export async function resolveImageRenderer(
  config: PipelineConfig,
): Promise<ImageRenderPlugin> {
  const specifier = config.plugins.imageRenderer;

  if (specifier && specifier.trim()) {
    const mod = await importPlugin(specifier.trim());
    return validateImageRenderPlugin(mod, specifier.trim());
  }

  return builtinImageRenderer;
}

/**
 * Resolve the markdown renderer plugin.
 * If config.plugins.markdownRenderer is set, loads it via dynamic import.
 * Otherwise returns the built-in wechat-preview adapter.
 */
export async function resolveMarkdownRenderer(
  config: PipelineConfig,
): Promise<MarkdownRenderPlugin> {
  const specifier = config.plugins.markdownRenderer;

  if (specifier && specifier.trim()) {
    const mod = await importPlugin(specifier.trim());
    return validateMarkdownRenderPlugin(mod, specifier.trim());
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
