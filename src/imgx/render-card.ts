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

function detectIcon(_template: string, _text: string, _line1: string, _line2: string, _line3: string, fallbackIcon: string): string {
  if (fallbackIcon.length > 0) return fallbackIcon;
  return join(ICONS_DIR, "logo.png");
}

function splitWechatTitle(text: string): { line1: string; line2: string } {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length === 0) return { line1: "", line2: "" };

  const chars = Array.from(normalized);
  if (chars.length <= 16) return { line1: normalized, line2: "" };

  // Find all word boundaries: any position where adjacent chars cross
  // script boundaries (CJK↔Latin) or have a space.
  type Candidate = { index: number; score: number };
  const candidates: Candidate[] = [];
  const minIndex = Math.max(2, Math.min(8, chars.length - 2));
  const maxIndex = Math.min(chars.length - 2, 20);

  const CJK_RE = /[一-鿿]/;
  const splitHints = new Set([" ", "，", "。", "、", "：", "；", "-", "｜", "|", "·"]);

  for (let idx = minIndex; idx <= maxIndex; idx++) {
    const left = chars.slice(0, idx).join("").trim();
    const right = chars.slice(idx).join("").trim();
    if (left.length === 0 || right.length === 0) continue;

    let score = 0;

    // 1. Balance penalty (weight reduced — visual balance matters more than
    //    character-count balance for mixed text)
    score += Math.abs(left.length - right.length) * 2;

    // 2. Punctuation / word boundary at split point = strong signal
    const prevChar = chars[idx - 1] ?? "";
    const nextChar = chars[idx] ?? "";

    if (splitHints.has(prevChar)) score -= 25;  // Strong signal: split after
    if (splitHints.has(nextChar)) score -= 20;  // Moderate signal: split before

    // 3. Script boundary bonus: splitting between CJK and Latin is natural
    const prevIsCJK = CJK_RE.test(prevChar);
    const nextIsCJK = CJK_RE.test(nextChar);
    if (prevIsCJK !== nextIsCJK) score -= 10;

    // 4. Word-internal penalty: don't split inside an English word
    const prevIsAlpha = /[A-Za-z]/.test(prevChar);
    const nextIsAlpha = /[A-Za-z]/.test(nextChar);
    if (prevIsAlpha && nextIsAlpha) score += 15;

    // 5. Line length caps (visual estimate: CJK ≈ 2 units, Latin ≈ 1 unit)
    const leftVisual = [...left].reduce((sum, ch) => sum + (CJK_RE.test(ch) ? 2 : 1), 0);
    const rightVisual = [...right].reduce((sum, ch) => sum + (CJK_RE.test(ch) ? 2 : 1), 0);
    if (leftVisual > 28 || rightVisual > 28) score += 15;

    // 6. Slight midpoint preference
    score += Math.abs(idx - chars.length / 2) * 0.5;

    candidates.push({ index: idx, score });
  }

  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0] ?? { index: Math.ceil(chars.length / 2) };

  return {
    line1: chars.slice(0, best.index).join("").trim(),
    line2: chars.slice(best.index).join("").trim(),
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
    "{{AVATAR_PATH}}": join(ICONS_DIR, "logo.png"),
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
