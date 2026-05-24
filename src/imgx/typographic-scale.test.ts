import { describe, it, expect } from "bun:test";
import {
  modularScale,
  proportionalLineHeight,
  computeSpacing,
  MAJOR_THIRD,
} from "./typographic-scale";

describe("modularScale", () => {
  it("returns base at step 0", () => {
    expect(modularScale(MAJOR_THIRD, 0)).toBe(16);
  });

  it("grows by ratio each step", () => {
    // 16 * 1.25^1 = 20, 16 * 1.25^2 = 25, 16 * 1.25^3 = 31.25 → 31
    expect(modularScale(MAJOR_THIRD, 1)).toBe(20);
    expect(modularScale(MAJOR_THIRD, 2)).toBe(25);
    expect(modularScale(MAJOR_THIRD, 3)).toBe(31);
  });

  it("handles negative steps", () => {
    expect(modularScale(MAJOR_THIRD, -1)).toBe(13); // 16 / 1.25 = 12.8 → 13
    expect(modularScale(MAJOR_THIRD, -2)).toBe(10); // 16 / 1.5625 = 10.24 → 10
  });
});

describe("computeSpacing", () => {
  it("uses the larger font size", () => {
    expect(computeSpacing(32, 50, 0.5)).toBe(25); // max(32,50) * 0.5 = 25
  });

  it("scales with multiplier", () => {
    const tight = computeSpacing(32, 32, 0.3);
    const normal = computeSpacing(32, 32, 0.5);
    const loose = computeSpacing(32, 32, 0.7);
    expect(tight).toBeLessThan(normal);
    expect(normal).toBeLessThan(loose);
  });
});

describe("proportionalLineHeight", () => {
  it("returns tighter ratio for larger fonts", () => {
    const huge = proportionalLineHeight(132) / 132;
    const body = proportionalLineHeight(32) / 32;
    expect(huge).toBeLessThan(body);
  });

  it("clamps within [1.05, 1.85]", () => {
    expect(proportionalLineHeight(8) / 8).toBeLessThanOrEqual(1.85);
    expect(proportionalLineHeight(200) / 200).toBeGreaterThanOrEqual(1.05);
  });

  it("returns integer px values", () => {
    expect(Number.isInteger(proportionalLineHeight(32))).toBe(true);
  });
});
