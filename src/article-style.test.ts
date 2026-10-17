import { expect, test } from "bun:test";
import { createArticleStyleSnapshot, createArticleStyleSnapshotV2, validateArticleStyleSnapshot } from "./article-style";

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

test("完整正文v2保留全部主题变量、语法、结构和CSS，禁止外部资源", () => {
  const full = { ...manifest, css: ".milkdown p { color: #123456; }", editorVars: { "--brand": "#123456", "--body-font-family": "serif" },
    exportTheme: { bodyFontSize: "22px", fontFamily: "serif", quoteBorderColor: "#123456" },
    syntaxPresets: { h2: "bottom-line", blockquote: "card", table: "zebra" },
    structure: { numberedHeadings: true, headingLabel: "章节", quoteLabel: "摘录" } };
  const snapshot = createArticleStyleSnapshotV2(full, full.id, 1);
  expect(snapshot.schemaVersion).toBe(2);
  expect(snapshot.manifest.structure).toMatchObject(full.structure);
  expect(snapshot.manifest.exportTheme).toEqual(full.exportTheme);
  expect(snapshot.manifest.syntaxPresets).toEqual(full.syntaxPresets);
  expect(validateArticleStyleSnapshot(snapshot)).toEqual(snapshot);
  expect(createArticleStyleSnapshotV2(Object.fromEntries(Object.entries(full).reverse()), full.id, 1).hash).toBe(snapshot.hash);
  for (const patch of [{ css: "p { background:url(https://evil.test/a) }" }, { css: "@import 'https://evil.test/x';" },
    { css: 'p { background-image: image-set("https://evil.test/a" 1x); }' },
    { css: 'p { background-image: -webkit-image-set/**/("https://evil.test/a" 1x); }' },
    { editorVars: { "--background": 'image-set("https://evil.test/a" 1x)' } },
    { assets: ["local.png"] }, { structure: { headerImage: "/private/secret" } }]) {
    expect(() => createArticleStyleSnapshotV2({ ...full, ...patch }, full.id, 1)).toThrow();
  }
  expect(() => createArticleStyleSnapshotV2({ ...full, css: undefined }, full.id, 1)).toThrow();
});
