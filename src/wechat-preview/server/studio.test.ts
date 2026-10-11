import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { tmpdir } from "os";
import { join } from "path";
import { startPreviewServer, type StartPreviewServerResult } from "./http";

let server: StartPreviewServerResult;
const testConfigPath = join(tmpdir(), `zzhub-test-studio-server-${process.pid}.json`);
const testServerDir = join(tmpdir(), `zzhub-test-studio-server-dir-${process.pid}`);
process.env.ZZHUB_PIPELINE_CONFIG = testConfigPath;
process.env.ZZHUB_WECHAT_PREVIEW_DIR = testServerDir;

beforeAll(async () => {
  server = await startPreviewServer({
    host: "127.0.0.1",
    port: 0,
    reuseExisting: false,
  });
});

afterAll(() => {
  server.stop?.();
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
      },
      syntaxPresets: {
        h2: "gradient-pill",
        blockquote: "tint-card",
      },
      customCss: "/* studio test css */\nh2 { color: #336699; }",
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
    expect(defaultAccount.theme.syntaxPresets?.h2).toBe("gradient-pill");
    expect(defaultAccount.theme.syntaxPresets?.blockquote).toBe("tint-card");
    expect(defaultAccount.customCssContent).toContain("/* studio test css */");
  });

  test("GET /studio serves the Studio HTML dashboard", async () => {
    const res = await fetch(`${server.url}/studio`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("WeChat Visual Studio");
    expect(html).toContain("studio.js");
  });
});
