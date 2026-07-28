import { describe, expect, test } from "bun:test";
import { homedir } from "os";
import { join } from "path";
import { resolveLocalFilePath, rewriteHtmlLocalAssets } from "./local-file";

describe("resolveLocalFilePath", () => {
  test("rejects empty path", () => {
    expect(resolveLocalFilePath("")).toEqual({
      ok: false,
      status: 400,
      error: "missing path",
    });
  });

  test("rejects relative paths", () => {
    const result = resolveLocalFilePath("relative/img.png");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(400);
  });

  test("rejects path outside home (except /tmp)", () => {
    const result = resolveLocalFilePath("/etc/passwd");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(403);
  });

  test("accepts existing file under home", () => {
    // package.json under repo may be outside home in some setups; use a file in home if possible
    const candidate = join(homedir(), ".zshrc");
    const result = resolveLocalFilePath(candidate);
    if (result.ok) {
      expect(result.path).toBe(candidate);
    } else {
      // .zshrc may not exist; still ensure absolute home path is not rejected for wrong reason
      expect(result.status).not.toBe(403);
    }
  });
});

describe("rewriteHtmlLocalAssets", () => {
  test("rewrites absolute img src to local-file proxy", () => {
    const html = '<img src="/Users/me/pic.png" alt="x">';
    const out = rewriteHtmlLocalAssets(html, "http://127.0.0.1:18765");
    expect(out).toContain("/local-file?path=");
    expect(out).toContain(encodeURIComponent("/Users/me/pic.png"));
  });

  test("leaves https sources alone", () => {
    const html = '<img src="https://cdn.example.com/a.png">';
    expect(rewriteHtmlLocalAssets(html, "http://127.0.0.1:18765")).toBe(html);
  });
});
