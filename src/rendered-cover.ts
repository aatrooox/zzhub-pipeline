import { createHash } from "node:crypto";
import { mkdir, readFile, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative } from "node:path";
import { imageSize } from "image-size";
import { hashRenderedCoverTitle, validateCoverSnapshot } from "./cover-snapshot";
import type { RenderAsset } from "./state";

/** 仅处理 Worker 私有冻结文件，写入仍由原 render 命令登记并递增版本。 */
export async function copyRenderedCover(value: string, workspace: string, outputDir: string, title: string): Promise<RenderAsset> {
  const input = JSON.parse(value) as { path: string; snapshot: unknown };
  const snapshot = validateCoverSnapshot(input.snapshot);
  if (snapshot.schemaVersion !== 2 || snapshot.titleHash !== hashRenderedCoverTitle(title)) throw new Error("Rendered cover title identity mismatch");
  if (typeof input.path !== "string" || !isAbsolute(input.path)) throw new Error("Rendered cover requires a private absolute path");
  const root = await realpath(workspace);
  const source = await realpath(input.path);
  const rel = relative(root, source);
  if (!rel || rel.startsWith("..") || isAbsolute(rel)) throw new Error("Rendered cover is outside the job workspace");
  if ((await stat(source)).size !== snapshot.renderedAsset.byteLength) throw new Error("Rendered cover byte length mismatch");
  const bytes = await readFile(source);
  const image = imageSize(bytes);
  if (image.type !== "png" || image.width !== 3350 || image.height !== 1000 || createHash("sha256").update(bytes).digest("hex") !== snapshot.renderedAsset.sha256) throw new Error("Rendered cover bytes or dimensions mismatch");
  await mkdir(outputDir, { recursive: true });
  const path = join(outputDir, "cover.png");
  const temporary = `${path}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rename(temporary, path);
  } finally { await rm(temporary, { force: true }); }
  return { kind: "cover", route: "wechat-article", path };
}
