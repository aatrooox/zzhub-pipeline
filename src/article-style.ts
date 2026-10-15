import { createHash } from "node:crypto";
import { z } from "zod";
import { ArticleThemeSchema, validateArticleThemeCss } from "./article-theme";

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

export interface ArticleStyleSnapshot {
  schemaVersion: 1;
  id: string;
  revision: number;
  manifest: ArticleStyleManifest;
  hash: string;
}

/** 内容 hash 只基于规范化 manifest；资产修订身份由外层快照保存。 */
export function createArticleStyleSnapshot(value: unknown, id: string, revision: number): ArticleStyleSnapshot {
  const header = SnapshotHeaderSchema.parse({ schemaVersion: 1, id, revision });
  const manifest = ArticleStyleManifestSchema.parse(value);
  if (manifest.id !== header.id) throw new Error("Article style id must match manifest.id");
  validateArticleThemeCss(ArticleThemeSchema.parse(manifest), manifest.css);
  const hash = createHash("sha256").update(JSON.stringify(manifest)).digest("hex");
  return { ...header, manifest, hash };
}

/** 严格验证快照格式及内容 hash，未知版本和被篡改内容均拒绝。 */
export function validateArticleStyleSnapshot(value: unknown): ArticleStyleSnapshot {
  const input = SnapshotHeaderSchema.extend({ manifest: z.unknown(), hash: z.string().regex(/^[a-f\d]{64}$/) }).strict().parse(value);
  const snapshot = createArticleStyleSnapshot(input.manifest, input.id, input.revision);
  if (input.hash !== snapshot.hash) throw new Error("Article style hash mismatch");
  return snapshot;
}
