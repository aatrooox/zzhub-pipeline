import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { loadConfig } from "../config";
import { ensureFonts } from "../runtime-paths";
import { resolveBrandLogo, resolveRenderBranding } from "../render-branding";
import { resolveCoverImage } from "./cover";
import { screenshotReadyHtml } from "./chrome-render";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderAsciiPortraitPng } from "./ascii-portrait";
import { getArg, getArgs, getIntArg, hasFlag, parseArgs } from "./cli";
import { paginateBlocks, type FlowBlock, type FlowPage } from "./obstacle-flow";
import { parseInlineText } from "./inline-text";
import { applyGeometryOverrides } from "./geometry";
import {
  getLongformTheme,
  getLongformThemeCssVars,
  applyFontSizeMax,
  getLongformGeometry,
  type LongformTheme,
} from "./longform-theme";
import {
  escapeHtml,
  findChrome,
  FONTS_DIR,
  printSaved,
  readImageSize,
  readUtf8,
  renderTemplate,
  resolveInputPath,
  TEMPLATES_DIR,
} from "./runtime";
import { notifyProgress } from "../monitor/recorder";
import type { MonitorProgress } from "../monitor/types";

const DEFAULT_CONTENT_WIDTH = getLongformGeometry(getLongformTheme("paper-sage")).contentWidth;

function imageShadowStyle(image: BodyImageSpec): string {
  const area = image.width * image.height;
  const maxArea = 720 * 560;
  const t = Math.min(1, Math.max(0, area / maxArea));
  const shadowY = Math.round(8 + t * 16);
  const shadowBlur = Math.round(16 + t * 32);
  return `--img-shadow-y:${shadowY}px;--img-shadow-blur:${shadowBlur}px`;
}

type BodyImageSpec = {
  src: string;
  alt: string;
  caption?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  side?: "left" | "right";
  layoutPreset?: string;
  lockedPosition?: boolean;
  lockedSize?: boolean;
};

type ContentBlock = {
  kind: keyof LongformTheme["bodyStyles"];
  text: string;
  bullet?: string;
};

type LongformPageLayout = FlowPage;

type PageImageSpecInput = {
  src: string;
  alt?: string;
  caption?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  side?: string;
  layout?: string;
};

type PageImageGroupSpecInput = {
  page: number;
  image_layout?: string;
  target_fill_ratio?: number;
  images: PageImageSpecInput[];
};

type PageImageSpecFileInput = {
  default_image_layout?: string;
  target_fill_ratio?: number;
  page_specs?: PageImageGroupSpecInput[];
};

type ExplicitPagePlan = {
  page: number;
  imageLayout: string;
  targetFillRatio: number;
  images: BodyImageSpec[];
};

export type RenderArticlePageSummary = {
  page: number;
  imageCount: number;
  imageSources: string[];
};

export type RenderArticleResult = {
  pageCount: number;
  pages: RenderArticlePageSummary[];
};

function parseIntWithFallback(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.length === 0) return fallback;
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) ? value : fallback;
}

// 保留英文词间空格，只合并重复的行内空白。
function normalizeMixedTextSpacing(text: string): string {
  return text.replace(/[ \t]+/g, " ");
}

function fitImageToBox(
  sourceWidth: number,
  sourceHeight: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { width: maxWidth, height: maxHeight };
  }
  const scale = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function parseContentBlocks(text: string): ContentBlock[] {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const blocks: ContentBlock[] = [];
  let paragraphBuffer: string[] = [];

  function flushParagraph(): void {
    const value = normalizeMixedTextSpacing(paragraphBuffer.join(" ").trim());
    if (value.length > 0) blocks.push({ kind: "paragraph", text: value });
    paragraphBuffer = [];
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.length === 0) {
      flushParagraph();
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push({ kind: heading[1]!.length === 1 ? "heading" : heading[1]!.length === 2 ? "subheading" : "minor-heading", text: normalizeMixedTextSpacing(heading[2]!) });
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      blocks.push({ kind: "quote", text: normalizeMixedTextSpacing(line.replace(/^>\s?/, "").trim()) });
      continue;
    }

    const listItem = line.match(/^(\d+[.)]|[-*+])\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      blocks.push({ kind: "list-item", text: normalizeMixedTextSpacing(listItem[2]!), bullet: /^\d/.test(listItem[1]!) ? listItem[1] : "•" });
      continue;
    }

    paragraphBuffer.push(line);
  }

  flushParagraph();
  return blocks;
}

function normalizeSide(raw: string | undefined): "left" | "right" {
  return raw === "right" ? "right" : "left";
}

function normalizeLayoutPreset(raw: string): string {
  const value = raw.trim().toLowerCase();
  const aliases: Record<string, string> = {
    auto: "auto",
    default: "auto",
    conservative: "auto",
    fill: "fill",
    staggered: "staggered",
    "split-dual": "staggered",
    editorial: "editorial",
    "editorial-float": "editorial",
    "corner-soft": "corner-soft",
    "mid-left": "mid-left",
    "mid-right": "mid-right",
  };
  return aliases[value] ?? "auto";
}

