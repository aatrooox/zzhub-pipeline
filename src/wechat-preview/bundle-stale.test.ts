import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { isWechatPreviewBundleStale } from "./index";

describe("isWechatPreviewBundleStale", () => {
  test("returns true when manifest is missing", () => {
    const dir = mkdtempSync(join(tmpdir(), "zzhub-bundle-stale-"));
    try {
      expect(isWechatPreviewBundleStale([], join(dir, "missing.json"))).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns true when a source is newer than manifest", () => {
    const dir = mkdtempSync(join(tmpdir(), "zzhub-bundle-stale-"));
    try {
      const src = join(dir, "src.css");
      const manifest = join(dir, "manifest.json");
      writeFileSync(manifest, "{}");
      // ensure source is newer
      const now = Date.now();
      writeFileSync(src, "body{}");
      // touch source mtime into the future relative to manifest by rewriting after delay is flaky;
      // instead set source after manifest with a small sleep via Bun
      Bun.sleepSync(20);
      writeFileSync(src, "body{color:red}");
      void now;
      expect(isWechatPreviewBundleStale([src], manifest)).toBe(true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("returns false when sources are older than manifest", () => {
    const dir = mkdtempSync(join(tmpdir(), "zzhub-bundle-stale-"));
    try {
      const srcDir = join(dir, "src");
      mkdirSync(srcDir);
      const src = join(srcDir, "src.css");
      writeFileSync(src, "body{}");
      Bun.sleepSync(20);
      const manifest = join(dir, "manifest.json");
      writeFileSync(manifest, "{}");
      expect(isWechatPreviewBundleStale([src], manifest)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
