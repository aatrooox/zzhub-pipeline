import { createHash } from "node:crypto";
import { z } from "zod";
import { ArticleThemeSchema, validateArticleThemeCss } from "./article-theme";
import { canonicalHash } from "./snapshot-identity";

const color = z.string().regex(/^#[a-f\d]{6}$/i).transform(value => value.toLowerCase());
const fontSize = z.string().regex(/^\d+(?:\.\d+)?px$/)
  .refine(value => Number.parseFloat(value) >= 12 && Number.parseFloat(value) <= 24)
  .transform(value => `${Number.parseFloat(value)}px`);
const lineHeight = z.string().regex(/^\d+(?:\.\d+)?$/)
  .refine(value => Number(value) >= 1.2 && Number(value) <= 2.4)
  .transform(value => String(Number(value)));

// 复用主题身份，仅开放本轮已验证的纯 JSON 正文样式。
const ArticleStyleManifestSchema = ArticleThemeSchema.pick({
  schemaVersion: true, engineVersion: true, id: true, name: true, version: true, description: true,
}).extend({
  editorVars: z.object({ "--brand": color.optional() }).strict().default({}),
  exportTheme: z.object({
    bodyFontSize: fontSize.optional(), bodyLineHeight: lineHeight.optional(),
    primaryColor: color.optional(), h2Color: color.optional(),
  }).strict().default({}),
  syntaxPresets: z.object({ h2: z.enum(["pillar", "bottom-line", "plain"]).optional() }).strict().default({}),
  css: z.literal("").default(""),
}).strict();

export type ArticleStyleManifest = z.infer<typeof ArticleStyleManifestSchema>;
const SnapshotHeaderSchema = z.object({
  schemaVersion: z.literal(1),
  id: ArticleThemeSchema.shape.id,
  revision: z.number().int().positive(),
}).strict();

export interface ArticleStyleSnapshotV1 {
  schemaVersion: 1;
  id: string;
  revision: number;
  manifest: ArticleStyleManifest;
  hash: string;
}

export interface ArticleStyleSnapshotV2 {
  schemaVersion: 2;
  id: string;
  revision: number;
  manifest: z.infer<typeof ArticleThemeSchema> & { css: string };
  hash: string;
}
export type ArticleStyleSnapshot = ArticleStyleSnapshotV1 | ArticleStyleSnapshotV2;

/** 内容 hash 只基于规范化 manifest；资产修订身份由外层快照保存。 */
export function createArticleStyleSnapshot(value: unknown, id: string, revision: number): ArticleStyleSnapshotV1 {
  const header = SnapshotHeaderSchema.parse({ schemaVersion: 1, id, revision });
  const manifest = ArticleStyleManifestSchema.parse(value);
  if (manifest.id !== header.id) throw new Error("Article style id must match manifest.id");
  validateArticleThemeCss(ArticleThemeSchema.parse(manifest), manifest.css);
  const hash = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  return { ...header, manifest, hash };
}

/** 完整样式只接受独立 JSON；目录资源必须先在应用侧内嵌。 */
export function createArticleStyleSnapshotV2(value: unknown, id: string, revision: number): ArticleStyleSnapshotV2 {
  const header = SnapshotHeaderSchema.extend({ schemaVersion: z.literal(2) }).parse({ schemaVersion: 2, id, revision });
  const manifest = ArticleThemeSchema.extend({ css: z.string().max(256_000) }).parse(value);
  if (manifest.id !== header.id) throw new Error("Article style id must match manifest.id");
  if (manifest.assets.length || manifest.structure.headerImage) throw new Error("Article style snapshot cannot reference directory resources");
  if (manifest.structure.headerImageUrl && manifest.structure.headerImageUrl.length > 6_990_550) throw new Error("Article style header image exceeds 5 MiB");
  validateArticleThemeCss(manifest, manifest.css);
  return { ...header, manifest, hash: canonicalHash(manifest) };
}

/** 严格验证快照格式及内容 hash，未知版本和被篡改内容均拒绝。 */
export function validateArticleStyleSnapshot(value: unknown): ArticleStyleSnapshot {
  if ((value as { schemaVersion?: unknown })?.schemaVersion === 2) {
    const input = SnapshotHeaderSchema.extend({ schemaVersion: z.literal(2), manifest: z.unknown(), hash: z.string().regex(/^[a-f\d]{64}$/) }).strict().parse(value);
    const snapshot = createArticleStyleSnapshotV2(input.manifest, input.id, input.revision);
    if (input.hash !== snapshot.hash) throw new Error("Article style hash mismatch");
    return snapshot;
  }
  const input = SnapshotHeaderSchema.extend({ manifest: z.unknown(), hash: z.string().regex(/^[a-f\d]{64}$/) }).strict().parse(value);
  const snapshot = createArticleStyleSnapshot(input.manifest, input.id, input.revision);
  if (input.hash !== snapshot.hash) throw new Error("Article style hash mismatch");
  return snapshot;
}