function buildAutoImagePlacement(
  index: number,
  imageWidth: number,
  imageHeight: number,
  layoutPreset: string,
  side: "left" | "right",
): Pick<BodyImageSpec, "x" | "y"> {
  const preset = normalizeLayoutPreset(layoutPreset);
  const horizontalPadding = 24;
  const topTextBuffer = 240;
  const leftX = horizontalPadding;
  const rightX = Math.max(horizontalPadding, DEFAULT_CONTENT_WIDTH - imageWidth - horizontalPadding);

  if (preset === "corner-soft") {
    return {
      x: side === "right" ? rightX : leftX,
      y: topTextBuffer - 24 + index * (imageHeight + 22),
    };
  }

  if (preset === "mid-left") {
    return {
      x: leftX,
      y: 210 + index * (imageHeight + 32),
    };
  }

  if (preset === "mid-right") {
    return {
      x: rightX,
      y: 210 + index * (imageHeight + 32),
    };
  }

  if (preset === "editorial") {
    return {
      x: side === "right" ? rightX : leftX,
      y: topTextBuffer + index * 182 + (index % 2) * 42,
    };
  }

  if (preset === "staggered") {
    const staggerSide = index % 2 === 0 ? side : side === "left" ? "right" : "left";
    return {
      x: staggerSide === "right" ? rightX : leftX,
      y: topTextBuffer - 12 + index * (imageHeight + 64),
    };
  }

  return {
    x: side === "right" ? rightX : leftX,
    y: topTextBuffer + index * (imageHeight + 30),
  };
}

function buildResolvedBodyImageSpec(
  input: PageImageSpecInput,
  index: number,
  fallbackLayout: string,
): BodyImageSpec {
  const resolvedSrc = resolveInputPath(input.src);
  const intrinsicSize = readImageSize(resolvedSrc);
  const widthRaw = input.width === undefined ? undefined : String(input.width);
  const heightRaw = input.height === undefined ? undefined : String(input.height);
  // Resolve layout early so the size calculation below can use it.
  const layoutPreset = input.layout?.trim() || fallbackLayout;

  // Fill layout: place a conservative full-width placeholder near the bottom
  // of the page. In spec-driven mode this becomes the starting point for the
  // page-local image scaling search; in auto-flow mode it still behaves as a
  // bottom obstacle that reserves space for the image.
  if (normalizeLayoutPreset(layoutPreset) === "fill") {
    // Use a conservative placeholder height; the real height is determined
    // later by the page-local sizing pass when spec-driven layout is active.
    const FILL_PLACEHOLDER_HEIGHT = 200;
    const stageH = getLongformGeometry(getLongformTheme("paper-sage")).contentStageHeight;
    return {
      src: resolveInputPath(input.src),
      alt: input.alt ?? "body image",
      caption: input.caption ?? "",
      x: 0,
      y: stageH - FILL_PLACEHOLDER_HEIGHT,
      width: DEFAULT_CONTENT_WIDTH,
      height: FILL_PLACEHOLDER_HEIGHT,
      layoutPreset,
      side: "left",
      lockedPosition: false,
      lockedSize: false,
    };
  }

  let width = 210;
  let height = 210;

  if (widthRaw && heightRaw) {
    width = parseIntWithFallback(widthRaw, 210);
    height = parseIntWithFallback(heightRaw, 210);
  } else if (intrinsicSize !== null && widthRaw) {
    width = parseIntWithFallback(widthRaw, 210);
    height = Math.max(1, Math.round(width * (intrinsicSize.height / intrinsicSize.width)));
  } else if (intrinsicSize !== null && heightRaw) {
    height = parseIntWithFallback(heightRaw, 210);
    width = Math.max(1, Math.round(height * (intrinsicSize.width / intrinsicSize.height)));
  } else if (intrinsicSize !== null) {
    // For side-by-side layouts (staggered/editorial/corner-soft), the image
    // occupies roughly half the content width as an obstacle.  Fitting it into
    // a fixed 210×210 box ignores the actual available width and can produce
    // tall images that push too much content onto extra pages.
    //
    // Instead, compute max dimensions based on the layout:
    //   - Half-width layouts: maxW = half content width minus padding; maxH capped at 200
    //   - Full-width / unknown layouts: fall back to 210×210 (previous behaviour)
    const halfWidth = Math.floor((DEFAULT_CONTENT_WIDTH - 24 * 2) / 2); // ≈ 336
    const normalizedPreset = normalizeLayoutPreset(layoutPreset);
    const isHalfWidthLayout = normalizedPreset === "staggered"
      || normalizedPreset === "editorial"
      || normalizedPreset === "corner-soft"
      || normalizedPreset === "mid-left"
      || normalizedPreset === "mid-right";
    const boxW = isHalfWidthLayout ? halfWidth : 210;
    const boxH = isHalfWidthLayout ? 200 : 210;
    const fitted = fitImageToBox(intrinsicSize.width, intrinsicSize.height, boxW, boxH);
    width = fitted.width;
    height = fitted.height;
  } else {
    width = parseIntWithFallback(widthRaw, 210);
    height = parseIntWithFallback(heightRaw, 210);
  }

  const side = normalizeSide(input.side);
  const autoPlacement = buildAutoImagePlacement(index, width, height, layoutPreset, side);
  const x = input.x === undefined ? autoPlacement.x : parseIntWithFallback(String(input.x), autoPlacement.x);
  const y = input.y === undefined ? autoPlacement.y : parseIntWithFallback(String(input.y), autoPlacement.y);
  return {
    src: resolvedSrc,
    alt: input.alt ?? "body image",
    caption: input.caption ?? "",
    x,
    y,
    width,
    height,
    side,
    layoutPreset,
    lockedPosition: input.x !== undefined || input.y !== undefined,
    lockedSize: input.width !== undefined || input.height !== undefined,
  };
}

