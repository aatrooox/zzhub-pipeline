import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { ARTICLE_COVER_FONT, ARTICLE_COVER_IMAGE_KEY } from "@akairos/typeset-studio/cover";
import { validateCoverSnapshot, type CoverSnapshot } from "../../src/cover-snapshot";

/** 字体路径只由受信部署环境映射，任务快照没有路径输入。 */
export function articleCoverFontPath(): string {
  return resolve(process.env.TYPESET_ARTICLE_COVER_FONT_PATH?.trim() || "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc");
}

export async function verifyArticleCoverFont(): Promise<void> {
  const { registerArticleCoverFont } = await import("@akairos/typeset-studio/server-font");
  registerArticleCoverFont({ path: articleCoverFontPath() });
}

export async function coverCapabilities() {
  try {
    await verifyArticleCoverFont();
    return { coverSnapshotSchemaVersions: [1], articleCoverFonts: [{ id: ARTICLE_COVER_FONT.id, sha256: ARTICLE_COVER_FONT.sha256 }] };
  } catch (error) {
    return { coverSnapshotSchemaVersions: [], articleCoverFonts: [], coverSnapshotError: error instanceof Error ? error.message : String(error) };
  }
}

export interface JobCoverMaterials {
  snapshot: CoverSnapshot;
  dataDir: string;
  imagesFile: string;
  fontPath: string;
}

/** 每个任务重新核验快照与 JPEG 解码，材料不进入共享 Typeset 目录。 */
export async function materializeCoverSnapshot(workspace: string, value: unknown): Promise<JobCoverMaterials> {
  const snapshot = validateCoverSnapshot(value);
  await verifyArticleCoverFont();
  const bytes = Buffer.from(snapshot.asset.dataBase64, "base64");
  const { loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(bytes);
  if (image.width !== 1000 || image.height !== 1000) throw new Error("Cover JPEG decoded dimensions must be 1000x1000");
  const dataDir = join(workspace, "cover", "typeset");
  const templates = join(dataDir, "templates");
  await mkdir(templates, { recursive: true, mode: 0o700 });
  // 跳过 Studio 的预设补种；任务只允许精确选择冻结模板。
  await Promise.all([".initialized", ".canvas-presets-v1"].map(name => writeFile(join(templates, name), "1", { mode: 0o600 })));
  const imagePath = join(workspace, "cover", "image.jpg");
  const imagesFile = join(workspace, "cover", "template-images.json");
  await writeFile(join(templates, `${snapshot.id}.json`), JSON.stringify(snapshot.config), { mode: 0o600 });
  await writeFile(join(workspace, "cover", "snapshot.json"), JSON.stringify(snapshot), { mode: 0o600 });
  await writeFile(imagePath, bytes, { mode: 0o600 });
  await writeFile(imagesFile, JSON.stringify({ cover: { [ARTICLE_COVER_IMAGE_KEY]: imagePath } }), { mode: 0o600 });
  return { snapshot, dataDir, imagesFile, fontPath: articleCoverFontPath() };
}
