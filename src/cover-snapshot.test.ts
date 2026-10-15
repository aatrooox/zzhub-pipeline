import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { createCanvas } from "@napi-rs/canvas";
import { ARTICLE_COVER_FONT, DEFAULT_ARTICLE_COVER_CONTROLS } from "@akairos/typeset-studio/cover";
import { createCoverSnapshot, validateCoverSnapshot } from "../cover-snapshot";

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
