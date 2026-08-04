import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { imageSize } from "image-size";
import { PNG } from "pngjs";

import {
  PACKAGE_ROOT as _PACKAGE_ROOT,
  IMGX_DIR as _IMGX_DIR,
  ASSETS_DIR as _ASSETS_DIR,
  TEMPLATES_DIR as _TEMPLATES_DIR,
  ICONS_DIR as _ICONS_DIR,
  FONTS_DIR as _FONTS_DIR,
  STYLES_DIR as _STYLES_DIR,
} from "../runtime-paths";

export const PACKAGE_ROOT = _PACKAGE_ROOT;
export const IMGX_DIR = _IMGX_DIR;
export const SKILL_DIR = _IMGX_DIR;
export const ASSETS_DIR = _ASSETS_DIR;
export const TEMPLATES_DIR = _TEMPLATES_DIR;
export const ICONS_DIR = _ICONS_DIR;
export const FONTS_DIR = _FONTS_DIR;
export const STYLES_DIR = _STYLES_DIR;

const CHROME_PATHS = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
  "google-chrome",
  "chromium",
];

const STATIC_RENDER_STYLE = `<style data-zzhub-static-render>*,:before,:after{animation:none!important;transition:none!important}html{scroll-behavior:auto!important}</style>`;
const CHROME_VIEWPORT_PROBE_SIZE = { width: 900, height: 1200 } as const;
const chromeViewportInsetCache = new Map<string, { width: number; height: number }>();

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Render inline markdown bold (**text**) and italic (*text*) as HTML,
 * while properly escaping HTML entities in non-markdown segments.
 * Handles nested bold+italic (***text***) and multiple segments per line.
 */
export function renderInlineMarkdown(text: string): string {
  if (!text) return "";

  const parts: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    // Try to match ***bold+italic*** first, then **bold**, then *italic*
    // We need to find the opening marker and then the matching closing marker
    const tripleMatch = remaining.match(/\*\*\*/);
    const doubleMatch = remaining.match(/\*\*/);
    const singleMatch = remaining.match(/(?<!\*)\*(?!\*)/);

    // Find the earliest marker
    let earliestIdx = remaining.length;
    let markerType: "triple" | "double" | "single" | null = null;

    if (tripleMatch && tripleMatch.index !== undefined && tripleMatch.index < earliestIdx) {
      earliestIdx = tripleMatch.index;
      markerType = "triple";
    }
    if (doubleMatch && doubleMatch.index !== undefined && doubleMatch.index < earliestIdx) {
      earliestIdx = doubleMatch.index;
      markerType = "double";
    }
    if (singleMatch && singleMatch.index !== undefined && singleMatch.index < earliestIdx) {
      earliestIdx = singleMatch.index;
      markerType = "single";
    }

    if (markerType === null) {
      // No more markers — escape the rest
      parts.push(escapeHtml(remaining));
      break;
    }

    // Escape any text before the marker
    if (earliestIdx > 0) {
      parts.push(escapeHtml(remaining.slice(0, earliestIdx)));
    }

    if (markerType === "triple") {
      const afterOpen = remaining.slice(earliestIdx + 3);
      const closeIdx = afterOpen.indexOf("***");
      if (closeIdx === -1) {
        // No closing marker — treat as literal
        parts.push(escapeHtml(remaining.slice(earliestIdx)));
        break;
      }
      const inner = afterOpen.slice(0, closeIdx);
      parts.push(`<strong><em>${escapeHtml(inner)}</em></strong>`);
      remaining = afterOpen.slice(closeIdx + 3);
      continue;
    }

    if (markerType === "double") {
      const afterOpen = remaining.slice(earliestIdx + 2);
      const closeIdx = afterOpen.indexOf("**");
      if (closeIdx === -1) {
        parts.push(escapeHtml(remaining.slice(earliestIdx)));
        break;
      }
      const inner = afterOpen.slice(0, closeIdx);
      parts.push(`<strong>${escapeHtml(inner)}</strong>`);
      remaining = afterOpen.slice(closeIdx + 2);
      continue;
    }

    if (markerType === "single") {
      const afterOpen = remaining.slice(earliestIdx + 1);
      const closeIdx = afterOpen.indexOf("*");
      if (closeIdx === -1) {
        parts.push(escapeHtml(remaining.slice(earliestIdx)));
        break;
      }
      const inner = afterOpen.slice(0, closeIdx);
      parts.push(`<em>${escapeHtml(inner)}</em>`);
      remaining = afterOpen.slice(closeIdx + 1);
      continue;
    }
  }

  return parts.join("");
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}

