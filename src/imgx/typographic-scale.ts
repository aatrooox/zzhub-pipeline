export type TypographicScale = {
  base: number;
  ratio: number;
};

export const MAJOR_THIRD: TypographicScale = { base: 16, ratio: 1.25 };

export function modularScale(scale: TypographicScale, step: number): number {
  return Math.round(scale.base * Math.pow(scale.ratio, step));
}

/**
 * Smooth proportional line-height via log-curve interpolation.
 * Large display fonts (132px) → ~1.05 ratio (tight leading).
 * Small body fonts (8px) → ~1.82 ratio (generous leading).
 * Clamped to [1.05, 1.85].
 */
export function proportionalLineHeight(fontSizePx: number): number {
  const logNorm = Math.log(fontSizePx / 8) / Math.log(200 / 8);
  const ratio = 1.85 - logNorm * (1.85 - 1.05);
  const clamped = Math.min(1.85, Math.max(1.05, ratio));
  const exact = fontSizePx * clamped;
  const rounded = Math.round(exact);
  // Post-rounding bounds guarantee: the actual ratio (rounded / fontSizePx)
  // must stay within [1.05, 1.85]. If rounding pushed it over, floor/ceil instead.
  if (rounded / fontSizePx > 1.85) return Math.floor(exact);
  if (rounded / fontSizePx < 1.05) return Math.ceil(exact);
  return rounded;
}

/**
 * Inter-block spacing proportional to the dominant font size.
 * @param fontSizeA - font size of the first block
 * @param fontSizeB - font size of the second block
 * @param multiplier - 0.3=tight (list items), 0.5=normal (paragraphs), 0.7=loose (pre-heading)
 */
export function computeSpacing(
  fontSizeA: number,
  fontSizeB: number,
  multiplier: number,
): number {
  return Math.round(Math.max(fontSizeA, fontSizeB) * multiplier);
}
