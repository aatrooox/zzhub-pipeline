import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { tmpdir } from "os";
import { join } from "path";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { startPreviewServer, type StartPreviewServerResult } from "./http";
import { loadConfig, saveConfig } from "../../config";

let server: StartPreviewServerResult;
const previousConfig = process.env.ZZHUB_PIPELINE_CONFIG;
const previousServerDir = process.env.ZZHUB_WECHAT_PREVIEW_DIR;
let testDir: string;
let testConfigPath: string;

beforeAll(async () => {
  testDir = mkdtempSync(join(tmpdir(), "zzhub-test-studio-"));
  testConfigPath = join(testDir, "config", "config.json");
  process.env.ZZHUB_PIPELINE_CONFIG = testConfigPath;
  process.env.ZZHUB_WECHAT_PREVIEW_DIR = join(testDir, "server");
  server = await startPreviewServer({
    host: "127.0.0.1",
    port: 0,
    reuseExisting: false,
  });
});

afterAll(() => {
  server.stop?.();
  rmSync(testDir, { recursive: true, force: true });
  if (previousConfig === undefined) delete process.env.ZZHUB_PIPELINE_CONFIG;
  else process.env.ZZHUB_PIPELINE_CONFIG = previousConfig;
  if (previousServerDir === undefined) delete process.env.ZZHUB_WECHAT_PREVIEW_DIR;
  else process.env.ZZHUB_WECHAT_PREVIEW_DIR = previousServerDir;
});

describe("wechat-preview studio server APIs", () => {
  test("GET /api/studio/config returns accounts, plugins and sample markdown", async () => {
    const res = await fetch(`${server.url}/api/studio/config`);
    expect(res.status).toBe(200);

    const data = (await res.json()) as any;
    expect(data.defaultAccount).toBeDefined();
    expect(data.accounts).toBeDefined();
    expect(data.plugins).toBeDefined();
    expect(Array.isArray(data.plugins)).toBe(true);

    const pluginIds = data.plugins.map((p: any) => p.id);
    expect(pluginIds).toContain("callout");
    expect(pluginIds).toContain("highlight");
    expect(pluginIds).toContain("kbd");
    expect(pluginIds).toContain("badge");

    expect(typeof data.sampleMarkdown).toBe("string");
    expect(data.sampleMarkdown.length).toBeGreaterThan(0);
  });

  test("POST /api/studio/save-config updates and persists theme settings", async () => {
    const payload = {
      account: "default",
      editorVars: {
        "--brand": "#336699",
      },
      exportTheme: {
        bodyLineHeight: "1.92",
        primaryColor: "#336699",
        bodyFontSize: "20px",
        bodyParagraphSpacing: "1.6em",
      },
      syntaxPresets: {
        h2: "gradient-pill",
        blockquote: "tint-card",
      },
      customCss: "/* studio test css */\nh2 { color: #336699; }",
      structure: { numberedHeadings: true, headingLabel: "章节" },
    };

    const res = await fetch(`${server.url}/api/studio/save-config`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.ok).toBe(true);
    expect(data.account).toBe("default");

    // Fetch config back to verify persistence
    const checkRes = await fetch(`${server.url}/api/studio/config`);
    const checkData = (await checkRes.json()) as any;
    const defaultAccount = checkData.accounts.default;
    expect(defaultAccount.theme.editorVars["--brand"]).toBe("#336699");
    expect(defaultAccount.theme.exportTheme.bodyLineHeight).toBe("1.92");
    expect(defaultAccount.theme.exportTheme.bodyFontSize).toBe("20px");
    expect(defaultAccount.theme.exportTheme.bodyParagraphSpacing).toBe("1.6em");
    expect(defaultAccount.theme.syntaxPresets?.h2).toBe("gradient-pill");
    expect(defaultAccount.theme.syntaxPresets?.blockquote).toBe("tint-card");
    expect(defaultAccount.customCssContent).toContain("/* studio test css */");
    const cleared = await fetch(`${server.url}/api/studio/save-config`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ account: "default", structure: { headingLabel: "" }, syntaxPresets: {} }),
    });
    expect(cleared.status).toBe(200);
    const saved = JSON.parse(readFileSync(testConfigPath, "utf8"));
    expect(saved.wx.accounts.default.theme.structure.headingLabel).toBe("");
    expect(saved.wx.accounts.default.theme.syntaxPresets).toEqual({});
  });

  test("rejects malformed settings and cross-origin writes without changing files", async () => {
    const before = readFileSync(testConfigPath, "utf8");
    for (const payload of [null, [], { editorVars: { "--brand": 42 } }, { structure: { numberedHeadings: "yes" } }, { account: "../../outside" }]) {
      const res = await fetch(`${server.url}/api/studio/save-config`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
      });
      expect(res.status).toBe(400);
    }
    const res = await fetch(`${server.url}/api/studio/save-config`, {
      method: "POST", headers: { "content-type": "text/plain", origin: "https://other.example" },
      body: JSON.stringify({ customCss: "p { color: red; }" }),
    });
    expect(res.status).toBe(403);
    expect(readFileSync(testConfigPath, "utf8")).toBe(before);
  });

  test("loads account article theme CSS, structure and header into Studio", async () => {
    const themeDir = join(testDir, "theme");
    mkdirSync(themeDir);
    const files = {
      "manifest.json": JSON.stringify({ schemaVersion: 1, engineVersion: 1, id: "studio", name: "Studio theme", version: "1.0.0", structure: { quoteLabel: "From template", headerImage: "header.png" } }),
      "article.css": "p { color: #123456; }", "example.md": "body", "preview.html": "preview", "LICENSE.txt": "test", "header.png": "image",
    };
    for (const [name, content] of Object.entries(files)) writeFileSync(join(themeDir, name), content);
    const config = loadConfig();
    config.wx.accounts.default.articleTheme = themeDir;
    saveConfig(config);
    try {
      const data = await (await fetch(`${server.url}/api/studio/config`)).json() as any;
      expect(data.accounts.default.articleThemeCss).toContain("#123456");
      expect(data.accounts.default.theme.structure.quoteLabel).toBe("From template");
      expect(data.accounts.default.theme.structure.headerImageUrl).toBe("data:image/png;base64,aW1hZ2U=");
      expect(data.accounts.default.theme.structure.headerImage).toBeUndefined();
    } finally {
      config.wx.accounts.default.articleTheme = null;
      saveConfig(config);
    }
  });

  test("reports a missing configured stylesheet instead of offering an empty replacement", async () => {
    const config = loadConfig();
    const originalCss = config.wx.accounts.default.customCss;
    config.wx.accounts.default.customCss = "missing.css";
    saveConfig(config);
    try {
      const response = await fetch(`${server.url}/api/studio/config`);
      expect(response.status).toBe(500);
      expect((await response.json() as any).error).toContain("Failed to read custom CSS");
    } finally {
      config.wx.accounts.default.customCss = originalCss;
      saveConfig(config);
    }
  });

  test("GET /studio serves the Studio HTML dashboard", async () => {
    const res = await fetch(`${server.url}/studio`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("WeChat Visual Studio");
    expect(html).toContain("studio.js");
  });
});
