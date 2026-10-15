import { createHash } from "node:crypto";
import { remark } from "remark";
import { z } from "zod";
import { validateArticleStyleSnapshot, type ArticleStyleSnapshot } from "./article-style";
import { validateCoverSnapshot, type CoverSnapshot } from "./cover-snapshot";

const hash = z.string().regex(/^[a-f\d]{64}$/);
const uuid = z.string().uuid().transform(value => value.toLowerCase());
export const BodyAssetIdentitySchema = z.object({
  id: uuid, sha256: hash, contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  byteLength: z.number().int().positive().max(5 * 1024 * 1024),
  width: z.number().int().positive(), height: z.number().int().positive(),
}).strict().refine(value => value.width * value.height <= 32_000_000, "Body image exceeds 32 megapixels");
export type BodyAssetIdentity = z.infer<typeof BodyAssetIdentitySchema>;

export interface ArticleSnapshotContent {
  title: string; body: string; account: string;
  articleStyle?: ArticleStyleSnapshot; coverSnapshot?: CoverSnapshot;
}
export interface ArticleSnapshotInput extends ArticleSnapshotContent {
  documentId: string; documentRevision: number; bodyAssets: BodyAssetIdentity[];
}
const ArticleSnapshotSchema = z.object({
  schemaVersion: z.literal(1), documentId: uuid, documentRevision: z.number().int().positive(),
  bodyAssets: z.array(BodyAssetIdentitySchema).max(20), inputHash: hash,
}).strict();
export type ArticleSnapshot = z.infer<typeof ArticleSnapshotSchema>;

interface ImageNode { type: string; url?: string; identifier?: string; alt?: string; title?: string | null; value?: string; position?: { start: { offset?: number }; end: { offset?: number } }; children?: ImageNode[] }

