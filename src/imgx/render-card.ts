#!/usr/bin/env bun
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { getArg, getArgs, hasFlag, parseArgs, requireArg } from "./cli";
import { buildPosterConfig, serializePosterConfig, type TipItem } from "./poster-recipe";
import { loadConfig } from "../config";
import { resolveBrandLogo, resolveRenderBranding } from "../render-branding";
import { CoverColorSchema, resolveCoverTheme, type ResolvedCoverTheme } from "../schema/cover-theme";
import { ensureFonts } from "../runtime-paths";
import { printResult } from "../output";
import { renderThemedCover } from "./cover";
import { PACKAGE_ROOT, ensureParentDir, escapeHtml, findChrome, FONTS_DIR, printSaved, readUtf8, renderTemplate, resolveInputPath, TEMPLATES_DIR } from "./runtime";
import { screenshotReadyHtml } from "./chrome-render";
import { notifyProgress } from "../monitor/recorder";
import type { MonitorProgress } from "../monitor/types";

/** 独立预览与内置适配器共用封面入口，显式参数优先于主题。 */
export async function runRenderCardCli(argv: string[], onProgress?: (progress: MonitorProgress) => void, suppliedTheme?: ResolvedCoverTheme): Promise<void> {
  const parsed = parseArgs(argv);
  if (hasFlag(parsed, "help")) {
    printResult("Usage: zzp imgx render-card --template poster-3-4|wechat-cover-split --text TITLE --out FILE [--cover-theme ID] [--account ID] [--json]\nTheme config: zzp config --key render.cover --json\nTheme schema: zzp config --schema --key render.cover", data => String(data));
    return;
  }
  const template = getArg(parsed, "template", "poster-3-4");
  const outPath = resolveInputPath(requireArg(parsed, "out"));
  const text = getArg(parsed, "text").replace(/\\n/g, "\n");
  const line1 = getArg(parsed, "line1");
  const line2 = getArg(parsed, "line2");
  const line3 = getArg(parsed, "line3");
  const source = text || [line1, line2, line3].filter(Boolean).join("\n");
  const highlightWords = getArg(parsed, "highlight-words");
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
  const chromePath = findChrome();
  if (!chromePath) throw new Error("Chrome/Chromium not found");
  notifyProgress(onProgress, { stage: "render.cover", message: "正在生成封面", current: 0, total: 1, unit: "pages" });
  const config = loadConfig();
  const account = getArg(parsed, "account", config.wx.defaultAccount);
  const branding = resolveRenderBranding(config, account);
  const footer = getArg(parsed, "footer", branding.footerText);
  const iconPath = parsed.flags.has("icon") ? resolveBrandLogo(getArg(parsed, "icon"), false)
    : parsed.flags.has("fallback-icon") ? resolveBrandLogo(getArg(parsed, "fallback-icon"), false) : branding.logo;

  if (template === "poster-3-4" || template === "wechat-cover-split") {
    if (hasFlag(parsed, "cover-theme")) throw new Error("--cover-theme 需要主题 ID");
    const theme = structuredClone(suppliedTheme ?? resolveCoverTheme(config.render.cover, template, account, getArg(parsed, "cover-theme") || null));
    if (theme.format !== template) throw new Error("封面主题尺寸与模板不一致");
    const bg = getArg(parsed, "bg");
    const highlight = getArg(parsed, "highlight");
    if (bg) theme.background.fill = { type: "solid", color: CoverColorSchema.parse(bg) };
    if (highlight) theme.colors.accent = CoverColorSchema.parse(highlight);
    const words = highlightWords.split(",").filter(Boolean);
    if (hasFlag(parsed, "hl1")) words.push(line1 || source.split("\n")[0]!);
    if (hasFlag(parsed, "hl2") && line2) words.push(line2);
    if (hasFlag(parsed, "hl3") && line3) words.push(line3);
    const result = await renderThemedCover({ chromePath, outPath, text: source, footer, iconPath, theme, highlightWords: words });
    if (hasFlag(parsed, "json")) printResult(result, data => JSON.stringify(data, null, 2));
  } else {
    // tips 保留原有参数契约；主题只应用于两种封面。
    if (template !== "tips-3-4") throw new Error("Unsupported card template: " + template);
    await ensureFonts(["AlimamaShuHeiTi-Bold.ttf"]);
    if (getArg(parsed, "cover-theme")) throw new Error("tips-3-4 不支持封面主题");
    const highlight = getArg(parsed, "highlight", "#22a854");
    const bg = getArg(parsed, "bg", "#e6f5ef");
    const tips: TipItem[] = getArgs(parsed, "tip").map(raw => {
      const separator = raw.indexOf("::");
      return separator < 0 ? { title: raw.trim(), description: "" } : { title: raw.slice(0, separator).trim(), description: raw.slice(separator + 2).trim() };
    });
    const html = renderTemplate(readUtf8(join(TEMPLATES_DIR, "tips-3-4.html")), {
      "{{MAIN_TEXT_LINE1}}": escapeHtml(line1), "{{MAIN_TEXT_LINE2}}": escapeHtml(line2), "{{MAIN_TEXT_LINE3}}": escapeHtml(line3),
      "{{LINE1_CLASS}}": hasFlag(parsed, "hl1") ? "highlight" : "", "{{LINE2_CLASS}}": hasFlag(parsed, "hl2") ? "highlight" : "", "{{LINE3_CLASS}}": hasFlag(parsed, "hl3") ? "highlight" : "",
      "{{HIGHLIGHT_COLOR}}": highlight, "{{BG_COLOR}}": bg, "{{FOOTER_TEXT}}": escapeHtml(footer), "{{ICON_PATH}}": iconPath,
      "{{FONT_PATH}}": join(FONTS_DIR, "AlimamaShuHeiTi-Bold.ttf"), "{{AVATAR_PATH}}": iconPath,
      "{{POSTER_CONFIG_JSON}}": serializePosterConfig(buildPosterConfig({ text, line1, line2, line3, hl1: hasFlag(parsed, "hl1"), hl2: hasFlag(parsed, "hl2"), hl3: hasFlag(parsed, "hl3"), highlightWords, highlightColor: highlight, tips })),
      "{{PRETEXT_MODULE_URL}}": pathToFileURL(join(PACKAGE_ROOT, "node_modules/@chenglou/pretext/dist/layout.js")).href,
    });
    await screenshotReadyHtml({ chromePath, html, outPath, width: 900, height: 1200 });
    if (hasFlag(parsed, "json")) printResult({ path: outPath, width: 900, height: 1200, themeId: null }, data => JSON.stringify(data, null, 2));
  }
  printSaved(outPath);
  notifyProgress(onProgress, { stage: "render.cover", current: 1, total: 1, unit: "pages" });
}

if (import.meta.main) await runRenderCardCli(process.argv.slice(2));
