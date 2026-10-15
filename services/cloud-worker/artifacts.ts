import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createArtifactManifest, hashArtifactManifest, validateArtifactManifest, type ArtifactManifest } from "../../src/article-snapshot";
import type { FrozenArticleArtifacts } from "../../src/providers/article-export";
import type { PreparedArticle } from "./job-materials";
import { assetExtension } from "./assets";

export function artifactsPath(workspace: string): string { return join(workspace, "artifacts", "manifest.json"); }

/** 固定 HTML 的实际图片属性；代码文本中的相同字符串保持原样。 */
export async function freezeArticleArtifacts(workspace: string, prepared: PreparedArticle, htmlPath: string, coverPath: string, assetPath: string) {
  const directory = join(workspace, "artifacts"); await mkdir(directory, { recursive: true, mode: 0o700 });
  const files: Record<string, string> = {};
  const identities: ArtifactManifest["artifacts"] = [];
  const store = async (key: string, kind: "html" | "cover" | "media", contentType: ArtifactManifest["artifacts"][number]["contentType"], bytes: Buffer, filename: string) => {
    files[key] = filename;
    await writeFile(join(directory, filename), bytes, { mode: 0o600 });
    identities.push({ key, kind, contentType, byteLength: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
  };
  const sourceMap = new Map<string, string>();
  for (const asset of prepared.bodyAssets) {
    const bytes = await readFile(asset.path);
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error("Pinned body asset hash mismatch");
    await store(`media_${asset.id}`, "media", asset.contentType, bytes, `${asset.id}.${assetExtension(asset.contentType)}`);
    sourceMap.set(asset.path, asset.id); sourceMap.set(`file://${asset.path}`, asset.id);
    const copied = join(assetPath, "_inline-assets", basename(asset.path));
    // prepare-finalize 会复制绝对图片到 canonical post 的 _inline-assets。
    const copiedBytes = await readFile(copied);
    if (createHash("sha256").update(copiedBytes).digest("hex") !== asset.sha256) throw new Error("Finalized image bytes do not match the pinned body asset");
    sourceMap.set(copied, asset.id); sourceMap.set(`file://${copied}`, asset.id);
  }
  for (const asset of prepared.systemAssets) {
    const bytes = await readFile(asset.path);
    if (createHash("sha256").update(bytes).digest("hex") !== asset.sha256) throw new Error("Pinned system asset hash mismatch");
    await store(`media_${asset.id}`, "media", asset.contentType, bytes, `${asset.id}.${asset.contentType === "image/gif" ? "gif" : assetExtension(asset.contentType)}`);
    sourceMap.set(asset.source, asset.id);
  }
  const html = await new HTMLRewriter().on("img", { element(element) {
    let source = element.getAttribute("src") || "";
    if (source.startsWith("file:")) source = decodeURIComponent(new URL(source).pathname);
    if (!source.startsWith("/") && !/^[a-z]+:/i.test(source)) source = resolve(assetPath, source);
    const id = sourceMap.get(source);
    if (!id) throw new Error("Export contains an unmanaged image");
    element.setAttribute("src", `asset:${id}`);
    if (element.hasAttribute("data-src")) element.setAttribute("data-src", `asset:${id}`);
  } }).transform(new Response(await readFile(htmlPath))).text();
  await store("article", "html", "text/html", Buffer.from(html), "article.html");
  await store("cover", "cover", "image/png", await readFile(coverPath), "cover.png");
  const manifest = createArtifactManifest({ snapshotHash: prepared.snapshotHash, artifacts: identities, runtime: prepared.runtime });
  const manifestHash = hashArtifactManifest(manifest);
  const frozen: FrozenArticleArtifacts = { manifest, manifestHash, files };
  await writeFile(artifactsPath(workspace), JSON.stringify(frozen), { mode: 0o600 });
  return { artifactManifest: manifest, artifactManifestHash: manifestHash };
}

export async function readArtifact(workspace: string, key: string, manifestHash: string, snapshotHash: string) {
  const frozen = JSON.parse(await readFile(artifactsPath(workspace), "utf8")) as FrozenArticleArtifacts;
  if (frozen.manifestHash !== manifestHash || frozen.manifest.snapshotHash !== snapshotHash) throw new Error("Stored artifact identity mismatch");
  const manifest = validateArtifactManifest(frozen.manifest, manifestHash);
  const artifact = manifest.artifacts.find(item => item.key === key);
  const filename = frozen.files[key];
  if (!artifact || !filename || /[\\/]/.test(filename) || filename === "." || filename === "..") throw new Error("Artifact not found");
  const bytes = await readFile(join(workspace, "artifacts", filename));
  if (bytes.byteLength !== artifact.byteLength || createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) throw new Error("Artifact hash mismatch");
  return { artifact, bytes };
}
