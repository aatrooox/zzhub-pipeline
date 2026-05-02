/**
 * Centralized asset path resolution for dev, compiled, and npm modes.
 *
 * Dev mode:     running via `bun run src/cli.ts` — assets in source tree
 * Compiled mode: running a `bun build --compile` binary — assets next to binary
 * npm mode:     running via `npx zzp` — assets in dist/ within package
 *
 * Override: set ZZHUB_PIPELINE_ROOT env var to force a specific root.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
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

function isNpmMode(): boolean {
  // In npm mode, all code is bundled into dist/cli.js.
  // _dirname points to dist/ and dist/assets/ exists.
  return existsSync(join(_dirname, "assets")) && !isCompiledMode();
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

  if (isNpmMode()) {
    return _dirname; // dist/ directory
  }

  return DEV_PACKAGE_ROOT;
}

const _root = resolveRoot();
const _isDistMode = isCompiledMode() || isNpmMode();

// ── Path exports ────────────────────────────────────────────────

/** Project root (source tree in dev, dist/ in npm, binary dir in compiled) */
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

const FONT_FILES = [
  "AlimamaShuHeiTi-Bold.ttf",
  "LXGWNeoZhiSongPlus.ttf",
  "LXGWWenKai-Regular.ttf",
];

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
  // 1. Dev/compiled mode: fonts in assets
  const assetsFonts = join(ASSETS_DIR, "fonts");
  if (existsSync(join(assetsFonts, "AlimamaShuHeiTi-Bold.ttf"))) {
    return assetsFonts;
  }
  // 2. npm mode: fonts downloaded to cache
  const cacheDir = getFontCacheDir();
  if (existsSync(join(cacheDir, "AlimamaShuHeiTi-Bold.ttf"))) {
    return cacheDir;
  }
  // 3. Not found — return cache dir (caller should use ensureFonts first)
  return cacheDir;
}

/** imgx fonts directory (assets or cache) */
export const FONTS_DIR = resolveFontsDir();

/**
 * Ensure CJK fonts are available locally.
 * In dev/compiled mode: fonts are in assets/, always available.
 * In npm mode: downloads from CDN if not cached.
 *
 * @returns The fonts directory path
 */
export async function ensureFonts(): Promise<string> {
  const dir = FONTS_DIR;
  const allExist = FONT_FILES.every((f) => existsSync(join(dir, f)));
  if (allExist) return dir;

  const cdnBase = process.env.ZZHUB_FONT_CDN_BASE_URL;
  if (!cdnBase) {
    throw new Error(
      [
        "CJK fonts not found and ZZHUB_FONT_CDN_BASE_URL is not set.",
        "",
        `Fonts directory: ${dir}`,
        "",
        "To fix, either:",
        "  1. Set ZZHUB_FONT_CDN_BASE_URL to download fonts automatically,",
        `  2. Manually place these files in ${dir}:`,
        ...FONT_FILES.map((f) => `     - ${f}`),
      ].join("\n"),
    );
  }

  mkdirSync(dir, { recursive: true });

  for (const file of FONT_FILES) {
    const dest = join(dir, file);
    if (existsSync(dest)) continue;

    const url = `${cdnBase.replace(/\/$/, "")}/${file}`;
    console.error(`[zzhub-pipeline] Downloading ${file}...`);
    const resp = await fetch(url);
    if (!resp.ok) {
      throw new Error(`Failed to download ${url}: HTTP ${resp.status}`);
    }
    const buf = Buffer.from(await resp.arrayBuffer());
    writeFileSync(dest, buf);
    console.error(`[zzhub-pipeline] Saved ${file} (${(buf.length / 1024 / 1024).toFixed(1)}MB)`);
  }

  return dir;
}
