/**
 * Centralized asset path resolution for both dev and compiled modes.
 *
 * In dev mode (running via `bun run src/cli.ts`), assets are resolved
 * relative to the source tree using import.meta.url.
 *
 * In compiled mode (running a `bun build --compile` binary), assets are
 * resolved relative to the binary's location. The build script copies
 * static assets next to the binary.
 *
 * Override: set ZZHUB_PIPELINE_ROOT env var to force a specific root.
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Dev mode: resolve from source tree ──────────────────────────

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

// In dev mode, this file is at src/runtime-paths.ts, so PACKAGE_ROOT = ../..
const DEV_PACKAGE_ROOT = resolve(_dirname, "..");

// ── Compiled mode: resolve from binary location ─────────────────

function getBinaryDir(): string | null {
  const binPath = process.argv[0];
  if (!binPath || !existsSync(binPath)) return null;
  return dirname(binPath);
}

function isCompiledMode(): boolean {
  const envOverride = process.env.ZZHUB_PIPELINE_ROOT;
  if (envOverride) return false; // env override takes priority, treat as custom root

  const binDir = getBinaryDir();
  if (!binDir) return false;

  // In compiled mode, the binary is a standalone executable.
  // Check if assets dir exists next to the binary.
  return existsSync(join(binDir, "assets"));
}

// ── Public API ──────────────────────────────────────────────────

function resolveRoot(): string {
  const envOverride = process.env.ZZHUB_PIPELINE_ROOT;
  if (envOverride && envOverride.trim()) {
    return resolve(envOverride.trim());
  }

  if (isCompiledMode()) {
    const binDir = getBinaryDir()!;
    return binDir;
  }

  return DEV_PACKAGE_ROOT;
}

const _root = resolveRoot();

/** Project root (source tree in dev, binary dir in compiled) */
export const PACKAGE_ROOT = _root;

/** imgx module directory */
export const IMGX_DIR = join(_root, isCompiledMode() ? "assets/imgx" : "src/imgx");

/** imgx assets directory */
export const ASSETS_DIR = join(IMGX_DIR, "assets");

/** imgx templates directory */
export const TEMPLATES_DIR = join(ASSETS_DIR, "templates");

/** imgx icons directory */
export const ICONS_DIR = join(ASSETS_DIR, "icons");

/** imgx fonts directory */
export const FONTS_DIR = join(ASSETS_DIR, "fonts");

/** imgx styles directory */
export const STYLES_DIR = join(ASSETS_DIR, "styles");

/** wechat-preview module directory */
export const WECHAT_PREVIEW_DIR = join(_root, isCompiledMode() ? "assets/wechat-preview" : "src/wechat-preview");

/** wechat-preview template */
export const TEMPLATE_PATH = join(WECHAT_PREVIEW_DIR, "assets/templates/export-shell.html");

/** wechat-preview browser-dist directory */
export const DIST_DIR = join(WECHAT_PREVIEW_DIR, "assets/browser-dist");

/** wechat-preview Vite manifest */
export const MANIFEST_PATH = join(DIST_DIR, ".vite/manifest.json");

/** Vite config path (dev only — compiled mode has pre-built bundle) */
export const VITE_CONFIG_PATH = join(PACKAGE_ROOT, "vite.wechat-preview.config.ts");

/** @chenglou/pretext layout.js path */
export const PRETEXT_MODULE_PATH = join(PACKAGE_ROOT, "node_modules/@chenglou/pretext/dist/layout.js");

/** Helper: read a UTF-8 file */
export function readUtf8(path: string): string {
  return readFileSync(path, "utf8");
}
