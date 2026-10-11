import { describe, expect, test } from "bun:test";
import { COLOR_PALETTES } from "./color-palettes";

describe("color palettes module", () => {
  test("defines at least 7 curated palettes", () => {
    expect(COLOR_PALETTES.length).toBeGreaterThanOrEqual(7);
  });

  test("each palette contains valid 6-digit hex color codes for all required keys", () => {
    const hexPattern = /^#[0-9a-f]{6}$/i;
    for (const p of COLOR_PALETTES) {
      expect(p.id).toBeTruthy();
      expect(p.name).toBeTruthy();
      expect(p.category).toBeTruthy();
      expect(p.description).toBeTruthy();

      expect(p.colors.brand).toMatch(hexPattern);
      expect(p.colors.text).toMatch(hexPattern);
      expect(p.colors.h2).toMatch(hexPattern);
      expect(p.colors.h3).toMatch(hexPattern);
      expect(p.colors.quote).toMatch(hexPattern);
      expect(p.colors.divider).toMatch(hexPattern);
    }
  });

  test("contains distinct IDs across all palettes", () => {
    const ids = COLOR_PALETTES.map((p) => p.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});