export function readUtf8(path: string): string {
  return readFileSync(path, "utf8");
}

export function renderTemplate(template: string, replacements: Record<string, string>): string {
  let html = template;
  for (const [key, value] of Object.entries(replacements)) {
    html = html.replaceAll(key, value);
  }
  return html;
}

export function findChrome(): string | null {
  for (const candidate of CHROME_PATHS) {
    const result = Bun.spawnSync({
      cmd: ["sh", "-lc", `command -v "${candidate}" >/dev/null 2>&1 || test -x "${candidate}"`],
      stderr: "ignore",
      stdout: "ignore",
    });
    if (result.exitCode === 0) return candidate;
  }
  return null;
}

export function writeTempHtml(html: string): string {
  const dir = mkdtempSync(join(tmpdir(), "zzhub-media-imgx-"));
  const filePath = join(dir, "render.html");
  writeFileSync(filePath, html, "utf8");
  return filePath;
}

export function injectStaticRenderStyle(html: string): string {
  if (html.includes("</head>")) {
    return html.replace("</head>", `${STATIC_RENDER_STYLE}</head>`);
  }
  return `${STATIC_RENDER_STYLE}${html}`;
}

export function cleanupTempFile(path: string): void {
  rmSync(dirname(path), { recursive: true, force: true });
}

function measureChromeViewportInsets(chromePath: string): { width: number; height: number } {
  const cached = chromeViewportInsetCache.get(chromePath);
  if (cached) return cached;

  const probeHtml = writeTempHtml(
    injectStaticRenderStyle(
      [
        "<!doctype html>",
        '<html><head><meta charset="utf-8"></head><body>',
        '<pre id="out"></pre>',
        "<script>",
        "document.getElementById('out').textContent = JSON.stringify({",
        "  innerWidth: window.innerWidth,",
        "  innerHeight: window.innerHeight,",
        "  docClientWidth: document.documentElement.clientWidth,",
        "  docClientHeight: document.documentElement.clientHeight,",
        "});",
        "</script>",
        "</body></html>",
      ].join(""),
    ),
  );
  const fileUrl = pathToFileURL(probeHtml).href;
  const result = Bun.spawnSync({
    cmd: [
      chromePath,
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--allow-file-access-from-files",
      "--disable-web-security=false",
      "--hide-scrollbars",
      `--window-size=${CHROME_VIEWPORT_PROBE_SIZE.width},${CHROME_VIEWPORT_PROBE_SIZE.height}`,
      "--dump-dom",
      fileUrl,
    ],
    stdout: "pipe",
    stderr: "pipe",
  });
  cleanupTempFile(probeHtml);
  if (result.exitCode !== 0) {
    const stderr = new TextDecoder().decode(result.stderr);
    throw new Error(`Chrome viewport probe failed:\n${stderr}`);
  }

  const dumped = new TextDecoder().decode(result.stdout);
  const match = dumped.match(/<pre id="out">([\s\S]*?)<\/pre>/);
  if (!match) {
    throw new Error("Chrome viewport probe failed: missing probe output");
  }

  const measured = JSON.parse(match[1]) as {
    innerWidth?: unknown;
    innerHeight?: unknown;
  };
  const innerWidth = typeof measured.innerWidth === "number" ? measured.innerWidth : CHROME_VIEWPORT_PROBE_SIZE.width;
  const innerHeight = typeof measured.innerHeight === "number" ? measured.innerHeight : CHROME_VIEWPORT_PROBE_SIZE.height;
  const inset = {
    width: Math.max(0, CHROME_VIEWPORT_PROBE_SIZE.width - innerWidth),
    height: Math.max(0, CHROME_VIEWPORT_PROBE_SIZE.height - innerHeight),
  };
  chromeViewportInsetCache.set(chromePath, inset);
  return inset;
}