function clampFillRatio(raw: number | undefined, fallback: number): number {
  if (!Number.isFinite(raw)) {
    return fallback;
  }
  return Math.min(0.95, Math.max(0.35, raw!));
}

function buildExplicitPagePlans(parsed: ReturnType<typeof parseArgs>): ExplicitPagePlan[] | null {
  const specFile = getArg(parsed, "page-image-spec-file");
  if (specFile.length === 0) {
    return null;
  }

  const raw = JSON.parse(readFileSync(resolveInputPath(specFile), "utf8")) as PageImageSpecFileInput;
  const defaultLayout = raw.default_image_layout?.trim() || getArg(parsed, "image-layout", "auto");
  const defaultTargetFillRatio = clampFillRatio(raw.target_fill_ratio, 0.8);
  const pageSpecs = Array.isArray(raw.page_specs) ? raw.page_specs : [];
  return pageSpecs
    .map((pageSpec) => {
      const page = Number.isFinite(pageSpec.page) ? Math.max(1, Math.floor(pageSpec.page)) : 0;
      if (page < 1) {
        return null;
      }
      const pageLayout = pageSpec.image_layout?.trim() || defaultLayout;
      const images = Array.isArray(pageSpec.images) ? pageSpec.images : [];
      return {
        page,
        imageLayout: pageLayout,
        targetFillRatio: clampFillRatio(pageSpec.target_fill_ratio, defaultTargetFillRatio),
        images: images
          .map((image, index) => buildResolvedBodyImageSpec(image, index, pageLayout))
          .filter((image) => image.src.length > 0),
      } satisfies ExplicitPagePlan;
    })
    .filter((item): item is ExplicitPagePlan => item !== null)
    .sort((a, b) => a.page - b.page);
}

function buildBodyImages(parsed: ReturnType<typeof parseArgs>): BodyImageSpec[] {
  const sources = getArgs(parsed, "body-image");
  const alts = getArgs(parsed, "body-image-alt");
  const captions = getArgs(parsed, "image-caption");
  const xs = getArgs(parsed, "image-x");
  const ys = getArgs(parsed, "image-y");
  const widths = getArgs(parsed, "image-width");
  const heights = getArgs(parsed, "image-height");
  const sides = getArgs(parsed, "image-side");
  const layoutPreset = getArg(parsed, "image-layout", "auto");

  return sources
    .map((src, index) =>
      buildResolvedBodyImageSpec(
        {
          src,
          alt: alts[index],
          caption: captions[index],
          x: xs[index] === undefined ? undefined : Number(xs[index]),
          y: ys[index] === undefined ? undefined : Number(ys[index]),
          width: widths[index] === undefined ? undefined : Number(widths[index]),
          height: heights[index] === undefined ? undefined : Number(heights[index]),
          side: sides[index],
          layout: layoutPreset,
        },
        index,
        layoutPreset,
      )
    )
    .filter(image => image.src.length > 0);
}

function buildAsciiBodyImages(parsed: ReturnType<typeof parseArgs>, chromePath: string): BodyImageSpec[] {
  const avatars = getArgs(parsed, "body-ascii-portrait");
  const captions = getArgs(parsed, "ascii-caption");
  const xs = getArgs(parsed, "ascii-x");
  const ys = getArgs(parsed, "ascii-y");
  const widths = getArgs(parsed, "ascii-width");
  const heights = getArgs(parsed, "ascii-height");
  const sides = getArgs(parsed, "ascii-side");
  const layouts = getArgs(parsed, "ascii-layout");
  const bg = getArg(parsed, "ascii-bg", "#111111");
  const chars = getArg(parsed, "ascii-chars", "@#W$9876543210?!abc;:+=-,._ ");
  const columns = getIntArg(parsed, "ascii-columns", 34);

  return avatars.map((avatarPath, index) => {
    const width = parseIntWithFallback(widths[index], 210);
    const height = parseIntWithFallback(heights[index], 210);
    const side = normalizeSide(sides[index]);
    const layoutPreset = layouts[index] ?? "editorial";
    const autoPlacement = buildAutoImagePlacement(index, width, height, layoutPreset, side);
    const x = parseIntWithFallback(xs[index], autoPlacement.x);
    const y = parseIntWithFallback(ys[index], autoPlacement.y);
    const outPath = join(tmpdir(), `ascii-body-${Date.now()}-${index}.png`);
    renderAsciiPortraitPng({
      chromePath,
      outPath,
      avatarPath: resolveInputPath(avatarPath),
      bg,
      chars,
      columns,
      fontSize: Math.max(9, Math.round(width / 18)),
      lineHeight: Math.max(10, Math.round(height / 18)),
      width,
      height,
      templateName: "ascii-portrait-tile",
    });
    return {
      src: outPath,
      alt: "ascii portrait",
      caption: captions[index] ?? "",
      x,
      y,
      width,
      height,
      side,
      layoutPreset,
      lockedPosition: xs[index] !== undefined || ys[index] !== undefined,
      lockedSize: widths[index] !== undefined || heights[index] !== undefined,
    };
  });
}

export function toFlowBlocks(blocks: ContentBlock[], theme: LongformTheme, highlightWords: string[] = []): FlowBlock[] {
  return blocks.map(block => ({
    ...theme.bodyStyles[block.kind],
    text: block.text,
    runs: parseInlineText(block.text, highlightWords),
    bullet: block.kind === "list-item" ? block.bullet ?? "•" : undefined,
    textIndent: block.kind === "list-item" ? 44 : block.kind === "quote" ? 24 : 0,
    keepWithNext: ["heading", "subheading", "minor-heading"].includes(block.kind),
  }));
}

