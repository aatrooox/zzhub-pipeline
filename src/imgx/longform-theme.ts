import { computeSpacing, proportionalLineHeight } from "./typographic-scale";

export type ContentBlockKind = "paragraph" | "heading" | "quote" | "list-item";

export const LONGFORM_PAGE_WIDTH = 900;
export const LONGFORM_PAGE_HEIGHT = 1200;

export type LongformLineStyle = {
  font: string;
  lineHeight: number;
  className: string;
  gapBefore?: number;
  gapAfter?: number;
};

export type LongformTheme = {
  name: string;
  bgColor: string;
  bodyColor: string;
  accentColor: string;
  quoteColor: string;
  captionColor: string;
  watermarkColor: string;
  watermarkOpacity: number;
  pageWidth: number;
  pageHeight: number;
  imageRadius: number;
  bodyPaddingX: number;
  bodyPaddingY: number;
  logoSize: number;
  logoGap: number;
  footerMarginTop: number;
  footerHeight: number;
  contentBottomGap: number;
  contentWidth: number | null;
  contentHeight: number | null;
  bodyStyles: Record<ContentBlockKind, LongformLineStyle>;
};

export type LongformGeometry = {
  pageWidth: number;
  pageHeight: number;
  bodyPaddingX: number;
  bodyPaddingY: number;
  logoSize: number;
  logoGap: number;
  footerMarginTop: number;
  footerHeight: number;
  contentBottomGap: number;
  contentWidth: number;
  contentHeight: number;
  contentStageHeight: number;
};

/**
 * Return a new theme with contentHeight overridden.
 * Used when min_pages > 1 to shrink the per-page content area so the
 * pagination engine naturally splits content across more pages.
 */
export function applyContentHeightOverride(theme: LongformTheme, contentHeight: number): LongformTheme {
  return { ...theme, contentHeight: Math.max(100, Math.round(contentHeight)) };
}

/**
 * Parse font size from a CSS font shorthand string like `400 32px "Font", sans-serif`.
 * Returns the numeric pixel value, or null if not found.
 */
function parseFontSize(font: string): number | null {
  const m = font.match(/\b(\d+(?:\.\d+)?)px\b/);
  return m ? parseFloat(m[1]!) : null;
}

/**
 * Return a new theme where every bodyStyle font size is capped at fontSizeMax (px).
 * Line heights are scaled proportionally when the font size is reduced.
 * Used alongside applyContentHeightOverride to prevent overly large text when
 * per-page content area is small (few words forced onto a fixed number of pages).
 */
export function applyFontSizeMax(theme: LongformTheme, fontSizeMax: number): LongformTheme {
  const clampedStyles = {} as Record<ContentBlockKind, LongformLineStyle>;
  for (const [kind, style] of Object.entries(theme.bodyStyles) as [ContentBlockKind, LongformLineStyle][]) {
    const original = parseFontSize(style.font);
    if (original !== null && original > fontSizeMax) {
      const ratio = fontSizeMax / original;
      const newFont = style.font.replace(/\b\d+(?:\.\d+)?px\b/, `${fontSizeMax}px`);
      const newLineHeight = Math.round(style.lineHeight * ratio);
      clampedStyles[kind] = { ...style, font: newFont, lineHeight: newLineHeight };
    } else {
      clampedStyles[kind] = style;
    }
  }
  return { ...theme, bodyStyles: clampedStyles };
}

export function getLongformGeometry(theme: LongformTheme): LongformGeometry {
  const bodyWidth = Math.max(120, theme.pageWidth - theme.bodyPaddingX * 2);
  const headerHeight = theme.logoSize + theme.logoGap;
  const footerReservedHeight = theme.footerHeight + theme.footerMarginTop;
  const derivedContentHeight = Math.max(
    120,
    theme.pageHeight - theme.bodyPaddingY * 2 - headerHeight - footerReservedHeight,
  );
  const contentWidth = Math.min(theme.contentWidth ?? bodyWidth, bodyWidth);
  const contentHeight = Math.min(theme.contentHeight ?? derivedContentHeight, derivedContentHeight);
  return {
    pageWidth: theme.pageWidth,
    pageHeight: theme.pageHeight,
    bodyPaddingX: theme.bodyPaddingX,
    bodyPaddingY: theme.bodyPaddingY,
    logoSize: theme.logoSize,
    logoGap: theme.logoGap,
    footerMarginTop: theme.footerMarginTop,
    footerHeight: theme.footerHeight,
    contentBottomGap: theme.contentBottomGap,
    contentWidth,
    contentHeight,
    contentStageHeight: Math.max(80, contentHeight - theme.contentBottomGap),
  };
}

const BODY_FS = 32;
const HEADING_FS = 50; // 32 * 1.25^2
const QUOTE_FS = 30;