/**
 * A self-contained render intent: fully-resolved HTML plus the exact viewport
 * dimensions to rasterize. The local backend screenshots it with Chrome; the
 * remote backend ships this same HTML (+ asset URLs) to a browser client.
 *
 * `captureHeight` covers the wechat-cover-split quirk: Chrome must render a
 * taller window (so in-page pretext layout settles) and the result is cropped
 * back to `height`.
 */
export interface RasterTask {
  html: string;
  width: number;
  height: number;
  captureHeight?: number;
  virtualTimeBudgetMs?: number;
}

/**
 * Local Chrome rasterizer: turn a RasterTask into a PNG on disk.
 * Remote backends do not call this; they hand the task to a browser client.
 * When `captureHeight` exceeds `height` (wechat-cover-split in-page pretext
 * needs a taller window to settle), the taller capture is cropped to final.
 */
export function rasterizeLocal(
  task: RasterTask,
  outPath: string,
  chromePath: string,
): void {
  if (!task.captureHeight || task.captureHeight <= task.height) {
    screenshotHtml({
      chromePath,
      html: task.html,
      outPath,
      width: task.width,
      height: task.height,
      virtualTimeBudgetMs: task.virtualTimeBudgetMs,
    });
    return;
  }

  const tempShotDir = mkdtempSync(join(tmpdir(), "zzhub-media-raster-"));
  const rawPath = join(tempShotDir, "shot.png");
  try {
    screenshotHtml({
      chromePath,
      html: task.html,
      outPath: rawPath,
      width: task.width,
      height: task.captureHeight,
      virtualTimeBudgetMs: task.virtualTimeBudgetMs,
    });
    cropTop({ inputPath: rawPath, outPath, width: task.width, height: task.height });
  } finally {
    rmSync(tempShotDir, { recursive: true, force: true });
  }
}

export function screenshotHtml(options: {
  chromePath: string;
  html: string;
  outPath: string;
  width: number;
  height: number;
  hideScrollbars?: boolean;
  virtualTimeBudgetMs?: number;
}): void {
  ensureParentDir(options.outPath);
  const tempHtml = writeTempHtml(injectStaticRenderStyle(options.html));
  const fileUrl = pathToFileURL(tempHtml).href;
  const viewportInset = measureChromeViewportInsets(options.chromePath);
  const tempShotDir = mkdtempSync(join(tmpdir(), "zzhub-media-shot-"));
  const tempShotPath = join(tempShotDir, "shot.png");
  const captureWidth = options.width + viewportInset.width;
  const captureHeight = options.height + viewportInset.height;
  const chromeArgs = [
    options.chromePath,
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--allow-file-access-from-files",
    "--disable-web-security=false",
  ];
  if (options.hideScrollbars) chromeArgs.push("--hide-scrollbars");
  if ((options.virtualTimeBudgetMs ?? 0) > 0) {
    chromeArgs.push(`--virtual-time-budget=${options.virtualTimeBudgetMs}`);
  }
  chromeArgs.push(
    `--screenshot=${tempShotPath}`,
    `--window-size=${captureWidth},${captureHeight}`,
    fileUrl,
  );

  const result = Bun.spawnSync({
    cmd: chromeArgs,
    stdout: "pipe",
    stderr: "pipe",
  });
  cleanupTempFile(tempHtml);
  if (result.exitCode !== 0) {
    rmSync(tempShotDir, { recursive: true, force: true });
    const stderr = new TextDecoder().decode(result.stderr);
    throw new Error(`Chrome failed:\n${stderr}`);
  }
  cropTop({
    inputPath: tempShotPath,
    outPath: options.outPath,
    width: options.width,
    height: options.height,
  });
  rmSync(tempShotDir, { recursive: true, force: true });
}

