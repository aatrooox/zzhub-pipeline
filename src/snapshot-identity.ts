import { createHash } from "node:crypto";
import { z } from "zod";

export const BodyAssetIdentitySchema = z.object({
  id: z.string().uuid().transform(value => value.toLowerCase()), sha256: z.string().regex(/^[a-f\d]{64}$/),
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  byteLength: z.number().int().positive().max(5 * 1024 * 1024),
  width: z.number().int().positive(), height: z.number().int().positive(),
}).strict().refine(value => value.width * value.height <= 32_000_000, "Body image exceeds 32 megapixels");
export type BodyAssetIdentity = z.infer<typeof BodyAssetIdentitySchema>;

/** 排序对象键，数组顺序仍属于冻结内容身份。 */
export function canonicalHash(value: unknown): string {
  const normalize = (item: any): any => Array.isArray(item) ? item.map(normalize) : item && typeof item === "object"
    ? Object.fromEntries(Object.keys(item).sort().filter(key => item[key] !== undefined).map(key => [key, normalize(item[key])])) : item;
  return createHash("sha256").update(JSON.stringify(normalize(value))).digest("hex");
}
