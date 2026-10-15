import { describe, expect, test } from "bun:test";
import { SYNTAX_CATEGORIES, buildCombinedPresetsCss } from "./syntax-presets";

describe("syntax presets module", () => {
  test("only multi-preset categories remain; single-style nodes are covered by article.css", () => {
    const keys = SYNTAX_CATEGORIES.map((c) => c.key);
    expect(keys).toContain("h2");
    expect(keys).toContain("h3");
    expect(keys).toContain("blockquote");
    expect(keys).toContain("divider");
    expect(keys).toContain("article-card");
    expect(keys).not.toContain("h1");
    expect(keys).not.toContain("p");
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

  test("buildCombinedPresetsCss falls back to default preset when key missing or unknown", () => {
    const css = buildCombinedPresetsCss({});
    expect(css).toContain(".milkdown .editor h2");
    expect(css).toContain("border-left: 4px solid");

    expect(buildCombinedPresetsCss({ h2: "bottom-line" })).toContain("padding-bottom: 0.45em");
    expect(buildCombinedPresetsCss({ h2: "no-such-preset" })).toContain("border-left: 4px solid");
  });
});
