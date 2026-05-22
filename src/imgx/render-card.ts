#!/usr/bin/env bun
import { rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getArg, getArgs, hasFlag, parseArgs, requireArg } from "./cli";
import { buildPosterConfig, serializePosterConfig, type TipItem } from "./poster-recipe";
import {
  PACKAGE_ROOT,
  cropTop,
  ensureParentDir,
  escapeHtml,
  findChrome,
  FONTS_DIR,
  ICONS_DIR,
  printSaved,
  readUtf8,
  renderTemplate,
  resolveInputPath,
  screenshotHtml,
  TEMPLATES_DIR,
} from "./runtime";

const SIZE_MAP: Record<string, { width: number; height: number }> = {
  "poster-3-4": { width: 900, height: 1200 },
  "wechat-cover-split": { width: 1340, height: 400 },
  "tips-3-4": { width: 900, height: 1200 },
};
const DEFAULT_SIZE = { width: 900, height: 1200 } as const;

const WECHAT_SPLIT_WINDOW_EXTRA_HEIGHT = 87;
const PRETEXT_SCREENSHOT_VIRTUAL_TIME_BUDGET_MS = 6_000;

function detectIcon(template: string, _text: string, _line1: string, _line2: string, _line3: string, fallbackIcon: string): string {
  if (template === "wechat-cover-split") {
    return join(ICONS_DIR, "logo.svg");
  }

  if (fallbackIcon.length > 0) return fallbackIcon;
  return join(ICONS_DIR, "logo.svg");
}

function splitWechatTitle(text: string): { line1: string; line2: string } {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) {
    return { line1: "", line2: "" };
  }

  const chars = Array.from(normalized);
  if (chars.length <= 16) {
    return { line1: normalized, line2: "" };
  }

  const midpoint = Math.ceil(chars.length / 2);
  const minIndex = Math.max(1, Math.min(12, chars.length - 1));
  const maxIndex = Math.max(minIndex, Math.min(chars.length - 1, 18));
  const splitHints = new Set(["，", "。", "、", "：", "；", " ", "-", "｜", "|"]);
  let bestIndex = midpoint;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = minIndex; index <= maxIndex; index++) {
    const prev = chars[index - 1] ?? "";
    const next = chars[index] ?? "";
    const left = chars.slice(0, index).join("").trim();
    const right = chars.slice(index).join("").trim();
    if (left.length === 0 || right.length === 0) continue;

    let score = Math.abs(left.length - right.length);
    if (splitHints.has(prev) || splitHints.has(next)) score -= 1.5;
    if (index > 18 || left.length > 18 || right.length > 18) score += 4;

    if (score < bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  }

  return {
    line1: chars.slice(0, bestIndex).join("").trim(),
    line2: chars.slice(bestIndex).join("").trim(),
  };
}

