import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { imageSize } from "image-size";
import { loadImage } from "@napi-rs/canvas";
import type { BodyAssetIdentity } from "../../src/article-snapshot";

export const maxAssetBytes = 5 * 1024 * 1024;
const extension = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" } as const;

/** 实际流量限额不依赖 Content-Length；数据只落在 hash 推导的受控文件中。 */
export async function readBoundedBody(request: Request, maximum: number): Promise<Buffer> {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Asset body is required");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maximum) { await reader.cancel(); throw new Error("Asset body too large"); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function assetFile(root: string, sha256: string): string {
  if (!/^[a-f\d]{64}$/.test(sha256)) throw new Error("Invalid asset hash");
  return join(root, "assets", `${sha256}.bytes`);
}

export async function validateBodyAsset(bytes: Buffer, contentType: string) {
  if (!(contentType in extension) || !bytes.byteLength || bytes.byteLength > maxAssetBytes) throw new Error("Invalid body asset type or size");
  const metadata = imageSize(bytes);
  const actual = metadata.type === "jpg" ? "image/jpeg" : metadata.type === "png" ? "image/png" : metadata.type === "webp" ? "image/webp" : "";
  if (actual !== contentType || !metadata.width || !metadata.height || metadata.width * metadata.height > 32_000_000) throw new Error("Invalid body asset dimensions or format");
  const decoded = await loadImage(bytes);
  if (decoded.width !== metadata.width || decoded.height !== metadata.height) throw new Error("Invalid decoded body asset dimensions");
  return { sha256: createHash("sha256").update(bytes).digest("hex"), contentType: contentType as BodyAssetIdentity["contentType"], byteLength: bytes.byteLength, width: decoded.width, height: decoded.height };
}

/** 系统主题页首图保留既有 GIF 字节；用户正文上传的格式边界不变。 */
export async function validateSystemAsset(bytes: Buffer, contentType: string) {
  if (contentType !== "image/gif") return validateBodyAsset(bytes, contentType);
  if (!bytes.byteLength || bytes.byteLength > maxAssetBytes) throw new Error("Invalid system image size");
  const metadata = imageSize(bytes);
  if (metadata.type !== "gif" || !metadata.width || !metadata.height || metadata.width * metadata.height > 32_000_000) throw new Error("Invalid system GIF dimensions or format");
  const decoded = await loadImage(bytes);
  if (decoded.width !== metadata.width || decoded.height !== metadata.height) throw new Error("Invalid decoded system GIF");
  return { sha256: createHash("sha256").update(bytes).digest("hex"), contentType: "image/gif" as const, byteLength: bytes.byteLength, width: decoded.width, height: decoded.height };
}

export async function putBodyAsset(root: string, sha256: string, request: Request) {
  const target = assetFile(root, sha256);
  const bytes = await readBoundedBody(request, maxAssetBytes);
  const identity = await validateBodyAsset(bytes, request.headers.get("content-type") || "");
  if (identity.sha256 !== sha256) throw new Error("Asset hash mismatch");
  await mkdir(join(root, "assets"), { recursive: true, mode: 0o700 });
  const previous = await readFile(target).catch(error => { if (error.code === "ENOENT") return null; throw error; });
  if (previous && !previous.equals(bytes)) throw new Error("Stored asset bytes mismatch");
  if (!previous) {
    const temporary = `${target}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, bytes, { mode: 0o600 });
    await rename(temporary, target);
  }
  return identity;
}

export async function readBodyAsset(root: string, asset: BodyAssetIdentity): Promise<Buffer> {
  const bytes = await readFile(assetFile(root, asset.sha256));
  const identity = await validateBodyAsset(bytes, asset.contentType);
  if (identity.sha256 !== asset.sha256 || identity.byteLength !== asset.byteLength || identity.width !== asset.width || identity.height !== asset.height) throw new Error("Stored body asset identity mismatch");
  return bytes;
}
export function assetExtension(contentType: BodyAssetIdentity["contentType"]): string { return extension[contentType]; }
