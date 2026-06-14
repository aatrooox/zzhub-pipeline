import { describe, expect, test } from "bun:test";
import { getPublishProvider, listPublishProviders } from "./index";

describe("listPublishProviders", () => {
  test("returns registered routes", () => {
    const routes = listPublishProviders();
    expect(routes).toContain("wechat-article");
    expect(routes).toContain("wechat-newspic");
  });
});

describe("getPublishProvider", () => {
  test("returns a function for wechat-article", () => {
    const provider = getPublishProvider("wechat-article");
    expect(typeof provider).toBe("function");
  });

  test("returns a function for wechat-newspic", () => {
    const provider = getPublishProvider("wechat-newspic");
    expect(typeof provider).toBe("function");
  });

  test("throws for unregistered route", () => {
    expect(() => getPublishProvider("nonexistent" as never)).toThrow();
  });
});