function parseChinesePageNumber(raw: string): number | null {
  const digits: Record<string, number> = {
    "零": 0,
    "一": 1,
    "二": 2,
    "两": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
  };
  if (/^\d+$/.test(raw)) {
    return Number.parseInt(raw, 10);
  }
  let total = 0;
  let current = 0;
  for (const char of raw) {
    if (char === "百") {
      total += (current || 1) * 100;
      current = 0;
      continue;
    }
    if (char === "十") {
      total += (current || 1) * 10;
      current = 0;
      continue;
    }
    const digit = digits[char];
    if (digit === undefined) {
      return null;
    }
    current = digit;
  }
  return total + current;
}

function parsePageMarkerLine(line: string): number | null {
  const trimmed = line.trim();
  const chinese = trimmed.match(/^【第([一二三四五六七八九十百两\d]+)页】$/);
  if (chinese) {
    return parseChinesePageNumber(chinese[1] ?? "");
  }
  const english = trimmed.match(/^【Page\s*(\d+)】$/i);
  if (english) {
    return Number.parseInt(english[1] ?? "0", 10);
  }
  return null;
}

export function splitTextByPageMarkers(text: string): Array<{ page: number; text: string }> {
  const lines = text.replaceAll("\r\n", "\n").split("\n");
  const segments = new Map<number, string[]>();
  const prelude: string[] = [];
  let currentPage: number | null = null;

  for (const line of lines) {
    const page = parsePageMarkerLine(line);
    if (page !== null && page > 0) {
      currentPage = page;
      if (!segments.has(page)) {
        segments.set(page, []);
      }
      continue;
    }
    if (currentPage === null) {
      prelude.push(line);
      continue;
    }
    segments.get(currentPage)!.push(line);
  }

  if (segments.size === 0) {
    return [];
  }

  const firstPage = [...segments.keys()].sort((a, b) => a - b)[0] ?? 1;
  if (prelude.some((line) => line.trim().length > 0)) {
    const target = segments.get(firstPage) ?? [];
    segments.set(firstPage, [...prelude, ...target]);
  }

  return [...segments.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([page, pageLines]) => ({
      page,
      text: pageLines.join("\n").trim(),
    }));
}

function stripPageMarkerLines(text: string): string {
  return text
    .replaceAll("\r\n", "\n")
    .split("\n")
    .filter((line) => parsePageMarkerLine(line) === null)
    .join("\n");
}

function materializeExplicitPagePlans(
  explicitPagePlans: ExplicitPagePlan[],
  targetPageCount: number,
): ExplicitPagePlan[] {
  const fallbackLayout = explicitPagePlans[0]?.imageLayout ?? "auto";
  const fallbackFillRatio = explicitPagePlans[0]?.targetFillRatio ?? 0.8;
  const planMap = new Map(explicitPagePlans.map((plan) => [plan.page, plan]));
  return Array.from({ length: targetPageCount }, (_, index) => {
    const page = index + 1;
    return planMap.get(page) ?? {
      page,
      imageLayout: fallbackLayout,
      targetFillRatio: fallbackFillRatio,
      images: [],
    };
  });
}

function computePageFillRatio(
  page: LongformPageLayout,
  theme: LongformTheme,
): number {
  const geometry = getLongformGeometry(theme);
  const textBottom = page.lines.reduce((max, line) => {
    const lineHeight = line.lineHeight;
    return Math.max(max, line.y + lineHeight);
  }, 0);
  const imageBottom = page.images.reduce((max, image) => {
    const captionExtra = image.caption ? (image.captionHeight ?? 50) : 0;
    return Math.max(max, image.y + image.height + captionExtra);
  }, 0);
  const contentEnd = Math.max(textBottom, imageBottom);
  if (geometry.contentStageHeight <= 0) {
    return 0;
  }
  return Math.min(1, Math.max(0, contentEnd / geometry.contentStageHeight));
}

