import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { normalizeConfig, setConfigValue } from "../config";
import { CoverConfigSchema, mergeCoverSettings, resolveCoverTheme } from "./cover-theme";

describe("cover themes", () => {
  test("old configs receive ten editable themes and retain account defaults", () => {
    const config = normalizeConfig({ imgx: { icon: "custom.png" } });
    expect(Object.keys(config.render.cover.themes)).toHaveLength(10);
    expect(resolveCoverTheme(config.render.cover, "poster-3-4", "default").id).toBe("fresh-sage");
    expect(resolveCoverTheme(config.render.cover, "poster-3-4", "ancientone").id).toBe("soft-rose");
    expect(resolveCoverTheme(config.render.cover, "poster-3-4", "ancientone", "technology").id).toBe("technology");
    expect(config.imgx.icon).toBe("custom.png");
  });

  test("format overrides keep the theme font and unrelated colors", () => {
    const config = CoverConfigSchema.parse({});
    config.themes.serious!.formats["wechat-cover-split"].colors = { accent: "#FF0000" };
    const theme = resolveCoverTheme(config, "wechat-cover-split", null, "serious");
    expect(theme.typography.title.fontFamily).toBe("LXGWNeoZhiSongPlus");
    expect(theme.typography.title.fontSize).toBe(88);
    expect(theme.colors.text).toBe("#202020");
    expect(theme.colors.accent).toBe("#FF0000");
    const partial = CoverConfigSchema.parse({ themes: { ...config.themes, serious: { name: "严肃", typography: { title: { fontFamily: "LXGWNeoZhiSongPlus" } }, formats: { "wechat-cover-split": { colors: { accent: "#123456" } } } } } });
    const banner = resolveCoverTheme(partial, "wechat-cover-split", null, "serious");
    expect(banner.typography.title.fontSize).toBe(88);
    expect(banner.typography.title.fontFamily).toBe("LXGWNeoZhiSongPlus");
    expect(banner.layout.safeArea.top).toBe(34);
  });

  test("partial edits preserve other themes and round-trip without resetting changes", () => {
    const config = normalizeConfig({});
    const patch = { cover: { themes: { business: { typography: { title: { fontSize: 100 } } } } } };
    const updated = normalizeConfig({ ...config, render: mergeCoverSettings(config.render, patch) });
    expect(updated.render.cover.themes.business!.typography.title.fontSize).toBe(100);
    expect(updated.render.cover.themes.business!.typography.title.minFontSize).toBe(64);
    expect(updated.render.cover.themes.technology).toEqual(config.render.cover.themes.technology);
    expect(normalizeConfig(JSON.parse(JSON.stringify(updated))).render).toEqual(updated.render);
    const scalar = setConfigValue(updated, "render.cover.themes.business.colors.accent", "#123456");
    expect(scalar.render.cover.themes.business!.colors.accent).toBe("#123456");
  });

  test("schema is serializable and invalid references, sizes and unsafe fields fail", () => {
    const schema = z.toJSONSchema(CoverConfigSchema);
    expect(schema.type).toBe("object");
    expect(JSON.stringify(schema)).toContain("wechat-cover-split");
    expect(() => CoverConfigSchema.parse({ defaultTheme: "missing" })).toThrow("主题不存在");
    const config = normalizeConfig({});
    expect(() => setConfigValue(config, "render.cover.themes.business.typography.title.minFontSize", "150")).toThrow("最小字号");
    expect(() => setConfigValue(config, "render.cover.themes.business.layout.safeArea.left", "900")).toThrow("安全区");
    expect(() => setConfigValue(config, "render.cover.themes.business.colors.text", "red;background:url(x)")).toThrow();
    expect(() => setConfigValue(config, "render.cover.themes.__proto__.name", "bad")).toThrow("invalid config key");
  });
});