const BASE_THEME: Omit<LongformTheme, "name" | "bgColor" | "bodyColor" | "accentColor" | "quoteColor" | "captionColor" | "watermarkColor" | "watermarkOpacity"> = {
  pageWidth: LONGFORM_PAGE_WIDTH,
  pageHeight: LONGFORM_PAGE_HEIGHT,
  imageRadius: 22,

  // Proportional geometry: ~4.5% of page height for vertical padding
  bodyPaddingX: Math.round(LONGFORM_PAGE_WIDTH * 0.10),        // 90
  bodyPaddingY: Math.round(LONGFORM_PAGE_HEIGHT * 0.045),       // 54 (was 48)
  logoSize: 72,
  logoGap: Math.round(LONGFORM_PAGE_HEIGHT * 0.045 * 0.78),    // ~42 (was 40)
  footerMarginTop: Math.round(BODY_FS * 1.2),                   // 38 (was 28)
  footerHeight: Math.round(BODY_FS * 1.0),                      // 32 (unchanged)
  contentBottomGap: Math.round(BODY_FS * 0.6),                  // 19 (was 12)

  contentWidth: null,
  contentHeight: null,

  bodyStyles: {
    paragraph: {
      font: `400 ${BODY_FS}px "LXGWNeoZhiSongPlus", "PingFang SC", "Noto Serif SC", serif`,
      lineHeight: proportionalLineHeight(BODY_FS),
      className: "body-line",
      gapAfter: computeSpacing(BODY_FS, BODY_FS, 0.55),
    },
    heading: {
      font: `700 ${HEADING_FS}px "AlimamaShuHeiTi", "PingFang SC", sans-serif`,
      lineHeight: proportionalLineHeight(HEADING_FS),
      className: "body-heading",
      gapBefore: computeSpacing(BODY_FS, HEADING_FS, 0.85),
      gapAfter: computeSpacing(HEADING_FS, BODY_FS, 0.45),
    },
    quote: {
      font: `400 ${QUOTE_FS}px "LXGWNeoZhiSongPlus", "PingFang SC", "Noto Serif SC", serif`,
      lineHeight: proportionalLineHeight(QUOTE_FS),
      className: "body-quote",
      gapBefore: computeSpacing(BODY_FS, QUOTE_FS, 0.6),
      gapAfter: computeSpacing(QUOTE_FS, BODY_FS, 0.5),
    },
    "list-item": {
      font: `400 ${BODY_FS}px "LXGWNeoZhiSongPlus", "PingFang SC", "Noto Serif SC", serif`,
      lineHeight: proportionalLineHeight(BODY_FS),
      className: "body-line",
      gapAfter: computeSpacing(BODY_FS, BODY_FS, 0.3),
    },
  },
};

const THEMES: Record<string, LongformTheme> = {
  "paper-sage": {
    ...BASE_THEME,
    name: "paper-sage",
    bgColor: "#f9fcfa",
    bodyColor: "#22201d",
    accentColor: "#1d4f39",
    quoteColor: "#474038",
    captionColor: "#6a6257",
    watermarkColor: "#555555",
    watermarkOpacity: 0.55,
  },
  "linen-news": {
    ...BASE_THEME,
    name: "linen-news",
    bgColor: "#f7f3eb",
    bodyColor: "#2b2621",
    accentColor: "#7a2e24",
    quoteColor: "#625449",
    captionColor: "#7a6a5d",
    watermarkColor: "#6a6158",
    watermarkOpacity: 0.62,
    bodyStyles: {
      ...BASE_THEME.bodyStyles,
      heading: {
        ...BASE_THEME.bodyStyles.heading,
        font: `700 36px "AlimamaShuHeiTi", "PingFang SC", sans-serif`,
        lineHeight: proportionalLineHeight(36),
        gapBefore: computeSpacing(BODY_FS, 36, 0.85),
        gapAfter: computeSpacing(36, BODY_FS, 0.45),
      },
      paragraph: {
        ...BASE_THEME.bodyStyles.paragraph,
        font: `400 31px "LXGWNeoZhiSongPlus", "PingFang SC", "Noto Serif SC", serif`,
        lineHeight: 56,
      },
      quote: {
        ...BASE_THEME.bodyStyles.quote,
        lineHeight: 54,
      },
    },
  },
};

export function getLongformTheme(name: string): LongformTheme {
  return THEMES[name] ?? THEMES["paper-sage"]!;
}

export function getLongformThemeCssVars(theme: LongformTheme): string {
  const geometry = getLongformGeometry(theme);
  return [
    `--page-width:${theme.pageWidth}px`,
    `--page-height:${theme.pageHeight}px`,
    `--page-bg:${theme.bgColor}`,
    `--body-color:${theme.bodyColor}`,
    `--accent-color:${theme.accentColor}`,
    `--quote-color:${theme.quoteColor}`,
    `--caption-color:${theme.captionColor}`,
    `--watermark-color:${theme.watermarkColor}`,
    `--watermark-opacity:${theme.watermarkOpacity}`,
    `--body-padding-x:${theme.bodyPaddingX}px`,
    `--body-padding-y:${theme.bodyPaddingY}px`,
    `--logo-size:${theme.logoSize}px`,
    `--logo-gap:${theme.logoGap}px`,
    `--footer-margin-top:${theme.footerMarginTop}px`,
    `--footer-height:${theme.footerHeight}px`,
    `--content-width:${geometry.contentWidth}px`,
    `--content-height:${geometry.contentHeight}px`,
    `--content-bottom-gap:${theme.contentBottomGap}px`,
    `--image-radius:${theme.imageRadius}px`,
  ].join(";");
}
