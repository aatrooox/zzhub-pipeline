import { describe, expect, test } from "bun:test";
import { normalizeConfig } from "./config";
import { resolveRenderBranding } from "./render-branding";
import { RenderBrandingSchema, RenderConfigSchema } from "./schema/config";
import { z } from "zod";

describe("render branding", () => {
  test("global and per-account branding preserve URLs, local paths and empty overrides", () => {
    const config = normalizeConfig({ render: { branding: {
      logo: "https://example.com/global.png", footerText: "全局署名",
      accounts: { ancientone: { logo: "/tmp/local-logo.png", footerText: "账号署名" }, hidden: { logo: "", footerText: "" } },
    } } });
    expect(resolveRenderBranding(config, "default")).toEqual({ logo: "https://example.com/global.png", footerText: "全局署名" });
    expect(resolveRenderBranding(config, "ancientone")).toEqual({ logo: "/tmp/local-logo.png", footerText: "账号署名" });
    expect(resolveRenderBranding(config, "hidden")).toEqual({ logo: "", footerText: "" });
    expect(resolveRenderBranding(normalizeConfig({ imgx: { icon: "https://example.com/legacy.svg" } }), "default").logo).toBe("https://example.com/legacy.svg");
  });

  test("default branding remains compatible and App schemas include editable fields", () => {
    const defaults = normalizeConfig({});
    expect(resolveRenderBranding(defaults, "default").footerText).toBe("公众号 · 早早集市");
    expect(resolveRenderBranding(defaults, "ancientone").logo.endsWith("ancientone-logo.png")).toBe(true);
    expect(JSON.stringify(z.toJSONSchema(RenderBrandingSchema))).toContain('"footerText"');
    expect(JSON.stringify(z.toJSONSchema(RenderConfigSchema))).toContain('"defaultTheme"');
  });
});
