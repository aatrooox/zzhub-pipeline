import { join } from "node:path";
import {
  escapeHtml,
  FONTS_DIR,
  ICONS_DIR,
  readUtf8,
  renderTemplate,
  resolveInputPath,
  screenshotHtml,
  TEMPLATES_DIR,
} from "./runtime";

export type AsciiPortraitOptions = {
  avatarPath: string;
  bg: string;
  chars: string;
  columns: number;
  fontSize: number;
  lineHeight: number;
  title?: string;
  footer?: string;
  iconPath?: string;
  width?: number;
  height?: number;
  templateName?: "ascii-portrait-3-4" | "ascii-portrait-tile";
};

function serializeConfig(options: AsciiPortraitOptions): string {
  return JSON.stringify({
    avatarPath: options.avatarPath,
    bgColor: options.bg,
    chars: options.chars,
    columns: options.columns,
    fontSize: options.fontSize,
    lineHeight: options.lineHeight,
  })
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026")
    .replaceAll("</script", "<\\/script");
}

export function buildAsciiPortraitHtml(options: AsciiPortraitOptions): string {
  const templateName = options.templateName ?? "ascii-portrait-3-4";
  const template = readUtf8(join(TEMPLATES_DIR, `${templateName}.html`));
  const width = options.width ?? 900;
  const height = options.height ?? 1200;

  return renderTemplate(template, {
    "{{BG_COLOR}}": options.bg,
    "{{TITLE}}": escapeHtml(options.title ?? "ASCII Portrait"),
    "{{FOOTER_TEXT}}": escapeHtml(options.footer ?? "公众号 · 早早集市"),
    "{{ICON_PATH}}": resolveInputPath(options.iconPath ?? join(ICONS_DIR, "logo.svg")),
    "{{AVATAR_PATH}}": resolveInputPath(options.avatarPath),
    "{{ASCII_CONFIG_JSON}}": serializeConfig(options),
    "{{FONT_PATH}}": join(FONTS_DIR, "AlimamaShuHeiTi-Bold.ttf"),
    "{{BODY_FONT_PATH}}": join(FONTS_DIR, "LXGWWenKai-Regular.ttf"),
    "{{CANVAS_WIDTH}}": String(width),
    "{{CANVAS_HEIGHT}}": String(height),
  });
}

export function renderAsciiPortraitPng(options: AsciiPortraitOptions & {
  chromePath: string;
  outPath: string;
}): void {
  const width = options.width ?? 900;
  const height = options.height ?? 1200;
  screenshotHtml({
    chromePath: options.chromePath,
    html: buildAsciiPortraitHtml(options),
    outPath: options.outPath,
    width,
    height,
    virtualTimeBudgetMs: 1800,
  });
}
