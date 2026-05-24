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
  // Guard against non-positive input (should never happen with real font sizes)
  if (fontSizePx <= 0) return Math.round(8 * 1.85);
  const logNorm = Math.log(fontSizePx / 8) / Math.log(200 / 8);
  const ratio = 1.85 - logNorm * (1.85 - 1.05);
  const clamped = Math.min(1.85, Math.max(1.05, ratio));
  const exact = fontSizePx * clamped;
  let rounded = Math.round(exact);
  // Ensure the rounded value stays within [1.05, 1.85] ratio bounds
  while (rounded / fontSizePx > 1.85) rounded--;
  while (rounded / fontSizePx < 1.05) rounded++;
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