function scalePageImages(
  images: BodyImageSpec[],
  scale: number,
  theme: LongformTheme,
): BodyImageSpec[] {
  const geometry = getLongformGeometry(theme);
  const halfWidth = Math.floor((geometry.contentWidth - 24 * 2) / 2);
  return images.map((image, index) => {
    if (image.lockedSize && image.lockedPosition) {
      return image;
    }

    const preset = normalizeLayoutPreset(image.layoutPreset ?? "auto");
    let width = image.width;
    let height = image.height;

    if (!image.lockedSize) {
      if (preset === "fill") {
        // Preserve the original aspect ratio strictly — fit the image into a
        // box of (contentWidth × maxFillHeight) using contain semantics so
        // neither dimension is ever stretched or clipped.
        const intrinsic = readImageSize(image.src);
        const intrinsicW = intrinsic !== null && intrinsic.width > 0 ? intrinsic.width : image.width;
        const intrinsicH = intrinsic !== null && intrinsic.height > 0 ? intrinsic.height : image.height;
        const maxFillW = geometry.contentWidth;
        const maxFillH = Math.floor(geometry.contentStageHeight * 0.60); // cap at 60% of stage height
        const scaleByW = maxFillW / intrinsicW;
        const scaleByH = maxFillH / intrinsicH;
        const fitScale = Math.min(scaleByW, scaleByH, 1) * Math.min(1, scale); // never upscale beyond intrinsic
        width = Math.max(1, Math.round(intrinsicW * fitScale));
        height = Math.max(1, Math.round(intrinsicH * fitScale));
      } else {
        const maxWidth = preset === "staggered" || preset === "editorial" || preset === "corner-soft" || preset === "mid-left" || preset === "mid-right"
          ? halfWidth
          : geometry.contentWidth;
        const maxHeight = preset === "staggered" || preset === "editorial" || preset === "corner-soft" || preset === "mid-left" || preset === "mid-right"
          ? Math.max(180, Math.floor(geometry.contentStageHeight * 0.6))
          : Math.max(220, Math.floor(geometry.contentStageHeight * 0.72));
        // Preserve the original aspect ratio — use the intrinsic image size
        // (not the 210×210 placeholder) and fit into the maxWidth×maxHeight
        // box with contain semantics.
        const intrinsic = readImageSize(image.src);
        const intrinsicW = intrinsic !== null && intrinsic.width > 0 ? intrinsic.width : image.width;
        const intrinsicH = intrinsic !== null && intrinsic.height > 0 ? intrinsic.height : image.height;
        const scaleByW = maxWidth / intrinsicW;
        const scaleByH = maxHeight / intrinsicH;
        const fitScale = Math.min(scaleByW, scaleByH) * Math.min(1, scale); // contain semantics
        width = Math.max(1, Math.round(intrinsicW * fitScale));
        height = Math.max(1, Math.round(intrinsicH * fitScale));
      }
    }

    let x = image.x;
    let y = image.y;
    if (!image.lockedPosition) {
      if (preset === "fill") {
        x = 0;
        y = Math.max(0, geometry.contentStageHeight - height);
      } else {
        const autoPlacement = buildAutoImagePlacement(index, width, height, image.layoutPreset ?? "auto", image.side ?? "left");
        x = autoPlacement.x;
        y = autoPlacement.y;
      }
    }

    return {
      ...image,
      width,
      height,
      x,
      y,
    };
  });
}

type SpecPageMeasure = {
  layout: LongformPageLayout;
  fit: boolean;
  fillRatio: number;
  scale: number;
};

function measureLongformPages(params: {
  flowBlocks: FlowBlock[];
  bodyImages: BodyImageSpec[];
  pageImageGroups?: BodyImageSpec[][] | null;
  pageImageLimit?: number;
  theme: LongformTheme;
  contentHeight?: number;
}): LongformPageLayout[] {
  const geometry = getLongformGeometry(params.theme);
  return paginateBlocks(params.flowBlocks, geometry.contentWidth, Math.min(params.contentHeight ?? geometry.contentStageHeight, geometry.contentStageHeight), params.bodyImages, {
    pageImageLimit: params.pageImageLimit ?? 2,
    pageImageGroups: params.pageImageGroups ?? null,
  });
}

function measureSpecPage(
  flowBlocks: FlowBlock[],
  images: BodyImageSpec[],
  theme: LongformTheme,
  scale: number,
): SpecPageMeasure {
  const pages = measureLongformPages({
    flowBlocks, bodyImages: images, pageImageLimit: Math.max(images.length, 1), theme,
  });
  const layout = pages[0] ?? { lines: [], images: [], textBottom: 0 };
  return { layout, fit: pages.length <= 1, fillRatio: computePageFillRatio(layout, theme), scale };
}

