import { expect, test } from "bun:test";
import { createArticleStyleSnapshot, validateArticleStyleSnapshot } from "../article-style";

const manifest = {
  schemaVersion: 1, engineVersion: 1, id: "style-1", name: "正文样式", version: "1.0.0",
  editorVars: { "--brand": "#AABBCC" },
  exportTheme: { bodyFontSize: "18.00px", bodyLineHeight: "1.80", primaryColor: "#AABBCC", h2Color: "#112233" },
  syntaxPresets: { h2: "pillar" },
};

test("正文样式规范化、内容 hash 与修订身份独立且可严格回读", () => {
  const snapshot = createArticleStyleSnapshot(manifest, manifest.id, 1);
  expect(snapshot.manifest.exportTheme.bodyFontSize).toBe("18px");
  expect(snapshot.manifest.exportTheme.bodyLineHeight).toBe("1.8");
  expect(snapshot.manifest.editorVars["--brand"]).toBe("#aabbcc");
  expect(snapshot.manifest.css).toBe("");
  expect(validateArticleStyleSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  expect(createArticleStyleSnapshot(snapshot.manifest, manifest.id, 2).hash).toBe(snapshot.hash);
  const reordered = Object.fromEntries(Object.entries(manifest).reverse());
  expect(createArticleStyleSnapshot(reordered, manifest.id, 1).hash).toBe(snapshot.hash);
});

test("正文快照拒绝未知版本、身份分裂、篡改及未支持字段", () => {
  const snapshot = createArticleStyleSnapshot(manifest, manifest.id, 1);
  for (const patch of [{ schemaVersion: 2 }, { revision: 0 }, { id: "other" }, { hash: "0".repeat(64) }, { path: "/private/style.json" }]) {
    expect(() => validateArticleStyleSnapshot({ ...snapshot, ...patch })).toThrow();
  }
  for (const patch of [
    { engineVersion: 2 }, { css: "p { color: red }" }, { structure: {} }, { assets: [] }, { fonts: [] },
    { editorVars: { "--font": "serif" } }, { editorVars: { "--brand": "url(https://example.test/a)" } },
    { exportTheme: { bodyFontSize: "25px" } }, { exportTheme: { bodyLineHeight: "1.1" } },
    { exportTheme: { fontFamily: "serif" } }, { syntaxPresets: { h2: "unknown" } },
  ]) expect(() => createArticleStyleSnapshot({ ...manifest, ...patch }, manifest.id, 1)).toThrow();
});
