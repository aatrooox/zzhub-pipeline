import { describe, expect, test } from "bun:test";
import { join } from "path";
import { extractLocalImagePaths, replaceLocalImagePaths } from "./blog";

describe("extractLocalImagePaths", () => {
  test("extracts local image paths from markdown", () => {
    const content = "![cover](./cover.jpg)\n\nSome text\n\n![other](images/other.png)";
    const pathMap = extractLocalImagePaths(content, "/workspace/assets");
    expect(pathMap.get("./cover.jpg")).toBe(join("/workspace/assets", "cover.jpg"));
    expect(pathMap.get("images/other.png")).toBe(join("/workspace/assets", "images/other.png"));
  });

  test("skips http/https URLs", () => {
    const content = "![remote](https://example.com/img.png)\n![local](./local.png)";
    const pathMap = extractLocalImagePaths(content, "/workspace");
    expect(pathMap.size).toBe(1);
    expect(pathMap.has("./local.png")).toBe(true);
  });

  test("returns empty map for no images", () => {
    expect(extractLocalImagePaths("just text", "/workspace").size).toBe(0);
  });

  test("handles multiple images", () => {
    const content = "![a](a.png) ![b](b.png) ![c](c.png)";
    const pathMap = extractLocalImagePaths(content, "/base");
    expect(pathMap.size).toBe(3);
  });
});

describe("replaceLocalImagePaths", () => {
  test("replaces local paths with URLs from the map", () => {
    const content = "![cover](./cover.jpg)";
    const urlMap = new Map([["./cover.jpg", "https://cdn.com/cover.jpg"]]);
    const result = replaceLocalImagePaths(content, urlMap);
    expect(result).toBe("![cover](https://cdn.com/cover.jpg)");
  });

  test("leaves unmapped images unchanged", () => {
    const content = "![a](./a.png) ![b](./b.png)";
    const urlMap = new Map([["./a.png", "https://cdn.com/a.png"]]);
    const result = replaceLocalImagePaths(content, urlMap);
    expect(result).toBe("![a](https://cdn.com/a.png) ![b](./b.png)");
  });

  test("leaves http URLs untouched", () => {
    const content = "![remote](https://example.com/img.png)";
    const urlMap = new Map<string, string>();
    expect(replaceLocalImagePaths(content, urlMap)).toBe(content);
  });

  test("preserves alt text", () => {
    const content = "![my alt text](./img.png)";
    const urlMap = new Map([["./img.png", "https://cdn.com/img.png"]]);
    const result = replaceLocalImagePaths(content, urlMap);
    expect(result).toBe("![my alt text](https://cdn.com/img.png)");
  });
});
