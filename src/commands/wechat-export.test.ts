import { describe, expect, test } from "bun:test";
import { resolveConfigRelativePath } from "../config";
import { resolveWechatExportCustomCss } from "./wechat-export";

describe("wechat-export custom CSS path precedence", () => {
  const configPath = "/workspace/config/config.json";

  test("resolves configured CSS relative to the config file", () => {
    expect(resolveConfigRelativePath("themes/account.css", configPath)).toBe(
      "/workspace/config/themes/account.css",
    );
  });

  test("keeps an absolute configured CSS path", () => {
    expect(resolveConfigRelativePath("/opt/zzhub/account.css", configPath)).toBe(
      "/opt/zzhub/account.css",
    );
  });

  test("uses account CSS when the CLI override is absent", () => {
    expect(resolveWechatExportCustomCss(
      undefined,
      "themes/account.css",
      "/workspace/post",
      configPath,
    )).toBe("/workspace/config/themes/account.css");
  });

  test("CLI CSS replaces account CSS and resolves from the current directory", () => {
    expect(resolveWechatExportCustomCss(
      "./local.css",
      "themes/account.css",
      "/workspace/post",
      configPath,
    )).toBe("/workspace/post/local.css");
  });

  test("returns null when neither source configures CSS", () => {
    expect(resolveWechatExportCustomCss(undefined, null, "/workspace/post", configPath)).toBeNull();
  });
});
