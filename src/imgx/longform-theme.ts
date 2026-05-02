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

const BASE_THEME: Omit<LongformTheme, "name" | "bgColor" | "bodyColor" | "accentColor" | "quoteColor" | "captionColor" | "watermarkColor" | "watermarkOpacity"> = {
  pageWidth: LONGFORM_PAGE_WIDTH,
  pageHeight: LONGFORM_PAGE_HEIGHT,
  imageRadius: 22,
  bodyPaddingX: 90,
  bodyPaddingY: 48,
  logoSize: 72,
  logoGap: 40,
  footerMarginTop: 28,
  footerHeight: 32,
  contentBottomGap: 12,
  contentWidth: null,
  contentHeight: null,
  bodyStyles: {
    paragraph: {
      font: `400 32px "LXGWNeoZhiSongPlus", "PingFang SC", "Noto Serif SC", serif`,
      lineHeight: 56,
      className: "body-line",
      gapAfter: 22,
    },
    heading: {
      font: `700 38px "AlimamaShuHeiTi", "PingFang SC", sans-serif`,
      lineHeight: 56,
      className: "body-heading",
      gapBefore: 10,
      gapAfter: 18,
    },
    quote: {
      font: `400 30px "LXGWNeoZhiSongPlus", "PingFang SC", "Noto Serif SC", serif`,
      lineHeight: 52,
      className: "body-quote",
      gapBefore: 8,
      gapAfter: 20,
    },
    "list-item": {
      font: `400 32px "LXGWNeoZhiSongPlus", "PingFang SC", "Noto Serif SC", serif`,
      lineHeight: 56,
      className: "body-line",
      gapAfter: 10,
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
