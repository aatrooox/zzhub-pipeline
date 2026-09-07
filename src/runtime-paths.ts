/**
 * Centralized asset path resolution for dev and compiled modes.
 *
 * Dev mode:     running via `bun run src/cli.ts` — assets in source tree
 * Compiled mode: running a `bun build --compile` binary — assets next to binary
 *
 * Override: set ZZHUB_PIPELINE_ROOT env var to force a specific root.
 */

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ── Dev mode: resolve from source tree ──────────────────────────

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

// In dev mode, this file is at src/runtime-paths.ts, so PACKAGE_ROOT = ..
const DEV_PACKAGE_ROOT = resolve(_dirname, "..");

// ── Mode detection ──────────────────────────────────────────────

function getBinaryDir(): string | null {
  const binPath = process.argv[0];
  if (!binPath || !existsSync(binPath)) return null;
  return dirname(binPath);
}

function isCompiledMode(): boolean {
  if (process.env.ZZHUB_PIPELINE_ROOT) return false;
  const binDir = getBinaryDir();
  if (!binDir) return false;
  // In compiled mode, the binary is standalone — check for assets/ sibling
  return existsSync(join(binDir, "assets")) && !existsSync(join(binDir, "cli.js"));
}

// ── Root resolution ─────────────────────────────────────────────

function resolveRoot(): string {
  const envOverride = process.env.ZZHUB_PIPELINE_ROOT;
  if (envOverride && envOverride.trim()) {
    return resolve(envOverride.trim());
  }

  if (isCompiledMode()) {
    return getBinaryDir()!;
  }

  return DEV_PACKAGE_ROOT;
}

const _root = resolveRoot();
const _isDistMode = isCompiledMode();

// ── Path exports ────────────────────────────────────────────────

/** Project root (source tree in dev, binary dir in compiled) */
export const PACKAGE_ROOT = _root;

/** imgx module directory */
export const IMGX_DIR = join(_root, _isDistMode ? "assets/imgx" : "src/imgx");

/** imgx assets directory */
export const ASSETS_DIR = join(IMGX_DIR, "assets");

/** imgx templates directory */
export const TEMPLATES_DIR = join(ASSETS_DIR, "templates");

/** imgx icons directory */
export const ICONS_DIR = join(ASSETS_DIR, "icons");

/** imgx styles directory */
export const STYLES_DIR = join(ASSETS_DIR, "styles");

/** wechat-preview module directory */
export const WECHAT_PREVIEW_DIR = join(_root, _isDistMode ? "assets/wechat-preview" : "src/wechat-preview");

/** wechat-preview template */
export const TEMPLATE_PATH = join(WECHAT_PREVIEW_DIR, "assets/templates/export-shell.html");

/** wechat-preview browser-dist directory */
export const DIST_DIR = join(WECHAT_PREVIEW_DIR, "assets/browser-dist");

/** wechat-preview Vite manifest */
export const MANIFEST_PATH = join(DIST_DIR, ".vite/manifest.json");

/** Vite config path (dev only) */
export const VITE_CONFIG_PATH = join(PACKAGE_ROOT, "vite.wechat-preview.config.ts");

/** @chenglou/pretext layout.js path */
export const PRETEXT_MODULE_PATH = join(PACKAGE_ROOT, "node_modules/@chenglou/pretext/dist/layout.js");

/** Helper: read a UTF-8 file */
export function readUtf8(path: string): string {
  return readFileSync(path, "utf8");
}

// ── Font cache ──────────────────────────────────────────────────

/** 随 CLI 分发的字体；按当前版式选择需要的文件。 */
export const BUILTIN_FONTS: Record<string, string> = {
  AlimamaShuHeiTi: "AlimamaShuHeiTi-Bold.ttf",
  LXGWNeoZhiSongPlus: "LXGWNeoZhiSongPlus.ttf",
  LXGWWenKai: "LXGWWenKai-Regular.ttf",
};

function getFontCacheDir(): string {
  const platform = process.platform;
  if (platform === "win32") {
    const appData = process.env.APPDATA || join(homedir(), "AppData", "Roaming");
    return join(appData, "zzhub-pipeline", "fonts");
  }
  const base = process.env.XDG_CONFIG_HOME || join(homedir(), ".config");
  return join(base, "zzhub-pipeline", "fonts");
}

function resolveFontsDir(): string {
  // Fonts in assets/ (dev/compiled mode) or cache
  const assetsFonts = join(ASSETS_DIR, "fonts");
  if (existsSync(join(assetsFonts, "AlimamaShuHeiTi-Bold.ttf"))) {
    return assetsFonts;
  }
  const cacheDir = getFontCacheDir();
  if (existsSync(join(cacheDir, "AlimamaShuHeiTi-Bold.ttf"))) {
    return cacheDir;
  }
  return cacheDir;
}

/** imgx fonts directory (assets or cache) */
export const FONTS_DIR = resolveFontsDir();

/** 只检查本地字体，不在生成图片时触发网络下载。 */
export async function ensureFonts(files: string[] = Object.values(BUILTIN_FONTS)): Promise<string> {
  const missing = [...new Set(files)].filter(file => !existsSync(join(FONTS_DIR, file)));
  if (missing.length) throw new Error(`缺少内置字体：${missing.join(", ")}。请重新安装 CLI，或为封面配置本机字体；字体目录：${FONTS_DIR}`);
  return FONTS_DIR;
}