export class ChromeDumpError extends Error {
  readonly stderr: string;
  readonly tempHtmlPath?: string;
  readonly exitCode: number | null;

  constructor(message: string, options: {
    stderr: string;
    tempHtmlPath?: string;
    exitCode: number | null;
  }) {
    super(message);
    this.name = "ChromeDumpError";
    this.stderr = options.stderr;
    this.tempHtmlPath = options.tempHtmlPath;
    this.exitCode = options.exitCode;
  }
}

export function dumpHtmlDom(options: {
  chromePath: string;
  html: string;
  virtualTimeBudgetMs?: number;
  /** When true, leave the temp shell HTML on disk if Chrome fails (caller must clean up). */
  keepTempOnError?: boolean;
}): string {
  const tempHtml = writeTempHtml(injectStaticRenderStyle(options.html));
  const fileUrl = pathToFileURL(tempHtml).href;
  const chromeArgs = [
    options.chromePath,
    "--headless",
    "--disable-gpu",
    "--no-sandbox",
    "--allow-file-access-from-files",
    "--disable-web-security=false",
  ];
  if ((options.virtualTimeBudgetMs ?? 0) > 0) {
    chromeArgs.push(`--virtual-time-budget=${options.virtualTimeBudgetMs}`);
  }
  chromeArgs.push("--dump-dom", fileUrl);

  const result = Bun.spawnSync({
    cmd: chromeArgs,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    const stderr = new TextDecoder().decode(result.stderr);
    if (!options.keepTempOnError) {
      cleanupTempFile(tempHtml);
    }
    throw new ChromeDumpError(`Chrome dump-dom failed (exit ${result.exitCode}):\n${stderr}`, {
      stderr,
      tempHtmlPath: options.keepTempOnError ? tempHtml : undefined,
      exitCode: result.exitCode,
    });
  }
  const dom = new TextDecoder().decode(result.stdout);
  cleanupTempFile(tempHtml);
  return dom;
}

export function cropTop(options: {
  inputPath: string;
  outPath: string;
  width: number;
  height: number;
}): void {
  const inputPath = resolveInputPath(options.inputPath);
  ensureParentDir(options.outPath);

  const source = PNG.sync.read(readFileSync(inputPath));
  if (options.width > source.width || options.height > source.height) {
    throw new Error(
      `crop bounds exceed source image: requested ${options.width}x${options.height}, source ${source.width}x${source.height}`,
    );
  }

  const output = new PNG({ width: options.width, height: options.height });
  PNG.bitblt(source, output, 0, 0, options.width, options.height, 0, 0);
  writeFileSync(options.outPath, PNG.sync.write(output));
}

export function resolveAsset(path: string): string {
  return resolve(SKILL_DIR, path);
}

export function resolveInputPath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0) return path;
  if (isAbsolute(trimmed)) return trimmed;

  const normalized = trimmed.replace(/\\/g, "/");
  if (normalized.startsWith("zzhub-media-imgx/")) {
    return resolve(SKILL_DIR, normalized.slice("zzhub-media-imgx/".length));
  }
  if (normalized.startsWith("assets/")) {
    return resolve(SKILL_DIR, normalized);
  }

  return resolve(trimmed);
}

export function printSaved(outPath: string): void {
  console.log(`✅ Saved to ${outPath}`);
}

export function readImageSize(path: string): { width: number; height: number } | null {
  const normalized = resolveInputPath(path);
  try {
    const size = imageSize(readFileSync(normalized));
    if (
      typeof size.width === "number" &&
      typeof size.height === "number" &&
      Number.isFinite(size.width) &&
      Number.isFinite(size.height) &&
      size.width > 0 &&
      size.height > 0
    ) {
      return { width: size.width, height: size.height };
    }
  } catch {
    return null;
  }
  return null;
}
