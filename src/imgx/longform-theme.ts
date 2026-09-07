export type ContentBlockKind = "paragraph" | "heading" | "subheading" | "minor-heading" | "quote" | "list-item";

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
 * Parse font size from a CSS font shorthand string like `400 32px "Font", sans-serif`.
 * Returns the numeric pixel value, or null if not found.
 */
function parseFontSize(font: string): number | null {
  const m = font.match(/\b(\d+(?:\.\d+)?)px\b/);
  return m ? parseFloat(m[1]!) : null;
}

/** 手动限制最大字号时等比缩放各层级，保留标题与正文的比例。 */
export function applyFontSizeMax(theme: LongformTheme, fontSizeMax: number): LongformTheme {
  const largest = Math.max(...Object.values(theme.bodyStyles).map(style => parseFontSize(style.font) ?? 0));
  const ratio = Math.min(1, fontSizeMax / largest);
  const bodyStyles = Object.fromEntries(Object.entries(theme.bodyStyles).map(([kind, style]) => {
    const size = parseFontSize(style.font)!;
    return [kind, {
      ...style,
      font: style.font.replace(/\b\d+(?:\.\d+)?px\b/, String(Math.round(size * ratio * 10) / 10) + "px"),
      lineHeight: Math.round(style.lineHeight * ratio),
      gapBefore: Math.round((style.gapBefore ?? 0) * ratio),
      gapAfter: Math.round((style.gapAfter ?? 0) * ratio),
    }];
  })) as LongformTheme["bodyStyles"];
  return { ...theme, bodyStyles };
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
    contentStageHeight: Math.max(1, contentHeight - theme.contentBottomGap),
  };
}

// 正文优先手机阅读；顶部不重复放 Logo，署名固定在页脚。
const BASE_THEME = {
  "pageWidth": 900,
  "pageHeight": 1200,
  "imageRadius": 22,
  "bodyPaddingX": 72,
  "bodyPaddingY": 64,
  "logoSize": 0,
  "logoGap": 0,
  "footerMarginTop": 32,
  "footerHeight": 36,
  "contentBottomGap": 16,
  "contentWidth": null,
  "contentHeight": null,
  "bodyStyles": {
    "paragraph": {
      "font": "400 40px \"LXGWNeoZhiSongPlus\", \"PingFang SC\", serif",
      "lineHeight": 64,
      "className": "body-line",
      "gapAfter": 24
    },
    "heading": {
      "font": "700 56px \"AlimamaShuHeiTi\", \"PingFang SC\", sans-serif",
      "lineHeight": 72,
      "className": "body-heading",
      "gapBefore": 44,
      "gapAfter": 24
    },
    "subheading": {
      "font": "700 50px \"AlimamaShuHeiTi\", \"PingFang SC\", sans-serif",
      "lineHeight": 66,
      "className": "body-subheading",
      "gapBefore": 40,
      "gapAfter": 20
    },
    "minor-heading": {
      "font": "700 44px \"AlimamaShuHeiTi\", \"PingFang SC\", sans-serif",
      "lineHeight": 60,
      "className": "body-minor-heading",
      "gapBefore": 36,
      "gapAfter": 18
    },
    "quote": {
      "font": "400 40px \"LXGWNeoZhiSongPlus\", \"PingFang SC\", serif",
      "lineHeight": 64,
      "className": "body-quote",
      "gapBefore": 24,
      "gapAfter": 24
    },
    "list-item": {
      "font": "400 40px \"LXGWNeoZhiSongPlus\", \"PingFang SC\", serif",
      "lineHeight": 64,
      "className": "body-line",
      "gapAfter": 12
    }
  }
};

const THEMES: Record<string, LongformTheme> = {
  "paper-sage": {
    ...BASE_THEME, name: "paper-sage", bgColor: "#f9fcfa", bodyColor: "#22201d",
    accentColor: "#1d4f39", quoteColor: "#474038", captionColor: "#6a6257",
    watermarkColor: "#555555", watermarkOpacity: 1,
  },
  "linen-news": {
    ...BASE_THEME, name: "linen-news", bgColor: "#f7f3eb", bodyColor: "#2b2621",
    accentColor: "#7a2e24", quoteColor: "#625449", captionColor: "#7a6a5d",
    watermarkColor: "#6a6158", watermarkOpacity: 1,
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
