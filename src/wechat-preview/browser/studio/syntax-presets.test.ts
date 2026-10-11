import { describe, expect, test } from "bun:test";
import { SYNTAX_CATEGORIES, buildCombinedPresetsCss } from "./syntax-presets";

describe("syntax presets module", () => {
  test("defines categories for h2, h3, blockquote, and divider", () => {
    const keys = SYNTAX_CATEGORIES.map((c) => c.key);
    expect(keys).toContain("h2");
    expect(keys).toContain("h3");
    expect(keys).toContain("blockquote");
    expect(keys).toContain("divider");
  });

  test("h2 category includes pillar, bottom-line, gradient-pill, contrast-green, card-tag, and plain presets", () => {
    const h2Cat = SYNTAX_CATEGORIES.find((c) => c.key === "h2");
    expect(h2Cat).toBeDefined();
    const presetIds = h2Cat!.presets.map((p) => p.id);
    expect(presetIds).toContain("pillar");
    expect(presetIds).toContain("bottom-line");
    expect(presetIds).toContain("gradient-pill");
    expect(presetIds).toContain("contrast-green");
    expect(presetIds).toContain("card-tag");
    expect(presetIds).toContain("plain");
  });

  test("buildCombinedPresetsCss generates valid aggregated CSS blocks", () => {
    const css = buildCombinedPresetsCss({
      h2: "gradient-pill",
      h3: "left-bar",
      blockquote: "tint-card",
      divider: "dashed",
    });

    expect(css).toContain("linear-gradient");
    expect(css).toContain(".milkdown .editor h2");
    expect(css).toContain(".milkdown .editor h3");
    expect(css).toContain(".milkdown .editor blockquote");
    expect(css).toContain(".milkdown .editor hr");
    expect(css).toContain("dashed");
  });

  test("buildCombinedPresetsCss falls back to default preset when key missing", () => {
    const css = buildCombinedPresetsCss({});
    expect(css).toContain(".milkdown .editor h2");
    expect(css).toContain("border-left: 2.5px solid");
  });
});
