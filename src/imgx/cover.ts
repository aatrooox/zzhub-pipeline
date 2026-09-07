import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { imageSize } from "image-size";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { resolveConfigRelativePath } from "../config";
import { BUILTIN_FONTS, ensureFonts } from "../runtime-paths";
import type { CoverImage, ResolvedCoverTheme } from "../schema/cover-theme";
import { parseInlineText, splitCoverText } from "./inline-text";
import { ASSETS_DIR, FONTS_DIR, TEMPLATES_DIR, escapeHtml, readUtf8, renderTemplate } from "./runtime";
import { screenshotReadyHtml } from "./chrome-render";
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

/** 素材先固定为本地文件；浏览器负责最终解码检查。 */
export async function resolveCoverImage(src: string, directory: string, index: number): Promise<string> {
  let path: string | undefined;
  let data: Buffer;
  if (/^https?:\/\//i.test(src)) {
    const response = await fetch(src, { signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`封面素材下载失败：HTTP ${response.status}`);
    if (Number(response.headers.get("content-length")) > MAX_IMAGE_BYTES) {
      await response.body?.cancel();
      throw new Error("封面素材不能超过 20 MiB");
    }
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    if (!response.body) throw new Error("封面素材响应为空");
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > MAX_IMAGE_BYTES) throw new Error("封面素材不能超过 20 MiB");
      chunks.push(chunk);
    }
    data = Buffer.concat(chunks);
  } else {
    if (/^[a-z][a-z\d+.-]*:\/\//i.test(src)) throw new Error("封面素材仅支持本地路径或 HTTP(S) URL");
    path = resolveConfigRelativePath(src)!;
    const info = await stat(path);
    if (!info.isFile()) throw new Error("封面素材必须是图片文件");
    if (info.size > MAX_IMAGE_BYTES) throw new Error("封面素材不能超过 20 MiB");
    data = await readFile(path);
  }
  let size: ReturnType<typeof imageSize>;
  try { size = imageSize(data); }
  catch { throw new Error("封面素材不是有效图片"); }
  if (!size.width || !size.height || size.width * size.height > 80_000_000) throw new Error("封面素材图片像素超过 8000 万，或尺寸无效");
  if (!size.type || !["png", "jpg", "webp", "svg"].includes(size.type)) throw new Error("封面素材支持 PNG、JPEG、WebP、SVG");
  // 本地素材也做快照，避免 App 在排版与截图之间替换原文件。
  path = join(directory, `image-${index}.${size.type}`);
  await writeFile(path, data);
  return pathToFileURL(path).href;
}

function inlineHtml(text: string, words: string[]): string {
  return parseInlineText(text, words).map(run => {
    let html = escapeHtml(run.text);
    if (run.italic) html = `<em>${html}</em>`;
    if (run.bold) html = `<strong>${html}</strong>`;
    return run.highlight ? `<span class="highlight">${html}</span>` : html;
  }).join("");
}