function optimizeSpecPageLayout(params: {
  chromePath: string;
  flowBlocks: FlowBlock[];
  pagePlan: ExplicitPagePlan;
  theme: LongformTheme;
}): SpecPageMeasure | null {
  const { flowBlocks, pagePlan, theme } = params;
  const baseImages = pagePlan.images;
  const targetFillRatio = pagePlan.targetFillRatio;
  if (baseImages.length === 0) {
    const measured = measureSpecPage(flowBlocks, [], theme, 1);
    return measured.fit ? measured : null;
  }

  const cache = new Map<string, SpecPageMeasure>();
  const evaluate = (scale: number): SpecPageMeasure => {
    const key = scale.toFixed(4);
    const cached = cache.get(key);
    if (cached) {
      return cached;
    }
    const scaledImages = scalePageImages(baseImages, scale, theme);
    const measured = measureSpecPage(flowBlocks, scaledImages, theme, scale);
    cache.set(key, measured);
    return measured;
  };

  const minimum = evaluate(0.45);
  if (!minimum.fit) {
    return null;
  }

  let best = minimum;
  for (const scale of [0.6, 0.75, 0.9, 1]) {
    const measured = evaluate(scale);
    if (!measured.fit) {
      continue;
    }
    const measuredDelta = Math.abs(measured.fillRatio - targetFillRatio);
    const bestDelta = Math.abs(best.fillRatio - targetFillRatio);
    if (
      measuredDelta < bestDelta ||
      (measuredDelta === bestDelta && measured.scale > best.scale)
    ) {
      best = measured;
    }
  }

  let low = minimum.scale;
  let high = 1;
  for (let index = 0; index < 7; index += 1) {
    const mid = (low + high) / 2;
    const measured = evaluate(mid);
    if (!measured.fit) {
      high = mid;
      continue;
    }
    const measuredDelta = Math.abs(measured.fillRatio - targetFillRatio);
    const bestDelta = Math.abs(best.fillRatio - targetFillRatio);
    if (
      measuredDelta < bestDelta ||
      (measuredDelta === bestDelta && measured.scale > best.scale)
    ) {
      best = measured;
    }
    if (measured.fillRatio <= targetFillRatio + 0.02) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return best;
}

function buildSpecDrivenPagesFromSegments(params: {
  chromePath: string;
  pagePlans: ExplicitPagePlan[];
  pageTexts: string[];
  theme: LongformTheme;
  highlightWords?: string[];
}): LongformPageLayout[] | null {
  const pages: LongformPageLayout[] = [];
  for (let index = 0; index < params.pagePlans.length; index += 1) {
    const pagePlan = params.pagePlans[index]!;
    const blocks = parseContentBlocks(params.pageTexts[index] ?? "");
    const flowBlocks = toFlowBlocks(blocks, params.theme, params.highlightWords);
    const measured = optimizeSpecPageLayout({
      chromePath: params.chromePath,
      flowBlocks,
      pagePlan,
      theme: params.theme,
    });
    if (measured === null) {
      return null;
    }
    pages.push(measured.layout);
  }
  return pages;
}

function buildSpecDrivenPagesByPartition(params: {
  chromePath: string;
  pagePlans: ExplicitPagePlan[];
  blocks: ContentBlock[];
  theme: LongformTheme;
  highlightWords?: string[];
}): LongformPageLayout[] | null {
  const { chromePath, pagePlans, blocks, theme } = params;
  const memo = new Map<string, { score: number; pages: LongformPageLayout[] } | null>();

  const solve = (pageIndex: number, blockIndex: number): { score: number; pages: LongformPageLayout[] } | null => {
    const key = `${pageIndex}:${blockIndex}`;
    if (memo.has(key)) {
      return memo.get(key) ?? null;
    }

    if (pageIndex >= pagePlans.length) {
      const result = blockIndex >= blocks.length ? { score: 0, pages: [] } : null;
      memo.set(key, result);
      return result;
    }

    const remainingPages = pagePlans.length - pageIndex;
    const remainingBlocks = blocks.length - blockIndex;
    const minEndExclusive = remainingBlocks > remainingPages - 1 ? blockIndex + 1 : blockIndex;
    const maxEndExclusive = remainingBlocks >= remainingPages
      ? blocks.length - (remainingPages - 1)
      : Math.min(blocks.length, blockIndex + 1);
    let best: { score: number; pages: LongformPageLayout[] } | null = null;

    for (let endExclusive = minEndExclusive; endExclusive <= maxEndExclusive; endExclusive += 1) {
      // 自动分配逐页内容时，标题不能独占上一页的结尾。
      const lastKind = blocks[endExclusive - 1]?.kind;
      if (endExclusive < blocks.length && lastKind && ["heading", "subheading", "minor-heading"].includes(lastKind)) continue;
      const flowBlocks = toFlowBlocks(blocks.slice(blockIndex, endExclusive), theme, params.highlightWords);
      const measured = optimizeSpecPageLayout({
        chromePath,
        flowBlocks,
        pagePlan: pagePlans[pageIndex]!,
        theme,
      });
      if (measured === null) {
        continue;
      }
      const rest = solve(pageIndex + 1, endExclusive);
      if (rest === null) {
        continue;
      }
      const hasVisibleContent = measured.layout.lines.length > 0 || measured.layout.images.length > 0;
      const score = Math.abs(measured.fillRatio - pagePlans[pageIndex]!.targetFillRatio)
        + (hasVisibleContent ? 0 : 0.35)
        + rest.score;
      if (best === null || score < best.score) {
        best = {
          score,
          pages: [measured.layout, ...rest.pages],
        };
      }
    }

    memo.set(key, best);
    return best;
  };

  const partitioned = solve(0, 0)?.pages;
  if (partitioned) return partitioned;
  // 单个长段落也允许跨页，显式图片仍留在指定页。
  const flowed = measureLongformPages({
    flowBlocks: toFlowBlocks(blocks, theme, params.highlightWords),
    bodyImages: [], pageImageGroups: pagePlans.map(plan => scalePageImages(plan.images, 0.45, theme)), theme,
  });
  return flowed.length === pagePlans.length ? flowed : null;
}

async function renderPage(params: {
  chromePath: string;
  outPath: string;
  pageLabel: string;
  footer: string;
  iconPath: string;
  templateName: string;
  page: LongformPageLayout;
  themeCssVars: string;
  theme: LongformTheme;
}): Promise<void> {
  const template = readUtf8(join(TEMPLATES_DIR, `${params.templateName}.html`));
  const stageHtml = [
    ...params.page.images.map(image => {
      const captionHtml = image.caption
        ? `<div class="body-caption" style="left:${image.x}px;top:${image.y + image.height + 10}px;width:${image.width}px">${escapeHtml(image.caption)}</div>`
        : "";
      return `<img class="body-image" src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" style="left:${image.x}px;top:${image.y}px;width:${image.width}px;height:${image.height}px;${imageShadowStyle(image)}">${captionHtml}`;
    }),
    ...params.page.lines.map(line => {
      const style = `left:${line.x}px;top:${line.y}px;font:${line.font};line-height:${line.lineHeight}px;width:${line.maxWidth}px`;
      const bulletHtml = line.bullet && typeof line.bulletX === "number"
        ? `<div class="${escapeHtml(line.className)} body-list-bullet" style="left:${line.bulletX}px;top:${line.y}px;font:${escapeHtml(line.font)};line-height:${line.lineHeight}px">${escapeHtml(line.bullet)}</div>` : "";
      const textHtml = line.runs.map(run => {
        const runStyle = `font:${run.font};line-height:inherit;display:inline-block;vertical-align:top;margin-left:${run.gapBefore}px;width:${run.occupiedWidth}px${run.highlight ? ";color:" + params.theme.accentColor : ""}`;
        return `<span style="${escapeHtml(runStyle)}">${escapeHtml(run.text)}</span>`;
      }).join("");
      return `${bulletHtml}<div class="${escapeHtml(line.className)}" style="${escapeHtml(style)}">${textHtml}</div>`;
    }),
  ].join("");
  const html = renderTemplate(template, {
    "{{PAGE_LABEL}}": escapeHtml(params.pageLabel),
    "{{THEME_CSS_VARS}}": params.themeCssVars,
    "{{FOOTER_TEXT}}": escapeHtml(params.footer),
    "{{ICON_PATH}}": params.iconPath,
    "{{BRAND_IMAGE}}": params.iconPath ? `<img src="${escapeHtml(params.iconPath)}" alt="">` : "",
    "{{FONT_PATH}}": join(FONTS_DIR, "AlimamaShuHeiTi-Bold.ttf"),
    "{{BODY_FONT_PATH}}": join(FONTS_DIR, "LXGWNeoZhiSongPlus.ttf"),
    "{{LONGFORM_STAGE_HTML}}": stageHtml,
  });

  await screenshotReadyHtml({
    chromePath: params.chromePath,
    html,
    outPath: params.outPath,
    width: params.theme.pageWidth,
    height: params.theme.pageHeight,
  });
}

export async function runRenderArticleCli(argv: string[], onProgress?: (progress: MonitorProgress) => void): Promise<RenderArticleResult> {
  notifyProgress(onProgress, { stage: "render.layout", message: "正在计算分页" });
  const parsed = parseArgs(argv);
  await ensureFonts(["AlimamaShuHeiTi-Bold.ttf", "LXGWNeoZhiSongPlus.ttf"]);
  const title = getArg(parsed, "title");
  if (title.length === 0) throw new Error("需要 --title");

  const textFile = getArg(parsed, "text-file");
  const text = textFile.length > 0 ? readFileSync(textFile, "utf8") : getArg(parsed, "text");
  if (text.length === 0) throw new Error("需要 --text 或 --text-file");

  const highlightWordsRaw = getArg(parsed, "highlight-words");
  const highlightWords = highlightWordsRaw.length > 0 ? highlightWordsRaw.split(",").filter(w => w.length > 0) : [];

  const chromePath = findChrome();
  if (chromePath === null) throw new Error("Chrome/Chromium not found");

  const config = loadConfig();
  const branding = resolveRenderBranding(config, getArg(parsed, "account", config.wx.defaultAccount));
  const footer = getArg(parsed, "footer", branding.footerText);
  const iconSource = parsed.flags.has("icon") ? resolveBrandLogo(getArg(parsed, "icon"), false) : branding.logo;
  const templateName = getArg(parsed, "template", "longform-3-4");
  const themeName = getArg(parsed, "theme", "paper-sage");
  let theme = getLongformTheme(themeName);
  theme = applyGeometryOverrides(theme, {
    pageWidth: getIntArg(parsed, "page-width", 0) || undefined,
    pageHeight: getIntArg(parsed, "page-height", 0) || undefined,
    bodyPaddingX: getIntArg(parsed, "body-padding-x", 0) || undefined,
    bodyPaddingY: getIntArg(parsed, "body-padding-y", 0) || undefined,
    logoSize: getIntArg(parsed, "logo-size", 0) || undefined,
    logoGap: getIntArg(parsed, "logo-gap", 0) || undefined,
    footerMarginTop: getIntArg(parsed, "footer-margin-top", 0) || undefined,
    footerHeight: getIntArg(parsed, "footer-height", 0) || undefined,
    contentBottomGap: getIntArg(parsed, "content-bottom-gap", 0) || undefined,
    contentWidth: getIntArg(parsed, "content-width", 0) || undefined,
    contentHeight: getIntArg(parsed, "content-height", 0) || undefined,
  });

  // Apply font size cap if explicitly requested (manual override, rarely needed)
  const fontSizeMax = getIntArg(parsed, "font-size-max", 0);
  if (fontSizeMax > 0) {
    theme = applyFontSizeMax(theme, fontSizeMax);
  }

  const explicitPagePlansInput = buildExplicitPagePlans(parsed);
  const bodyImages = [
    ...buildBodyImages(parsed),
    ...buildAsciiBodyImages(parsed, chromePath),
  ];

  // 在实际页面边界内搜索分页，不缩小正文、不扩展画布。
  const minPages = getIntArg(parsed, "min-pages", 1);
  const maxPages = getIntArg(parsed, "max-pages", 0); // 0 = no upper limit
  if (minPages < 1 || maxPages < 0 || (maxPages > 0 && maxPages < minPages)) throw new Error("页数约束无效：max_pages 必须为 0 或不小于 min_pages");
  let pages: LongformPageLayout[];
  if (explicitPagePlansInput !== null) {
    const markerSegments = splitTextByPageMarkers(text);
    const highestMarkerPage = markerSegments.reduce((max, item) => Math.max(max, item.page), 0);
    const highestSpecPage = explicitPagePlansInput.reduce((max, item) => Math.max(max, item.page), 0);
    const explicitPagePlans = materializeExplicitPagePlans(
      explicitPagePlansInput,
      Math.max(minPages, highestMarkerPage, highestSpecPage),
    );

    if (markerSegments.length > 0) {
      const pageTextMap = new Map(markerSegments.map((segment) => [segment.page, segment.text]));
      const pageTexts = explicitPagePlans.map((plan) => pageTextMap.get(plan.page) ?? "");
      pages = buildSpecDrivenPagesFromSegments({
        chromePath,
        pagePlans: explicitPagePlans,
        pageTexts,
        theme,
        highlightWords,
      }) ?? [];
    } else {
      pages = buildSpecDrivenPagesByPartition({
        chromePath,
        pagePlans: explicitPagePlans,
        blocks: parseContentBlocks(stripPageMarkerLines(text)),
        theme,
        highlightWords,
      }) ?? [];
    }

    if (pages.length === 0) {
      throw new Error("spec-driven pagination failed to fit the requested text/images into the configured pages");
    }
    if (maxPages > 0 && pages.length > maxPages) {
      throw new Error(`spec-driven pagination produced ${pages.length} page(s), exceeding max_pages=${maxPages}`);
    }
  } else {
    const blocks = parseContentBlocks(stripPageMarkerLines(text));
    const flowBlocks = toFlowBlocks(blocks, theme, highlightWords);
    const fullHeight = getLongformGeometry(theme).contentStageHeight;
    const measure = (contentHeight: number) => measureLongformPages({
      flowBlocks, bodyImages, pageImageLimit: hasFlag(parsed, "require-image-every-page") ? 1 : 2, theme, contentHeight,
    });
    const fullPages = measure(fullHeight);
    if (maxPages > 0 && fullPages.length > maxPages) {
      throw new Error("舒适字号下至少需要 " + fullPages.length + " 页，超过 max_pages=" + maxPages + "，请增加最大页数");
    }
    let chosenHeight = Math.floor(fullHeight * clampFillRatio(Number.parseFloat(getArg(parsed, "target-fill-ratio")), 0.8));
    pages = measure(chosenHeight);
    if (maxPages > 0 && pages.length > maxPages) { pages = fullPages; chosenHeight = fullHeight; }
    if (pages.length < minPages) {
      let low = Math.min(chosenHeight, theme.bodyStyles.paragraph.lineHeight * 2);
      let high = chosenHeight - 1;
      let best: LongformPageLayout[] | null = null;
      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        let candidate: LongformPageLayout[];
        try { candidate = measure(middle); }
        catch { low = middle + 1; continue; }
        if (candidate.length >= minPages) {
          if (maxPages === 0 || candidate.length <= maxPages) best = candidate;
          low = middle + 1;
        } else {
          high = middle - 1;
        }
      }
      if (!best) throw new Error("内容无法在舒适字号下满足 min_pages=" + minPages + "，请降低最少页数");
      pages = best;
    }
  }
  if (!pages.length) throw new Error("没有可渲染的正文或图片");
  if (hasFlag(parsed, "require-image-every-page") && pages.some(page => page.images.length === 0)) {
    throw new Error("部分正文页缺少要求的图片，请补充图片或取消逐页配图要求");
  }
  const themeCssVars = getLongformThemeCssVars(theme);
  const pageNum = getIntArg(parsed, "page-num", 0);
  const pageTotal = getIntArg(parsed, "page-total", 0);
  const outPath = getArg(parsed, "out");

  const result: RenderArticleResult = {
    pageCount: pages.length,
    pages: pages.map((page, index) => ({
      page: index + 1,
      imageCount: page.images.length,
      imageSources: page.images.map((image) => image.src),
    })),
  };

  const brandDirectory = await mkdtemp(join(tmpdir(), "zzhub-body-brand-"));
  try {
    const iconPath = iconSource ? await resolveCoverImage(iconSource, brandDirectory, 0) : "";
    if (outPath.length > 0) {
      notifyProgress(onProgress, { stage: "render.pages", current: 0, total: 1, unit: "pages" });
      const requestedPage = pageNum > 0 ? pageNum : 1;
      const page = pages[Math.max(0, Math.min(requestedPage - 1, pages.length - 1))]!;
      const total = pageTotal > 0 ? pageTotal : pages.length;
      await renderPage({
        chromePath,
        outPath,
        pageLabel: `${Math.min(requestedPage, pages.length)} / ${total}`,
        footer,
        iconPath,
        templateName,
        page,
        themeCssVars,
        theme,
      });
      printSaved(outPath);
      notifyProgress(onProgress, { stage: "render.pages", current: 1, total: 1, unit: "pages" });
      return result;
    }

    const outDir = getArg(parsed, "out-dir");
    if (outDir.length === 0) {
      throw new Error("需要 --out (单页模式) 或 --out-dir (批量模式)");
    }
    for (let index = 0; index < pages.length; index++) {
      notifyProgress(onProgress, { stage: "render.pages", message: `正在渲染第 ${index + 1} 页`, current: index, total: pages.length, unit: "pages" });
      const pageOut = join(outDir, `article-${String(index + 1).padStart(2, "0")}.png`);
      await renderPage({
        chromePath,
        outPath: pageOut,
        pageLabel: `${index + 1} / ${pages.length}`,
        footer,
        iconPath,
        templateName,
        page: pages[index]!,
        themeCssVars,
        theme,
      });
      printSaved(pageOut);
      notifyProgress(onProgress, { stage: "render.pages", current: index + 1, total: pages.length, unit: "pages" });
    }
    return result;
  } finally {
    await rm(brandDirectory, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  await runRenderArticleCli(process.argv.slice(2));
}
