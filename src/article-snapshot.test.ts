import { expect, test } from "bun:test";
import { createArticleSnapshot, validateArticleSnapshot, rewriteArticleImages, createArtifactManifest, hashArtifactManifest, validateArtifactManifest } from "../article-snapshot";

const asset = { id: "31161ca7-af98-4a84-adc7-c60885a3bd0f", sha256: "a".repeat(64), contentType: "image/png" as const, byteLength: 100, width: 10, height: 10 };
const input = { documentId: "521b9c37-1d74-4f23-a0ad-1801ad2f3669", documentRevision: 1, title: "预览", account: "fixed-account", body: `![描述](asset:${asset.id} "图注")`, bodyAssets: [asset] };

test("完整文章输入 hash 绑定修订、正文/账号及素材，拒绝未托管/过量图片", () => {
  const snapshot = createArticleSnapshot(input);
  expect(validateArticleSnapshot(snapshot, input)).toEqual(snapshot);
  expect(() => validateArticleSnapshot(snapshot, { ...input, title: "变化" })).toThrow("input hash");
  expect(createArticleSnapshot({ ...input, documentRevision: 2 }).inputHash).not.toBe(snapshot.inputHash);
  for (const body of ["![外图](https://example.test/a.png)", "<img src='asset:bad'>", Array(21).fill(input.body).join("\n")]) expect(() => createArticleSnapshot({ ...input, body })).toThrow();
  expect(() => createArticleSnapshot({ ...input, bodyAssets: [asset, asset] })).toThrow("Duplicate");
  expect(() => validateArticleSnapshot({ ...snapshot, schemaVersion: 2 }, input)).toThrow();
});

test("图片引用转换保定义图注、描述与代码/普通链接/共享definition", () => {
  const source = '[普通][shared]\n\n![描述][shared]\n\n[shared]: /api/assets/body/image "定义图注"\n\n```md\n![代码](/api/assets/body/image)\n```';
  const rewritten = rewriteArticleImages(source, () => `asset:${asset.id}`);
  expect(rewritten).toContain(`![描述](asset:${asset.id} "定义图注")`);
  expect(rewritten).toContain('[shared]: /api/assets/body/image "定义图注"');
  expect(rewritten).toContain('[普通][shared]');
  expect(rewritten).toContain('![代码](/api/assets/body/image)');
  const brackets = rewriteArticleImages('![左\\[右\\]尾][shared]\n\n[shared]: /image "图注"', () => `asset:${asset.id}`);
  expect(brackets).toContain(`![左\\[右\\]尾](asset:${asset.id} "图注")`);
  expect(createArticleSnapshot({ ...input, body: brackets }).inputHash).toBeTruthy();
});

test("产物 manifest 严格固定key/type和双hash身份", () => {
  const manifest = createArtifactManifest({ snapshotHash: "b".repeat(64), runtime: { pipeline: "0.22.0", myno: "0.4.1", typeset: "0.4.0" }, artifacts: [
    { key: "cover", kind: "cover", contentType: "image/png", byteLength: 1, sha256: "c".repeat(64) },
    { key: "article", kind: "html", contentType: "text/html", byteLength: 2, sha256: "d".repeat(64) },
    { key: `media_${asset.id}`, kind: "media", contentType: "image/png", byteLength: 100, sha256: asset.sha256 },
  ] });
  expect(validateArtifactManifest(manifest, hashArtifactManifest(manifest))).toEqual(manifest);
  expect(() => validateArtifactManifest(manifest, "0".repeat(64))).toThrow();
  expect(() => validateArtifactManifest({ ...manifest, path: "/private/html" })).toThrow();
  expect(() => createArtifactManifest({ ...manifest, artifacts: [...manifest.artifacts, manifest.artifacts[0]!] })).toThrow();
});
