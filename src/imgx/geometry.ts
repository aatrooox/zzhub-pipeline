import type { LongformGeometry, LongformTheme } from "./longform-theme";

export type LongformGeometryOverrides = Partial<{
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
}>;

function sanitizePositiveInt(value: number | undefined | null): number | null {
  if (!Number.isFinite(value)) {
    return null;
  }
  const rounded = Math.round(value!);
  return rounded > 0 ? rounded : null;
}

export function applyGeometryOverrides(theme: LongformTheme, overrides: LongformGeometryOverrides): LongformTheme {
  return {
    ...theme,
    pageWidth: sanitizePositiveInt(overrides.pageWidth) ?? theme.pageWidth,
    pageHeight: sanitizePositiveInt(overrides.pageHeight) ?? theme.pageHeight,
    bodyPaddingX: sanitizePositiveInt(overrides.bodyPaddingX) ?? theme.bodyPaddingX,
    bodyPaddingY: sanitizePositiveInt(overrides.bodyPaddingY) ?? theme.bodyPaddingY,
    logoSize: sanitizePositiveInt(overrides.logoSize) ?? theme.logoSize,
    logoGap: sanitizePositiveInt(overrides.logoGap) ?? theme.logoGap,
    footerMarginTop: sanitizePositiveInt(overrides.footerMarginTop) ?? theme.footerMarginTop,
    footerHeight: sanitizePositiveInt(overrides.footerHeight) ?? theme.footerHeight,
    contentBottomGap: sanitizePositiveInt(overrides.contentBottomGap) ?? theme.contentBottomGap,
    contentWidth: sanitizePositiveInt(overrides.contentWidth) ?? theme.contentWidth,
    contentHeight: sanitizePositiveInt(overrides.contentHeight) ?? theme.contentHeight,
  };
}

export function getDerivedGeometry(theme: LongformTheme): LongformGeometry {
  const pageWidth = theme.pageWidth;
  const pageHeight = theme.pageHeight;
  const bodyWidth = Math.max(120, pageWidth - theme.bodyPaddingX * 2);
  const headerHeight = theme.logoSize + theme.logoGap;
  const footerReservedHeight = theme.footerHeight + theme.footerMarginTop;
  const derivedContentHeight = Math.max(
    120,
    pageHeight - theme.bodyPaddingY * 2 - headerHeight - footerReservedHeight,
  );
  const contentWidth = Math.min(theme.contentWidth ?? bodyWidth, bodyWidth);
  const contentHeight = Math.min(theme.contentHeight ?? derivedContentHeight, derivedContentHeight);
  return {
    pageWidth,
    pageHeight,
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