/** 只遍历 Markdown 图片节点，代码和普通链接不参与资产绑定。 */
export function rewriteArticleImages(body: string, resolveImage: (source: string) => string): string {
  const tree = remark().parse(body) as ImageNode;
  const definitions = new Map<string, ImageNode>();
  const collect = (node: ImageNode) => { if (node.type === "definition") definitions.set(node.identifier!, node); node.children?.forEach(collect); };
  collect(tree);
  const edits: Array<{ start: number; end: number; text: string }> = [];
  let count = 0;
  const visit = (node: ImageNode) => {
    if (node.type === "html" && /<img\b/i.test(node.value || "")) throw new Error("Raw HTML images must be converted to managed Markdown images");
    if (node.type === "image" || node.type === "imageReference") {
      if (++count > 20) throw new Error("Article supports at most 20 visible images");
      const definition = definitions.get(node.identifier!);
      const source = node.url ?? definition?.url;
      if (!source) throw new Error("Unresolved image reference");
      const mapped = resolveImage(source);
      if (mapped !== source) {
        const start = node.position?.start.offset, end = node.position?.end.offset;
        if (start === undefined || end === undefined) throw new Error("Image source position is unavailable");
        const escape = (text: string) => text.replace(/\\/g, "\\\\").replace(/\[/g, "\\[").replace(/\]/g, "\\]");
        const originalTitle = node.title ?? definition?.title;
        const title = originalTitle ? ` "${originalTitle.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : "";
        edits.push({ start, end, text: `![${escape(node.alt || "")}](${mapped}${title})` });
      }
    }
    node.children?.forEach(visit);
  };
  visit(tree);
  for (const edit of edits.sort((a, b) => b.start - a.start)) body = body.slice(0, edit.start) + edit.text + body.slice(edit.end);
  return body;
}

export function canonicalHash(value: unknown): string {
  const normalize = (item: any): any => Array.isArray(item) ? item.map(normalize) : item && typeof item === "object"
    ? Object.fromEntries(Object.keys(item).sort().filter(key => item[key] !== undefined).map(key => [key, normalize(item[key])])) : item;
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}

/** 输入 hash 包含文章、账号固定身份、配置内容与素材清单，不重复保存大字段。 */
export function createArticleSnapshot(value: ArticleSnapshotInput): ArticleSnapshot {
  const content = z.object({ title: z.string().trim().min(1).max(255), body: z.string().min(1), account: z.string().regex(/^[a-zA-Z0-9_.-]+$/) }).parse(value);
  if (Buffer.byteLength(content.body) > 2_097_152) throw new Error("Article body exceeds 2 MiB");
  const header = ArticleSnapshotSchema.omit({ inputHash: true }).parse({ schemaVersion: 1, documentId: value.documentId, documentRevision: value.documentRevision, bodyAssets: value.bodyAssets });
  header.bodyAssets.sort((a, b) => a.id.localeCompare(b.id));
  const identities = new Map(header.bodyAssets.map(asset => [asset.id, asset]));
  if (identities.size !== header.bodyAssets.length) throw new Error("Duplicate body asset id");
  const uniqueBytes = new Map(header.bodyAssets.map(asset => [asset.sha256, asset.byteLength]));
  if ([...uniqueBytes.values()].reduce((sum, bytes) => sum + bytes, 0) > 40 * 1024 * 1024) throw new Error("Body assets exceed 40 MiB");
  const used = new Set<string>();
  rewriteArticleImages(content.body, source => {
    const id = /^asset:([a-f\d-]+)$/.exec(source)?.[1];
    if (!id || !identities.has(id)) throw new Error("Article contains an unmanaged image");
    used.add(id); return source;
  });
  if (used.size !== identities.size) throw new Error("Body asset is not referenced by the article");
  const articleStyle = value.articleStyle ? validateArticleStyleSnapshot(value.articleStyle) : undefined;
  const coverSnapshot = value.coverSnapshot ? validateCoverSnapshot(value.coverSnapshot) : undefined;
  return { ...header, inputHash: canonicalHash({ ...header, ...content, articleStyle, coverSnapshot }) };
}

export function validateArticleSnapshot(value: unknown, content: ArticleSnapshotContent): ArticleSnapshot {
  const input = ArticleSnapshotSchema.parse(value);
  const snapshot = createArticleSnapshot({ ...content, ...input });
  if (snapshot.inputHash !== input.inputHash) throw new Error("Article input hash mismatch");
  return snapshot;
}

const ArtifactSchema = z.object({
  key: z.string().regex(/^(article|cover|media_[a-f\d-]{36})$/), kind: z.enum(["html", "cover", "media"]),
  contentType: z.enum(["text/html", "image/png", "image/jpeg", "image/webp", "image/gif"]), byteLength: z.number().int().positive().max(50 * 1024 * 1024), sha256: hash,
}).strict();
const ArtifactManifestSchema = z.object({
  schemaVersion: z.literal(1), snapshotHash: hash, artifacts: z.array(ArtifactSchema).min(2).max(42),
  runtime: z.object({ pipeline: z.string().min(1), myno: z.string().min(1), typeset: z.string().min(1) }).strict(),
}).strict().superRefine((value, ctx) => {
  const keys = value.artifacts.map(item => item.key);
  if (new Set(keys).size !== keys.length || !keys.includes("article") || !keys.includes("cover")) ctx.addIssue({ code: "custom", message: "Artifact keys must be unique and contain article/cover" });
  for (const item of value.artifacts) if (item.key === "article" ? item.kind !== "html" || item.contentType !== "text/html" : item.key === "cover" ? item.kind !== "cover" || item.contentType !== "image/png" : item.kind !== "media" || item.contentType === "text/html") ctx.addIssue({ code: "custom", message: "Artifact key and type mismatch" });
});
export type ArtifactManifest = z.infer<typeof ArtifactManifestSchema>;
export function createArtifactManifest(value: Omit<ArtifactManifest, "schemaVersion">): ArtifactManifest {
  const manifest = ArtifactManifestSchema.parse({ schemaVersion: 1, ...value });
  manifest.artifacts.sort((a, b) => a.key.localeCompare(b.key));
  return manifest;
}
export function hashArtifactManifest(value: ArtifactManifest): string { return canonicalHash(ArtifactManifestSchema.parse(value)); }
export function validateArtifactManifest(value: unknown, expectedHash?: string): ArtifactManifest {
  const manifest = ArtifactManifestSchema.parse(value);
  if (expectedHash && hashArtifactManifest(manifest) !== expectedHash) throw new Error("Artifact manifest hash mismatch");
  return manifest;
}
