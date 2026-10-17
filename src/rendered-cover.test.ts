import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { createRenderedCoverSnapshot, hashRenderedCoverTitle } from "./cover-snapshot";
import { copyRenderedCover } from "./rendered-cover";

test("rendered封面只复制私有3350x1000原PNG，拒绝标题、路径和字节漂移", async () => {
  const root = await mkdtemp(join(tmpdir(), "zzp-rendered-cover-"));
  try {
    const bytes = createCanvas(3350, 1000).toBuffer("image/png");
    const snapshot = createRenderedCoverSnapshot({ id: "c1c8c3d6-de8a-4dc6-8abc-afbcb414d3f1", revision: 1, name: "完整模板", sourceHash: "a".repeat(64), assetsHash: "b".repeat(64), fontHashes: [], titleHash: hashRenderedCoverTitle("标题"), renderedAsset: {
      id: "90dba4e8-c177-4d4f-a0bb-353672dc81f9", sha256: createHash("sha256").update(bytes).digest("hex"), contentType: "image/png", byteLength: bytes.length, width: 3350, height: 1000,
    } });
    const path = join(root, "frozen.png"); await writeFile(path, bytes);
    const value = JSON.stringify({ path, snapshot });
    const asset = await copyRenderedCover(value, root, join(root, "output"), "标题");
    expect((await readFile(asset.path)).toString("hex")).toBe(bytes.toString("hex"));
    await expect(copyRenderedCover(value, root, join(root, "output"), "标题变化")).rejects.toThrow("title");
    await expect(copyRenderedCover(value, join(root, "output"), join(root, "output"), "标题")).rejects.toThrow("outside");
    await writeFile(path, Buffer.alloc(bytes.length));
    await expect(copyRenderedCover(value, root, join(root, "output"), "标题")).rejects.toThrow();
  } finally { await rm(root, { recursive: true, force: true }); }
});
