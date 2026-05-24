import { readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { renderAsciiPortraitPng } from "./ascii-portrait";
import { getArg, getArgs, getIntArg, parseArgs } from "./cli";
import { createObstacleFlowRuntime } from "./assets/browser/obstacle-flow.js";
import { applyGeometryOverrides } from "./geometry";
import {
  getLongformTheme,
  getLongformThemeCssVars,
  applyContentHeightOverride,
  applyFontSizeMax,
  getLongformGeometry,
  type LongformTheme,
} from "./longform-theme";
import {
  escapeHtml,
  findChrome,
  FONTS_DIR,
  ICONS_DIR,
  printSaved,
  readImageSize,
  readUtf8,
  renderInlineMarkdown,
  renderTemplate,
  resolveInputPath,
  screenshotHtml,
  TEMPLATES_DIR,
} from "./runtime";
import { layoutNextLineRange, prepareWithSegments } from "./pretext-adapter";
import { ensurePretextRuntime } from "./pretext-runtime";

const DEFAULT_CONTENT_WIDTH = getLongformGeometry(getLongformTheme("paper-sage")).contentWidth;

function proportionalObstacleGap(imageMinDim: number): number {
  const gap = Math.round(imageMinDim * 0.10);
  return Math.min(48, Math.max(16, gap));
}

function proportionalMinSlotWidth(bodyFontSize: number): number {
  return Math.round(bodyFontSize * 5.3);
}

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
  kind: "paragraph" | "heading" | "quote" | "list-item";
  text: string;
  bullet?: string;
};

type FlowBlock = {
  text: string;
  font: string;
  lineHeight: number;
  className: string;
  gapBefore?: number;
  gapAfter?: number;
  bullet?: string;
  textIndent?: number;
};

type LongformPageLayout = {
  lines: Array<{
    text: string;
    x: number;
    y: number;
    className: string;
    maxWidth?: number;
    bullet?: string;
    bulletX?: number;
  }>;
  images: Array<BodyImageSpec & { captionHeight?: number }>;
  textBottom?: number;
};

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

