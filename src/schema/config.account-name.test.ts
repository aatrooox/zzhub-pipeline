import { describe, expect, test } from "bun:test";

import { normalizeConfig, SUGGESTED_ACCOUNT_NAMES } from "../config";
import { fillWxAccountConfig } from "../providers/wechat";
import { PipelineConfigSchema } from "./config";

describe("wx account display name", () => {
  test("schema keeps name when provided", () => {
    const parsed = PipelineConfigSchema.parse({
      wx: {
        accounts: {
          default: {
            name: "早早集市",
            appId: "wx123",
          },
        },
      },
    });
    expect(parsed.wx.accounts.default?.name).toBe("早早集市");
    expect(parsed.wx.accounts.default?.appId).toBe("wx123");
  });

  test("schema defaults name to empty string when missing", () => {
    const parsed = PipelineConfigSchema.parse({
      wx: {
        accounts: {
          custom: {
            appId: "wx999",
          },
        },
      },
    });
    // custom key has no soft-suggest unless normalizeConfig is used
    expect(parsed.wx.accounts.custom?.name).toBe("");
  });

  test("normalizeConfig soft-fills known keys only when name empty", () => {
    const normalized = normalizeConfig({
      wx: {
        accounts: {
          default: { appId: "wx1" },
          ancientone: { name: "我自定义的小号", appId: "wx2" },
          other: { appId: "wx3" },
        },
      },
    });
    expect(normalized.wx.accounts.default?.name).toBe(SUGGESTED_ACCOUNT_NAMES.default);
    expect(normalized.wx.accounts.ancientone?.name).toBe("我自定义的小号");
    expect(normalized.wx.accounts.other?.name).toBe("");
  });

  test("normalizeConfig does not override explicit empty-then-set name after trim", () => {
    const normalized = normalizeConfig({
      wx: {
        accounts: {
          default: { name: "  大号定制  ", appId: "wx1" },
        },
      },
    });
    expect(normalized.wx.accounts.default?.name).toBe("大号定制");
  });

  test("fillWxAccountConfig preserves name", () => {
    const filled = fillWxAccountConfig({
      name: "大号",
      pat: "p",
      appId: "id",
      appSecret: "s",
      customCss: null,
      theme: { editorVars: {}, exportTheme: {} },
    });
    expect(filled.name).toBe("大号");
  });

  test("fillWxAccountConfig defaults name to empty", () => {
    const filled = fillWxAccountConfig(undefined);
    expect(filled.name).toBe("");
  });
});
