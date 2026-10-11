import { describe, expect, test } from "bun:test";
import { SYNTAX_CATEGORIES, buildCombinedPresetsCss } from "./syntax-presets";

describe("syntax presets module", () => {
  test("defines comprehensive markdown categories including h1, p, table, code, callout, etc.", () => {
    const keys = SYNTAX_CATEGORIES.map((c) => c.key);
    expect(keys).toContain("h1");
    expect(keys).toContain("h2");
    expect(keys).toContain("h3");
    expect(keys).toContain("h4");
    expect(keys).toContain("p");
    expect(keys).toContain("strong");
    expect(keys).toContain("del");
    expect(keys).toContain("mark");
    expect(keys).toContain("inline-code");
    expect(keys).toContain("code-block");
    expect(keys).toContain("blockquote");
    expect(keys).toContain("list");
    expect(keys).toContain("task-list");
    expect(keys).toContain("divider");
    expect(keys).toContain("link");
    expect(keys).toContain("image");
    expect(keys).toContain("table");
    expect(keys).toContain("callout");
    expect(keys).toContain("kbd");
    expect(keys).toContain("badge");
  });

  test("h2 category includes pillar, bottom-line, gradient-pill, contrast-green, card-tag, and plain presets", () => {
    const h2Cat = SYNTAX_CATEGORIES.find((c) => c.key === "h2");
    expect(h2Cat).toBeDefined();
    const presetIds = h2Cat!.presets!.map((p) => p.id);
    expect(presetIds).toContain("pillar");
    expect(presetIds).toContain("bottom-line");
    expect(presetIds).toContain("gradient-pill");
    expect(presetIds).toContain("contrast-green");
    expect(presetIds).toContain("card-tag");
    expect(presetIds).toContain("plain");
  });

  test("single-syntax categories provide baseline CSS and descriptions", () => {
    const h1Cat = SYNTAX_CATEGORIES.find((c) => c.key === "h1");
    expect(h1Cat?.css).toContain(".milkdown .editor h1");
    expect(h1Cat?.description).toBeTruthy();

    const tableCat = SYNTAX_CATEGORIES.find((c) => c.key === "table");
    expect(tableCat?.css).toContain(".milkdown .editor table");

    const codeCat = SYNTAX_CATEGORIES.find((c) => c.key === "code-block");
    expect(codeCat?.css).toContain(".milkdown .editor pre");
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