/** 同一套模板参数同时用于独立预览和工作流封面。 */
export async function renderThemedCover(input: {
  chromePath: string; outPath: string; text: string; footer: string; iconPath: string;
  theme: ResolvedCoverTheme; highlightWords: string[];
}): Promise<{ path: string; width: number; height: number; themeId: string }> {
  const { theme } = input;
  const fontFamilies = [...new Set(Object.values(theme.typography).map(font => font.fontFamily))];
  const usedFonts = fontFamilies.flatMap(family => Object.hasOwn(BUILTIN_FONTS, family) ? [[family, BUILTIN_FONTS[family]!]] : []);
  await ensureFonts(usedFonts.map(([, file]) => file!));
  const width = theme.format === "poster-3-4" ? 900 : 1340;
  const height = theme.format === "poster-3-4" ? 1200 : 400;
  const { title, subtitle } = splitCoverText(input.text);
  if (!title) throw new Error("封面标题不能为空");
  const directory = await mkdtemp(join(tmpdir(), "zzhub-cover-"));
  try {
    const materialCache = new Map<string, Promise<string>>();
    const material = (src: string) => {
      if (!materialCache.has(src)) materialCache.set(src, resolveCoverImage(src, directory, materialCache.size));
      return materialCache.get(src)!;
    };
    async function imageLayer(layer: CoverImage | null, className: string): Promise<string> {
      if (!layer) return "";
      const src = await material(layer.src);
      return `<img class="layer ${className}" src="${escapeHtml(src)}" alt="" style="object-fit:${layer.fit};object-position:${layer.position.x}% ${layer.position.y}%;opacity:${layer.opacity}">`;
    }
    const assets = await Promise.allSettled([
      imageLayer(theme.background.image, "background-image"),
      imageLayer(theme.decoration.image, "decoration-image"),
      input.iconPath ? material(input.iconPath) : Promise.resolve(""),
    ]);
    const failed = assets.find(result => result.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    const [backgroundImage, decorationImage, icon] = assets.map(result => result.status === "fulfilled" ? result.value : "");
    const fill = theme.background.fill;
    const stops = fill.type === "solid" ? "" : fill.stops.map(stop => `${stop.color} ${stop.offset}%`).join(",");
    const background = fill.type === "solid" ? fill.color : fill.type === "linear" ? `linear-gradient(${fill.angle}deg,${stops})` : `radial-gradient(at ${fill.position.x}% ${fill.position.y}%,${stops})`;
    const area = theme.layout.safeArea;
    const variables = [
      `--width:${width}px`, `--height:${height}px`, `--copy-width:${theme.format === "poster-3-4" ? 900 : 940}px`,
      `--background:${background}`, `--text:${theme.colors.text}`, `--accent:${theme.colors.accent}`, `--muted:${theme.colors.muted}`,
      `--top:${area.top}px`, `--right:${area.right}px`, `--bottom:${area.bottom}px`, `--left:${area.left}px`,
      `--align:${theme.layout.textAlign}`, `--vertical:${({ top: "flex-start", center: "center", bottom: "flex-end" })[theme.layout.verticalAlign]}`,
      `--decoration:${theme.decoration.color}`, `--decoration-opacity:${theme.decoration.opacity}`, `--decoration-size:${theme.decoration.size}px`,
      `--block-gap:${theme.format === "poster-3-4" ? 32 : 16}px`,
      ...Object.entries(theme.typography).flatMap(([role, font]) => [
        `--${role}-font:${["system-ui", "sans-serif", "serif", "monospace"].includes(font.fontFamily) ? font.fontFamily : '"' + font.fontFamily + '"'}`, `--${role}-size:${font.fontSize}px`, `--${role}-weight:${font.fontWeight}`,
        `--${role}-leading:${font.lineHeight}`, `--${role}-tracking:${font.letterSpacing}px`,
      ]),
    ].join(";");
    const fontFaces = usedFonts.map(([family, file]) => `@font-face{font-family:"${family}";src:url("${pathToFileURL(join(FONTS_DIR, file!)).href}")}`).join("\n");
    const overlay = theme.background.overlay;
    const html = renderTemplate(readUtf8(join(TEMPLATES_DIR, theme.format + ".html")), {
      "{{COVER_CSS}}": fontFaces + "\n" + readUtf8(join(ASSETS_DIR, "browser/cover.css")),
      "{{COVER_STYLE}}": escapeHtml(variables),
      "{{COVER_LAYERS}}": backgroundImage + (overlay ? `<div class="layer tint" style="background:${overlay.color};opacity:${overlay.opacity}"></div>` : "")
        + `<div class="layer pattern pattern-${theme.decoration.pattern}"></div>` + decorationImage,
      "{{TITLE_HTML}}": inlineHtml(title, input.highlightWords),
      "{{SUBTITLE_HTML}}": inlineHtml(subtitle, input.highlightWords),
      "{{FOOTER_TEXT}}": escapeHtml(input.footer),
      "{{BRAND_IMAGE}}": icon ? `<img src="${escapeHtml(icon)}" alt="">` : "",
      "{{COVER_CONFIG}}": JSON.stringify(theme).replaceAll("<", "\\u003c").replaceAll("&", "\\u0026"),
      "{{COVER_SCRIPT_URL}}": pathToFileURL(join(ASSETS_DIR, "browser/cover.js")).href,
    });
    await screenshotReadyHtml({ chromePath: input.chromePath, html, outPath: input.outPath, width, height, cover: true });
    return { path: input.outPath, width, height, themeId: theme.id };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
