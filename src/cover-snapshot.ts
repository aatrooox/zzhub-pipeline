import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { imageSize } from "image-size";
import { z } from "zod";
import { ARTICLE_COVER_FONT, createArticleCoverConfig, validateArticleCoverControls, type ArticleCoverControls } from "@akairos/typeset-studio/cover";

const identity = z.string().uuid().transform(value => value.toLowerCase());
const sha256 = z.string().regex(/^[a-f\d]{64}$/);
const SnapshotInputSchema = z.object({
  id: identity,
  revision: z.number().int().positive(),
  name: z.string().trim().min(1).max(80),
  controls: z.unknown(),
  asset: z.object({
    id: identity,
    sha256,
    contentType: z.literal("image/jpeg"),
    dataBase64: z.string().min(4).max(1_398_104),
  }).strict(),
  font: z.object({ id: z.literal(ARTICLE_COVER_FONT.id), sha256: z.literal(ARTICLE_COVER_FONT.sha256) }).strict(),
}).strict();

export interface CoverSnapshot {
  schemaVersion: 1;
  id: string;
  revision: number;
  name: string;
  controls: ArticleCoverControls;
  config: ReturnType<typeof createArticleCoverConfig>;
  asset: { id: string; sha256: string; contentType: "image/jpeg"; dataBase64: string };
  font: { id: string; sha256: string };
  hash: string;
}

export interface CoverSnapshotInput {
  id: string;
  revision: number;
  name: string;
  controls: ArticleCoverControls;
  asset: CoverSnapshot["asset"];
  font: CoverSnapshot["font"];
}

/** 单图只接收已规范化的不可变 JPEG 字节，不解析远程地址或调用方路径。 */
export function createCoverSnapshot(value: unknown): CoverSnapshot {
  const input = SnapshotInputSchema.parse(value);
  const controls = validateArticleCoverControls(input.controls);
  const bytes = Buffer.from(input.asset.dataBase64, "base64");
  if (!bytes.length || bytes.length > 1_048_576 || bytes.toString("base64") !== input.asset.dataBase64)
    throw new Error("Cover asset must be canonical base64 JPEG <= 1 MiB");
  const image = imageSize(bytes);
  if (image.type !== "jpg" || image.width !== 1000 || image.height !== 1000)
    throw new Error("Cover asset must be a normalized 1000x1000 JPEG");
  if (createHash("sha256").update(bytes).digest("hex") !== input.asset.sha256)
    throw new Error("Cover asset hash mismatch");
  const config = createArticleCoverConfig({ id: input.id, name: input.name, controls, assetId: input.asset.id });
  const content = { schemaVersion: 1 as const, id: input.id, revision: input.revision, name: input.name, controls, config, asset: input.asset, font: input.font };
  const hash = createHash("sha256").update(JSON.stringify(content)).digest("hex");
  return { ...content, hash };
}

/** 配置只能由 Typeset 有限工厂生成；同 hash 不能夹带其他布局、素材或字体。 */
export function validateCoverSnapshot(value: unknown): CoverSnapshot {
  const input = SnapshotInputSchema.extend({ schemaVersion: z.literal(1), config: z.unknown(), hash: sha256 }).strict().parse(value);
  const { schemaVersion: _, config, hash, ...fields } = input;
  const snapshot = createCoverSnapshot(fields);
  if (!isDeepStrictEqual(config, snapshot.config)) throw new Error("Cover config does not match canonical template");
  if (hash !== snapshot.hash) throw new Error("Cover snapshot hash mismatch");
  return snapshot;
}
