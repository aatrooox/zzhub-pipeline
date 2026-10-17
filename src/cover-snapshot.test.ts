import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { ARTICLE_COVER_FONT, DEFAULT_ARTICLE_COVER_CONTROLS } from "@akairos/typeset-studio/cover";
import { createCoverSnapshot, createRenderedCoverSnapshot, coverSnapshotIdentity, hashRenderedCoverTitle, validateCoverSnapshot } from "./cover-snapshot";
import { canonicalHash } from "./snapshot-identity";

function input() {
  const canvas = createCanvas(1000, 1000);
  canvas.getContext("2d").fillRect(0, 0, 1000, 1000);
  const bytes = canvas.toBuffer("image/jpeg");
  return {
    id: "adca5060-0ef7-49fa-bfc5-567208a70494", revision: 1, name: "封面",
    controls: { ...DEFAULT_ARTICLE_COVER_CONTROLS, backgroundColor: "#AABBCC" },
    asset: { id: "3aebf96a-455f-4543-825a-ab425c1b53a3", sha256: createHash("sha256").update(bytes).digest("hex"), contentType: "image/jpeg", dataBase64: bytes.toString("base64") },
    font: { id: ARTICLE_COVER_FONT.id, sha256: ARTICLE_COVER_FONT.sha256 },
  };
}

test("封面快照复用 Typeset 控件与工厂，规范化并绑定修订/素材/字体身份", () => {
  const fields = input();
  const snapshot = createCoverSnapshot(fields);
  expect(snapshot.controls.backgroundColor).toBe("#aabbcc");
  expect(snapshot.config.images?.[0].src).toBe(`asset:${fields.asset.id}`);
  expect(validateCoverSnapshot(JSON.parse(JSON.stringify(snapshot)))).toEqual(snapshot);
  expect(createCoverSnapshot({ ...fields, revision: 2 }).hash).not.toBe(snapshot.hash);
  expect(createCoverSnapshot(Object.fromEntries(Object.entries(fields).reverse())).hash).toBe(snapshot.hash);
});

test("封面快照拒绝任意配置、路径、字体、字节篡改和超范围输入", () => {
  const fields = input();
  const snapshot = createCoverSnapshot(fields);
  for (const patch of [{ schemaVersion: 2 }, { revision: 0 }, { hash: "0".repeat(64) }, { path: "/private/image.jpg" }, { config: { ...snapshot.config, name: "改变配置" } }, { controls: { ...snapshot.controls, fontSize: 201 } }])
    expect(() => validateCoverSnapshot({ ...snapshot, ...patch })).toThrow();
  for (const patch of [
    { id: "../template" }, { name: "x".repeat(81) }, { controls: { ...fields.controls, font: "serif" } },
    { font: { ...fields.font, path: "/tmp/font.ttc" } }, { font: { ...fields.font, sha256: "0".repeat(64) } },
    { asset: { ...fields.asset, sha256: "0".repeat(64) } }, { asset: { ...fields.asset, dataBase64: `${fields.asset.dataBase64}\n` } },
    { asset: { ...fields.asset, dataBase64: Buffer.alloc(1_048_577).toString("base64") } },
    { asset: { ...fields.asset, url: "https://example.test/image.jpg" } },
  ]) expect(() => createCoverSnapshot({ ...fields, ...patch })).toThrow();
  const bytes = createCanvas(10, 10).toBuffer("image/jpeg");
  expect(() => createCoverSnapshot({ ...fields, asset: { ...fields.asset, sha256: createHash("sha256").update(bytes).digest("hex"), dataBase64: bytes.toString("base64") } })).toThrow("1000x1000");
});

test("已渲染v2封面绑定标题、源模板、素材、字体与最终PNG身份", () => {
  const input = { id: "e4a31a9b-f449-4bde-9226-1a0c7c543d8e", revision: 1, name: "完整封面", sourceHash: "a".repeat(64), assetsHash: "b".repeat(64),
    titleHash: hashRenderedCoverTitle(" 完整标题 "), fontHashes: [{ id: "font-b", sha256: "c".repeat(64) }, { id: "font-a", sha256: "d".repeat(64) }],
    renderedAsset: { id: "73edcb41-c90e-41da-9dcc-aaf9aa2a1cb4", sha256: "e".repeat(64), contentType: "image/png", byteLength: 1000, width: 3350, height: 1000 } };
  const snapshot = createRenderedCoverSnapshot(input);
  expect(validateCoverSnapshot(snapshot)).toEqual(snapshot);
  expect(snapshot.fontHashes[0]!.id).toBe("font-a");
  expect(createRenderedCoverSnapshot({ ...input, fontHashes: [...input.fontHashes].reverse() }).hash).toBe(snapshot.hash);
  expect(coverSnapshotIdentity(snapshot)).toEqual({ coverSnapshotHash: snapshot.hash, coverAssetHash: input.renderedAsset.sha256, coverFontHash: canonicalHash(snapshot.fontHashes) });
  for (const patch of [{ sourceHash: "f".repeat(64) }, { hash: "0".repeat(64) }, { path: "/tmp/cover.png" }, { renderedAsset: { ...input.renderedAsset, width: 2350 } }]) expect(() => validateCoverSnapshot({ ...snapshot, ...patch })).toThrow();
  expect(() => createRenderedCoverSnapshot({ ...input, fontHashes: [input.fontHashes[0], input.fontHashes[0]] })).toThrow("Duplicate");
});