export function runRenderCardCli(argv: string[]): void {
  const parsed = parseArgs(argv);
  const template = getArg(parsed, "template", "poster-3-4");
  const outPath = requireArg(parsed, "out");
  let line1 = getArg(parsed, "line1");
  let line2 = getArg(parsed, "line2");
  let line3 = getArg(parsed, "line3");
  let hl2 = hasFlag(parsed, "hl2");
  let hl3 = hasFlag(parsed, "hl3");
  const text = getArg(parsed, "text").replace(/\\n/g, "\n");
  const highlight = getArg(parsed, "highlight", "#22a854");
  const bg = getArg(parsed, "bg", "#e6f5ef");
  const footer = getArg(parsed, "footer", "公众号 · 早早集市");
  const fallbackIcon = getArg(parsed, "fallback-icon");
  const highlightWords = getArg(parsed, "highlight-words");
  const tips: TipItem[] = getArgs(parsed, "tip").map(raw => {
    const sep = raw.indexOf("::");
    if (sep === -1) return { title: raw.trim(), description: "" };
    return { title: raw.slice(0, sep).trim(), description: raw.slice(sep + 2).trim() };
  });

  if (template === "wechat-cover-split") {
    if (!line1 && !line2 && !line3 && text.trim().length > 0) {
      const split = splitWechatTitle(text);
      line1 = split.line1;
      line2 = split.line2;
    }
    const lines = [line1, line2, line3].filter(Boolean);
    line1 = lines[0] ?? "";
    line2 = lines.slice(1).join("");
    line3 = "";
    hl2 = hl2 || hl3;
    hl3 = false;
  }

  const chromePath = findChrome();
  if (chromePath === null) {
    throw new Error("Chrome/Chromium not found");
  }
  const usesPretext = template === "poster-3-4" || template === "wechat-cover-split" || template === "tips-3-4";

  const iconPath = resolveInputPath(getArg(parsed, "icon") || detectIcon(template, text, line1, line2, line3, fallbackIcon));
  const templatePath = join(TEMPLATES_DIR, `${template}.html`);
  const templateHtml = readUtf8(templatePath);

  const debugArgsPath = process.env.TEST_RENDER_CARD_ARGS_PATH;
  if (debugArgsPath) {
    ensureParentDir(debugArgsPath);
    writeFileSync(debugArgsPath, JSON.stringify(argv), "utf-8");
  }
  if (process.env.TEST_RENDER_CARD_STUB === "1") {
    ensureParentDir(outPath);
    writeFileSync(outPath, "stub", "utf-8");
    return;
  }

  const html = renderTemplate(templateHtml, {
    "{{MAIN_TEXT_LINE1}}": escapeHtml(line1),
    "{{MAIN_TEXT_LINE2}}": escapeHtml(line2),
    "{{MAIN_TEXT_LINE3}}": escapeHtml(line3),
    "{{LINE1_CLASS}}": hasFlag(parsed, "hl1") ? "highlight" : "",
    "{{LINE2_CLASS}}": hl2 ? "highlight" : "",
    "{{LINE3_CLASS}}": hl3 ? "highlight" : "",
    "{{HIGHLIGHT_COLOR}}": highlight,
    "{{BG_COLOR}}": bg,
    "{{FOOTER_TEXT}}": escapeHtml(footer),
    "{{ICON_PATH}}": iconPath,
    "{{FONT_PATH}}": join(FONTS_DIR, "AlimamaShuHeiTi-Bold.ttf"),
    "{{AVATAR_PATH}}": join(ICONS_DIR, "logo.svg"),
    "{{POSTER_CONFIG_JSON}}": serializePosterConfig(
      buildPosterConfig({
        text,
        line1,
        line2,
        line3,
        hl1: hasFlag(parsed, "hl1"),
        hl2,
        hl3,
        highlightWords,
        highlightColor: highlight,
        tips,
      }),
    ),
    "{{PRETEXT_MODULE_URL}}": pathToFileURL(
      join(PACKAGE_ROOT, "node_modules/@chenglou/pretext/dist/layout.js"),
    ).href,
  });

  const size = SIZE_MAP[template] ?? DEFAULT_SIZE;
  ensureParentDir(outPath);

  if (template === "wechat-cover-split") {
    const rawPath = outPath.replace(/(\.[^.]+)?$/, ".raw$1");
    screenshotHtml({
      chromePath,
      html,
      outPath: rawPath,
      width: size.width,
      height: size.height + WECHAT_SPLIT_WINDOW_EXTRA_HEIGHT,
      virtualTimeBudgetMs: usesPretext ? PRETEXT_SCREENSHOT_VIRTUAL_TIME_BUDGET_MS : undefined,
    });
    cropTop({
      inputPath: rawPath,
      outPath,
      width: size.width,
      height: size.height,
    });
    rmSync(rawPath, { force: true });
    printSaved(outPath);
    return;
  }

  screenshotHtml({
    chromePath,
    html,
    outPath,
    width: size.width,
    height: size.height,
    virtualTimeBudgetMs: usesPretext ? PRETEXT_SCREENSHOT_VIRTUAL_TIME_BUDGET_MS : undefined,
  });
  printSaved(outPath);
}

if (import.meta.main) {
  runRenderCardCli(process.argv.slice(2));
}