function normalizeMixedTextSpacing(text: string): string {
  // Match any ASCII token regardless of length (removed {0,11} limit)
  const asciiToken = "([A-Za-z0-9][A-Za-z0-9.+-]*)";

  // Pass 1: CJK + space(s) + ASCII_token + space(s) + CJK → CJK + token + CJK
  let result = text.replace(
    new RegExp(`([\\p{Script=Han}])\\s+${asciiToken}\\s+([\\p{Script=Han}])`, "gu"),
    "$1$2$3",
  );

  // Pass 2: CJK + space(s) + ASCII_token before Chinese punctuation or EOL
  result = result.replace(
    new RegExp(`([\\p{Script=Han}])\\s+${asciiToken}(?=[，。！？；：、）】》」』]|$)`, "gu"),
    "$1$2",
  );

  // Pass 3: Start-of-text or opening bracket + ASCII_token + space(s) + CJK
  result = result.replace(
    new RegExp(`(^|[（【《「『])${asciiToken}\\s+([\\p{Script=Han}])`, "gu"),
    "$1$2$3",
  );

  // Pass 4: Handle consecutive ASCII tokens separated by spaces.
  // After Pass 1-3, we may still have "使用 AI Agent 管理" where AI and Agent
  // are two tokens with a space between them. This pass joins consecutive
  // ASCII tokens, removing the space between them.
  // The \\s* before the first asciiToken handles the space between CJK and the first token.
  // Re-run until no more matches (handles 3+ token chains).
  let prev = "";
  while (prev !== result) {
    prev = result;
    result = result.replace(
      new RegExp(`([\\p{Script=Han}])\\s*${asciiToken}\\s+${asciiToken}(?=\\s*(?:[\\p{Script=Han}，。！？；：、）】》」』]|[A-Za-z0-9]))`, "gu"),
      (_m, cjk: string, t1: string, t2: string) => `${cjk}${t1}${t2}`,
    );
  }

  // After joining tokens, clean up spaces between the joined phrase and following CJK.
  // Pattern: CJK + ASCIIchain + space + CJK (the space is on the RIGHT of the chain)
  // NOTE: asciiToken introduces a capturing group, so the second CJK capture is group 3, not group 2.
  result = result.replace(
    new RegExp(`([\\p{Script=Han}]${asciiToken})\\s+([\\p{Script=Han}])`, "gu"),
    "$1$3",
  );

  return result;
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

function parseContentBlocks(text: string): ContentBlock[] {
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

    if (line.startsWith("## ")) {
      flushParagraph();
      blocks.push({ kind: "heading", text: normalizeMixedTextSpacing(line.slice(3).trim()) });
      continue;
    }

    if (line.startsWith("# ")) {
      flushParagraph();
      blocks.push({ kind: "heading", text: normalizeMixedTextSpacing(line.slice(2).trim()) });
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      blocks.push({ kind: "quote", text: normalizeMixedTextSpacing(line.replace(/^>\s?/, "").trim()) });
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      flushParagraph();
      blocks.push({
        kind: "list-item",
        text: normalizeMixedTextSpacing(line.replace(/^[-*]\s+/, "").trim()),
        bullet: "•",
      });
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

function toFlowBlocks(blocks: ContentBlock[], theme: LongformTheme): FlowBlock[] {
  let consecutiveParagraphs = 0;

  const RHYTHM_MODIFIER: Record<string, number> = {
    normal: 1.0,
    compressed: 0.65,
  };

  return blocks.map(block => {
    const style = theme.bodyStyles[block.kind];

    if (block.kind === "paragraph") {
      consecutiveParagraphs += 1;
    } else {
      consecutiveParagraphs = 0;
    }

    // Every 3rd consecutive paragraph gets slightly compressed spacing
    const rhythm = (block.kind === "paragraph" && consecutiveParagraphs > 0 && consecutiveParagraphs % 3 === 0)
      ? "compressed"
      : "normal";
    const modifier = RHYTHM_MODIFIER[rhythm];

    return {
      text: block.text,
      font: style.font,
      lineHeight: style.lineHeight,
      className: style.className,
      gapBefore: Math.round((style.gapBefore ?? 0) * modifier),
      gapAfter: Math.round((style.gapAfter ?? 0) * modifier),
      bullet: block.kind === "list-item" ? block.bullet ?? "•" : undefined,
      // Reserve a stable hanging indent so the bullet never gets wrapped onto its own line.
      textIndent: block.kind === "list-item" ? 34 : 0,
    };
  });
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

function buildLineHeightMap(flowBlocks: FlowBlock[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const block of flowBlocks) {
    const previous = map.get(block.className) ?? 0;
    map.set(block.className, Math.max(previous, block.lineHeight));
  }
  return map;
}

function createImageOnlyPageLayout(images: BodyImageSpec[]): LongformPageLayout {
  return {
    lines: [],
    images: images.map((image) => ({
      ...image,
      captionHeight: image.caption ? 50 : 0,
    })),
    textBottom: 0,
  };
}

function computePageFillRatio(
  page: LongformPageLayout,
  lineHeights: Map<string, number>,
  theme: LongformTheme,
): number {
  const geometry = getLongformGeometry(theme);
  const textBottom = page.lines.reduce((max, line) => {
    const lineHeight = lineHeights.get(line.className) ?? 0;
    return Math.max(max, line.y + lineHeight);
  }, 0);
  const imageBottom = page.images.reduce((max, image) => {
    const captionExtra = image.caption ? (image.captionHeight ?? 50) + 10 : 0;
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
  _scale: number,
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
        const fitScale = Math.min(scaleByW, scaleByH, 1); // never upscale beyond intrinsic
        width = Math.max(120, Math.round(intrinsicW * fitScale));
        height = Math.max(80, Math.round(intrinsicH * fitScale));
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
        const fitScale = Math.min(scaleByW, scaleByH); // contain semantics
        width = Math.max(72, Math.round(intrinsicW * fitScale));
        height = Math.max(72, Math.round(intrinsicH * fitScale));
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
}): LongformPageLayout[] {
  ensurePretextRuntime();
  const geometry = getLongformGeometry(params.theme);
  const allImages = params.pageImageGroups?.flat() ?? params.bodyImages;
  const maxImgMinDim = allImages.reduce(
    (max, img) => Math.max(max, Math.min(img.width, img.height)),
    210,
  );
  const obstacleGap = proportionalObstacleGap(maxImgMinDim);
  const minSlotWidth = proportionalMinSlotWidth(32);
  const flow = createObstacleFlowRuntime({
    prepareWithSegments,
    layoutNextLineRange,
    obstacleGap,
    minSlotWidth,
    renderLine() {},
    renderImage() {},
  });
  return flow.paginateBlocks(
    params.flowBlocks,
    geometry.contentWidth,
    geometry.contentHeight,
    params.bodyImages,
    {
      pageImageLimit: params.pageImageLimit ?? 2,
      pageImageGroups: params.pageImageGroups ?? null,
    },
  );
}

function measureSpecPage(
  flowBlocks: FlowBlock[],
  images: BodyImageSpec[],
  theme: LongformTheme,
  scale: number,
): SpecPageMeasure {
  const lineHeights = buildLineHeightMap(flowBlocks);
  if (flowBlocks.length === 0) {
    const layout = createImageOnlyPageLayout(images);
    return {
      layout,
      fit: true,
      fillRatio: computePageFillRatio(layout, lineHeights, theme),
      scale,
    };
  }

  // For fill-layout images, reduce contentHeight so the text measurement pass
  // cannot place lines in the image's reserved bottom zone.  Without this,
  // paginateBlocks may allow text lines up to contentHeight (932) while the
  // image obstacle only covers contentStageHeight-imgH ~ contentStageHeight (920),
  // leaving a 12px gap where lines can slip through and visually overlap the image.
  //
  // The correct text ceiling is imgY = contentStageHeight - imgH (where the
  // obstacle actually starts).  We pass that as the reduced contentHeight so
  // paginateBlocks stops placing lines exactly at the obstacle boundary.
  const geometry = getLongformGeometry(theme);
  const fillImages = images.filter(
    (img) => normalizeLayoutPreset(img.layoutPreset ?? "auto") === "fill",
  );
  let measureTheme = theme;
  if (fillImages.length > 0) {
    // imgY = contentStageHeight - maxFillHeight (= where the tallest fill image starts)
    // Use that as the contentHeight cap so text cannot enter the image zone.
    // Add contentBottomGap back because getLongformGeometry subtracts it:
    //   contentStageHeight = contentHeight - contentBottomGap
    // so: imgY = (contentHeight - contentBottomGap) - maxFillHeight
    // We want paginateBlocks' height = imgY, which means:
    //   reducedContentHeight = imgY + contentBottomGap  (getLongformGeometry will subtract it again)
    const maxFillHeight = fillImages.reduce((max, img) => Math.max(max, img.height), 0);
    const imgY = Math.max(0, geometry.contentStageHeight - maxFillHeight);
    // Add a small gap so text doesn't butt right up against the image
    const textCeiling = Math.max(80, imgY - 16);
    const reducedHeight = textCeiling + theme.contentBottomGap;
    measureTheme = applyContentHeightOverride(theme, reducedHeight);
  }

  // When fill images are present we pass an empty bodyImages list to
  // measureLongformPages — the reduced contentHeight already prevents text
  // from entering the image zone.  Passing the actual fill images would cause
  // obstacle-flow to clamp their y-coordinates to fit within the reduced
  // contentHeight, corrupting the final rendered position.
  const measureBodyImages = fillImages.length > 0 ? [] : images;

  const pages = measureLongformPages({
    flowBlocks,
    bodyImages: measureBodyImages,
    pageImageLimit: Math.max(images.length, 1),
    theme: measureTheme,
  });
  // Restore the real scaled images into the layout so renderPage uses the
  // correct coordinates.
  const rawLayout = pages[0] ?? createImageOnlyPageLayout(images);
  const layout: typeof rawLayout = fillImages.length > 0
    ? { ...rawLayout, images: images.map(img => ({ ...img, captionHeight: img.caption ? 50 : 0 })) }
    : rawLayout;
  return {
    layout,
    fit: pages.length <= 1,
    fillRatio: computePageFillRatio(layout, lineHeights, theme),
    scale,
  };
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
  for (const scale of [0.6, 0.75, 0.9, 1, 1.15, 1.3, 1.45, 1.6, 1.8]) {
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
  let high = 1.8;
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
}): LongformPageLayout[] | null {
  const pages: LongformPageLayout[] = [];
  for (let index = 0; index < params.pagePlans.length; index += 1) {
    const pagePlan = params.pagePlans[index]!;
    const blocks = parseContentBlocks(params.pageTexts[index] ?? "");
    const flowBlocks = toFlowBlocks(blocks, params.theme);
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
      const flowBlocks = toFlowBlocks(blocks.slice(blockIndex, endExclusive), theme);
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

  return solve(0, 0)?.pages ?? null;
}

function renderPage(params: {
  chromePath: string;
  outPath: string;
  pageLabel: string;
  footer: string;
  iconPath: string;
  templateName: string;
  page: LongformPageLayout;
  themeCssVars: string;
  theme: LongformTheme;
  highlightWords?: string[];
}): void {
  const words = params.highlightWords ?? [];

  function highlightBodyText(text: string): string {
    let html = renderInlineMarkdown(text);
    for (const word of words) {
      if (!word) continue;
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      html = html.replace(
        new RegExp(escaped, "g"),
        `<strong style="color:${params.theme.accentColor}">${word}</strong>`,
      );
    }
    return html;
  }

  const template = readUtf8(join(TEMPLATES_DIR, `${params.templateName}.html`));
  const stageHtml = [
    ...params.page.images.map(image => {
      const captionHtml = image.caption
        ? `<div class="body-caption" style="left:${image.x}px;top:${image.y + image.height + 10}px;width:${image.width}px">${escapeHtml(image.caption)}</div>`
        : "";
      return `<img class="body-image" src="${escapeHtml(image.src)}" alt="${escapeHtml(image.alt)}" style="left:${image.x}px;top:${image.y}px;width:${image.width}px;height:${image.height}px;${imageShadowStyle(image)}">${captionHtml}`;
    }),
    ...params.page.lines
      .filter(line => line.className !== "body-caption")
      .map(line => {
      const bulletHtml =
        line.bullet && typeof line.bulletX === "number"
          ? `<div class="${escapeHtml(line.className)} body-list-bullet" style="left:${line.bulletX}px;top:${line.y}px">${escapeHtml(line.bullet)}</div>`
          : "";
      const maxWidthStyle = line.maxWidth ? `;max-width:${line.maxWidth}px` : "";
      return `${bulletHtml}<div class="${escapeHtml(line.className)}" style="left:${line.x}px;top:${line.y}px${maxWidthStyle}">${highlightBodyText(line.text)}</div>`;
      }),
  ].join("");
  const html = renderTemplate(template, {
    "{{PAGE_LABEL}}": escapeHtml(params.pageLabel),
    "{{THEME_CSS_VARS}}": params.themeCssVars,
    "{{FOOTER_TEXT}}": escapeHtml(params.footer),
    "{{ICON_PATH}}": params.iconPath,
    "{{AVATAR_PATH}}": join(ICONS_DIR, "logo.svg"),
    "{{FONT_PATH}}": join(FONTS_DIR, "AlimamaShuHeiTi-Bold.ttf"),
    "{{BODY_FONT_PATH}}": join(FONTS_DIR, "LXGWNeoZhiSongPlus.ttf"),
    "{{LONGFORM_STAGE_HTML}}": stageHtml,
  });

  screenshotHtml({
    chromePath: params.chromePath,
    html,
    outPath: params.outPath,
    width: params.theme.pageWidth,
    height: params.theme.pageHeight,
    virtualTimeBudgetMs: 1200,
  });
}

export function runRenderArticleCli(argv: string[]): RenderArticleResult {
  const parsed = parseArgs(argv);
  const title = getArg(parsed, "title");
  if (title.length === 0) throw new Error("需要 --title");

  const textFile = getArg(parsed, "text-file");
  const text = textFile.length > 0 ? readFileSync(textFile, "utf8") : getArg(parsed, "text");
  if (text.length === 0) throw new Error("需要 --text 或 --text-file");

  const highlightWordsRaw = getArg(parsed, "highlight-words");
  const highlightWords = highlightWordsRaw.length > 0 ? highlightWordsRaw.split(",").filter(w => w.length > 0) : [];

  const chromePath = findChrome();
  if (chromePath === null) throw new Error("Chrome/Chromium not found");

  const footer = getArg(parsed, "footer", "公众号 · 早早集市");
  const iconPath = resolveInputPath(getArg(parsed, "icon") || join(ICONS_DIR, "logo.svg"));
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

  // ── Adaptive pagination ──────────────────────────────────────────
  // If min_pages > 1, iteratively shrink contentHeight until the pagination
  // engine produces at least that many pages. This naturally accounts for
  // image height, line heights, and gaps — no manual estimation needed.
  // Each iteration reduces contentHeight by 10% with a floor of 80px.
  const minPages = getIntArg(parsed, "min-pages", 1);
  const maxPages = getIntArg(parsed, "max-pages", 0); // 0 = no upper limit
  const FONT_SIZE_CAP_FOR_FORCED_PAGES = 30;
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
      }) ?? [];
    } else {
      pages = buildSpecDrivenPagesByPartition({
        chromePath,
        pagePlans: explicitPagePlans,
        blocks: parseContentBlocks(stripPageMarkerLines(text)),
        theme,
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
    const flowBlocks = toFlowBlocks(blocks, theme);
    pages = measureLongformPages({
      flowBlocks,
      bodyImages,
      pageImageLimit: 2,
      theme,
    });
    if (minPages > 1 && pages.length < minPages) {
      theme = applyFontSizeMax(theme, FONT_SIZE_CAP_FOR_FORCED_PAGES);
      const MIN_CONTENT_HEIGHT = 80;
      while (pages.length < minPages && getLongformGeometry(theme).contentHeight > MIN_CONTENT_HEIGHT) {
        const next = Math.max(MIN_CONTENT_HEIGHT, Math.floor(getLongformGeometry(theme).contentHeight * 0.9));
        theme = applyContentHeightOverride(theme, next);
        pages = measureLongformPages({
          flowBlocks: toFlowBlocks(blocks, theme),
          bodyImages,
          pageImageLimit: 2,
          theme,
        });
      }
    }

    if (maxPages > 0 && pages.length > maxPages) {
      const originalContentHeight = getLongformGeometry(theme).contentHeight;
      const MAX_CONTENT_HEIGHT = originalContentHeight * 4;
      while (pages.length > maxPages && getLongformGeometry(theme).contentHeight < MAX_CONTENT_HEIGHT) {
        const next = Math.min(MAX_CONTENT_HEIGHT, Math.ceil(getLongformGeometry(theme).contentHeight * 1.15));
        theme = applyContentHeightOverride(theme, next);
        pages = measureLongformPages({
          flowBlocks: toFlowBlocks(blocks, theme),
          bodyImages,
          pageImageLimit: 2,
          theme,
        });
      }
    }
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

  if (outPath.length > 0) {
    const requestedPage = pageNum > 0 ? pageNum : 1;
    const page = pages[Math.max(0, Math.min(requestedPage - 1, pages.length - 1))]!;
    const total = pageTotal > 0 ? pageTotal : pages.length;
    renderPage({
      chromePath,
      outPath,
      pageLabel: `${Math.min(requestedPage, pages.length)} / ${total}`,
      footer,
      iconPath,
      templateName,
      page,
      themeCssVars,
      theme,
      highlightWords,
    });
    printSaved(outPath);
    return result;
  }

  const outDir = getArg(parsed, "out-dir");
  if (outDir.length === 0) {
    throw new Error("需要 --out (单页模式) 或 --out-dir (批量模式)");
  }
  for (let index = 0; index < pages.length; index++) {
    const pageOut = join(outDir, `article-${String(index + 1).padStart(2, "0")}.png`);
    // DEBUG: dump layout coordinates
    const dbgPage = pages[index]!;
    const lastLine = dbgPage.lines.length > 0 ? dbgPage.lines[dbgPage.lines.length - 1] : null;
    const firstImg = dbgPage.images.length > 0 ? dbgPage.images[0] : null;
    process.stderr.write(`[DEBUG page ${index+1}] lastLine y=${lastLine?.y ?? 'N/A'} | firstImg y=${firstImg?.y ?? 'N/A'} h=${firstImg?.height ?? 'N/A'}\n`);
    renderPage({
      chromePath,
      outPath: pageOut,
      pageLabel: `${index + 1} / ${pages.length}`,
      footer,
      iconPath,
      templateName,
      page: pages[index]!,
      themeCssVars,
      theme,
      highlightWords,
    });
    printSaved(pageOut);
  }
  return result;
}

if (import.meta.main) {
  runRenderArticleCli(process.argv.slice(2));
}
