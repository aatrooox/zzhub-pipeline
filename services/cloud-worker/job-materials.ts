import { mkdir, open, readFile, realpath, stat, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, relative } from "node:path";
import { ARTICLE_COVER_FONT } from "@akairos/typeset-studio/cover";
import { canonicalHash, rewriteArticleImages, validateArticleSnapshot, type BodyAssetIdentity } from "../../src/article-snapshot";
import { ArticleThemeSchema, readArticleTheme, validateArticleThemeCss } from "../../src/article-theme";
import { assetExtension, readBodyAsset, readBoundedBody, validateBodyAsset, validateSystemAsset } from "./assets";
import { articleCoverFontPath, verifyArticleCoverFont, type JobCoverMaterials } from "./cover";
import type { CloudJobInput } from "./store";
import type { PipelineConfig } from "../../src/config";
import type { TypesetConfig } from "@akairos/typeset-studio/cover";
import pkg from "../../package.json";
import { boundedOutput } from "./bounded-output";
import { WorkerLimitError } from "./capacity";
import type { RenderedCoverSnapshot } from "../../src/cover-snapshot";

const metadataBytes = 8 * 1024 * 1024;
const resourceBytes = 20 * 1024 * 1024;

async function limitedFile(path: string, maximum: number): Promise<Buffer> {
  const handle = await open(path, "r");
  try {
    if ((await handle.stat()).size > maximum) throw new WorkerLimitError("worker_material_too_large", 413);
    const bytes = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length <= maximum) {
      const read = await handle.read(bytes, length, bytes.length - length);
      if (!read.bytesRead) break;
      length += read.bytesRead;
    }
    if (length > maximum) throw new WorkerLimitError("worker_material_too_large", 413);
    return bytes.subarray(0, length);
  } finally { await handle.close(); }
}

export interface PreparedArticle {
  schemaVersion: 1; inputHash: string; snapshotHash: string;
  articleThemeHash: string; coverTemplateId: string;
  configFile: string; articleThemePath: string; bodyPath: string; dataDir: string; imagesFile: string;
  bodyAssets: Array<BodyAssetIdentity & { path: string }>;
  systemAssets: Array<Omit<BodyAssetIdentity, "contentType"> & { contentType: BodyAssetIdentity["contentType"] | "image/gif"; path: string; source: string }>;
  resources: Array<{ key: string; sha256: string; path: string; contentType: string }>;
  fonts: Array<{ requested: string; resolved: string; sha256: string }>;
  fontPath: string;
  renderedCover?: { path: string; snapshot: RenderedCoverSnapshot };
  fileHashes: Record<string, string>;
  runtime: { pipeline: string; myno: string; typeset: string };
}

function replaceResource(config: any, key: string, path: string) {
  const parts = key.split("."); let value = config;
  for (const part of parts.slice(0, -1)) value = value[part];
  const last = parts.at(-1)!;
  if (typeof value[last] === "object") value[last].src = path; else value[last] = path;
}

async function trustedResource(source: string): Promise<{ bytes: Buffer; contentType: string }> {
  if (/^https?:/i.test(source)) {
    const url = new URL(source);
    const origin = process.env.PIPELINE_DEFAULT_ASSET_ORIGIN;
    const prefix = process.env.PIPELINE_DEFAULT_ASSET_PATH_PREFIX;
    if (!origin || !prefix || url.protocol !== "https:" || url.origin !== origin || !url.pathname.startsWith(prefix) || url.username || url.password || (url.port && url.port !== "443")) throw new Error("Default template resource is outside the trusted deployment CDN prefix");
    const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`Default resource download failed: ${response.status}`);
    return { bytes: await readBoundedBody(new Request(url, { method: "POST", body: response.body, duplex: "half" } as RequestInit), 5 * 1024 * 1024), contentType: response.headers.get("content-type")?.split(";")[0] || "" };
  }
  if (/^data:image\/(png|jpeg|webp|gif);base64,/.test(source)) {
    const [header, base64] = source.split(",");
    if (base64!.length > Math.ceil(5 * 1024 * 1024 / 3) * 4) throw new WorkerLimitError("worker_material_too_large", 413);
    return { bytes: Buffer.from(base64!, "base64"), contentType: header!.slice(5).split(";")[0]! };
  }
  if (!isAbsolute(source)) throw new Error("Default resource requires a trusted absolute path");
  const type = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif" } as Record<string, string>)[extname(source).toLowerCase()] || "";
  return { bytes: await limitedFile(source, 5 * 1024 * 1024), contentType: type };
}

/** 接收阶段解析并固化实际默认，入队后不再读取可变模板、字体或素材。 */
export async function prepareArticleMaterials(workspace: string, input: CloudJobInput, root: string): Promise<PreparedArticle> {
  let metadataTotal = 0;
  // 模板、配置和快照共享元数据额度，在每次写入前检查。
  const writeMetadata = async (path: string, value: unknown) => {
    const data = JSON.stringify(value);
    metadataTotal += Buffer.byteLength(data);
    if (metadataTotal > metadataBytes) throw new WorkerLimitError("worker_metadata_too_large", 413);
    await writeFile(path, data, { mode: 0o600 });
  };
  const header = validateArticleSnapshot(input.articleSnapshot, input);
  const renderedSnapshot = input.coverSnapshot?.schemaVersion === 2 ? input.coverSnapshot : undefined;
  if (header.bodyAssets.reduce((sum, asset) => sum + asset.byteLength, 0) > 100 * 1024 * 1024) throw new WorkerLimitError("worker_body_copies_too_large", 413);
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  const fontPath = renderedSnapshot ? "" : join(workspace, "cover-font.ttc");
  if (!renderedSnapshot) {
    await verifyArticleCoverFont();
    if ((await stat(articleCoverFontPath())).size !== 19_484_784) throw new Error("Pinned article font size mismatch");
    await writeFile(fontPath, await limitedFile(articleCoverFontPath(), 19_484_784), { mode: 0o600 });
  }
  // 应用已经冻结全部图层与字体，Worker 只核验最终 PNG 的原字节。
  const renderedCover = renderedSnapshot ? { path: join(workspace, "rendered-cover.png"), snapshot: renderedSnapshot } : undefined;
  if (renderedCover) await writeFile(renderedCover.path, await readBodyAsset(root, renderedCover.snapshot.renderedAsset), { mode: 0o600 });
  const styleInput = join(workspace, "style-input.json");
  if (input.articleStyle) await writeMetadata(styleInput, input.articleStyle.manifest);
  const env: Record<string, string | undefined> = { ...process.env, PIPELINE_STYLE_INPUT: styleInput };
  if (process.env.PIPELINE_CONFIG_FILE) env.ZZHUB_PIPELINE_CONFIG = process.env.PIPELINE_CONFIG_FILE;
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "resolve-defaults.ts")], { env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  child.stdin.write(JSON.stringify(input)); child.stdin.end();
  const [stdout, stderr, exit] = await Promise.all([boundedOutput(child.stdout, metadataBytes, false, () => child.kill()), boundedOutput(child.stderr, 64 * 1024, true), child.exited]);
  if (stdout.exceeded) throw new WorkerLimitError("worker_metadata_too_large", 413);
  if (exit !== 0) throw new Error(`Cannot freeze article defaults: ${stderr.exceeded ? "[stderr truncated] " : ""}${stderr.text.slice(-2000)}`);
  const defaults = JSON.parse(stdout.text) as { config: PipelineConfig; article: any; cover: { config: TypesetConfig; source: string; resources: Array<{ key: string; src: string }> } | null };
  const refs = input.coverSnapshot?.schemaVersion === 1 ? [{ key: "images.0.src", src: `data:image/jpeg;base64,${input.coverSnapshot.asset.dataBase64}` }] : renderedSnapshot ? [] : defaults.cover!.resources;
  if (refs.length + (defaults.article.structure?.headerImageUrl ? 1 : 0) > 8) throw new WorkerLimitError("worker_default_resources_too_many", 413);
  let resourcesTotal = 0;
  const resource = async (source: string) => {
    const value = await trustedResource(source);
    resourcesTotal += value.bytes.length;
    if (resourcesTotal > resourceBytes) throw new WorkerLimitError("worker_default_resources_too_large", 413);
    return value;
  };
  const fonts: PreparedArticle["fonts"] = [];
  const recordFont = (requested: string) => { fonts.push({ requested, resolved: ARTICLE_COVER_FONT.family, sha256: ARTICLE_COVER_FONT.sha256 }); return ARTICLE_COVER_FONT.family; };
  const article = ArticleThemeSchema.parse(defaults.article);
  validateArticleThemeCss(article, article.css || "");
  const systemAssets: PreparedArticle["systemAssets"] = [];
  if (article.structure.headerImageUrl) {
    const source = article.structure.headerImageUrl;
    const data = await resource(source);
    const identity = await validateSystemAsset(data.bytes, data.contentType);
    const hex = identity.sha256.slice(0, 32);
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
    const path = join(workspace, `header-${id}.${identity.contentType === "image/gif" ? "gif" : assetExtension(identity.contentType)}`);
    await writeFile(path, data.bytes, { mode: 0o600 });
    systemAssets.push({ ...identity, id, path, source });
  }
  const articleThemePath = join(workspace, "article-style.json");
  await writeMetadata(articleThemePath, article);
  const articleThemeHash = (await readArticleTheme(articleThemePath)).hash;

  const coverConfig = renderedSnapshot ? null : structuredClone(input.coverSnapshot?.schemaVersion === 1 ? input.coverSnapshot.config : defaults.cover!.config);
  if (coverConfig) {
    const requestedFonts = [coverConfig.typography.headingFont, coverConfig.typography.bodyFont, ...Object.values(coverConfig.coverTheme?.typography || {}).map((font: any) => font.fontFamily)];
    const supported = /^(Publishing Cover|PingFang SC|Songti SC|Hiragino Sans GB|Noto Sans CJK SC|Noto Sans SC|system-ui|sans-serif|AlimamaShuHeiTi|LXGWNeoZhiSongPlus|LXGWWenKai)$/;
    if (requestedFonts.some(font => !supported.test(font))) throw new Error("Default template uses an unsupported custom font");
    coverConfig.typography.headingFont = recordFont(coverConfig.typography.headingFont);
    coverConfig.typography.bodyFont = recordFont(coverConfig.typography.bodyFont);
    for (const font of Object.values(coverConfig.coverTheme?.typography || {}) as Array<{ fontFamily: string }>) font.fontFamily = recordFont(font.fontFamily);
  }
  const dataDir = join(workspace, "cover", "typeset");
  const templateDir = join(dataDir, "templates");
  const resourceDir = join(workspace, "resources");
  await mkdir(templateDir, { recursive: true, mode: 0o700 }); await mkdir(resourceDir, { recursive: true, mode: 0o700 });
  await Promise.all([".initialized", ".canvas-presets-v1"].map(name => writeFile(join(templateDir, name), "1", { mode: 0o600 })));
  const resources: PreparedArticle["resources"] = [];
  for (const [index, ref] of refs.entries()) {
    const data = await resource(ref.src);
    const identity = await validateBodyAsset(data.bytes, data.contentType);
    const path = join(resourceDir, `${index}.${assetExtension(identity.contentType)}`);
    await writeFile(path, data.bytes, { mode: 0o600 });
    replaceResource(coverConfig!, ref.key, path);
    resources.push({ key: ref.key, sha256: identity.sha256, path, contentType: identity.contentType });
  }
  const coverTemplateId = input.coverSnapshot?.id ?? "frozen-default-cover";
  if (coverConfig) {
    coverConfig.id = coverTemplateId;
    await writeMetadata(join(templateDir, `${coverTemplateId}.json`), coverConfig);
  }
  const bodyAssets: PreparedArticle["bodyAssets"] = [];
  const assetDir = join(workspace, "body-assets"); await mkdir(assetDir, { recursive: true, mode: 0o700 });
  for (const asset of header.bodyAssets) {
    const path = join(assetDir, `${asset.id}.${assetExtension(asset.contentType)}`);
    await writeFile(path, await readBodyAsset(root, asset), { mode: 0o600 });
    bodyAssets.push({ ...asset, path });
  }
  const body = rewriteArticleImages(input.body, source => bodyAssets.find(asset => `asset:${asset.id}` === source)!.path);
  const bodyPath = join(workspace, "source.md"); await writeFile(bodyPath, body, { mode: 0o600 });
  const configFile = join(workspace, "pipeline-config.json");
  defaults.config.plugins.imageRenderer = { module: "@akairos/typeset-studio/adapter", options: { dataDir } };
  await writeMetadata(configFile, defaults.config);
  const imagesFile = join(workspace, "cover", "template-images.json"); await writeMetadata(imagesFile, { cover: {} });
  const runtime = { pipeline: pkg.version, myno: pkg.dependencies["@akairos/myno"], typeset: pkg.dependencies["@akairos/typeset-studio"] };
  const canonicalCover = structuredClone(coverConfig);
  // Typeset 普通图片槽位会生成运行期 UUID，快照仅按稳定位置描述同一素材。
  canonicalCover?.images?.forEach((image, index) => { image.id = `frozen-image-${index}`; });
  for (const resource of resources) replaceResource(canonicalCover, resource.key, `sha256:${resource.sha256}`);
  const snapshot = { schemaVersion: 1, inputHash: header.inputHash, title: input.title, body: input.body, account: input.account,
    documentId: header.documentId, documentRevision: header.documentRevision, article,
    cover: canonicalCover,
    coverSource: defaults.cover?.source ?? "explicit", resources: resources.map(({ path: _, ...value }) => value),
    bodyAssets: header.bodyAssets, systemAssets: systemAssets.map(({ path: _, source: __, ...value }) => value), fonts, runtime,
    ...(renderedSnapshot ? { renderedCover: renderedSnapshot } : {}) };
  const snapshotHash = canonicalHash(snapshot);
  await writeMetadata(join(workspace, "snapshot.json"), { ...snapshot, snapshotHash });
  const fileHashes: Record<string, string> = {};
  for (const path of [configFile, articleThemePath, bodyPath, imagesFile, ...(fontPath ? [fontPath] : []), join(workspace, "snapshot.json"), ...(coverConfig ? [join(templateDir, `${coverTemplateId}.json`)] : []), ...(renderedCover ? [renderedCover.path] : []), ...bodyAssets.map(asset => asset.path), ...systemAssets.map(asset => asset.path), ...resources.map(resource => resource.path)]) {
    fileHashes[path] = canonicalHash((await readFile(path)).toString("base64"));
  }
  const prepared: PreparedArticle = { schemaVersion: 1, inputHash: header.inputHash, snapshotHash, articleThemeHash, coverTemplateId,
    configFile, articleThemePath, bodyPath, dataDir, imagesFile, bodyAssets, systemAssets, resources, fonts, fontPath, fileHashes, runtime,
    ...(renderedCover ? { renderedCover } : {}) };
  await writeMetadata(join(workspace, "prepared.json"), prepared);
  return prepared;
}

export async function readPreparedArticle(workspace: string, expectedHash: string): Promise<PreparedArticle> {
  const prepared = JSON.parse(await readFile(join(workspace, "prepared.json"), "utf8")) as PreparedArticle;
  if (canonicalHash(prepared) !== expectedHash) throw new Error("Prepared article identity mismatch");
  const realWorkspace = await realpath(workspace);
  for (const [path, hash] of Object.entries(prepared.fileHashes)) {
    if (relative(realWorkspace, await realpath(path)).startsWith("..") || canonicalHash((await readFile(path)).toString("base64")) !== hash) throw new Error(`Pinned article material hash mismatch: ${basename(path)}`);
  }
  return prepared;
}
export function preparedCover(prepared: PreparedArticle): JobCoverMaterials | undefined {
  if (prepared.renderedCover) return undefined;
  return { dataDir: prepared.dataDir, imagesFile: prepared.imagesFile, fontPath: prepared.fontPath, snapshot: { id: prepared.coverTemplateId } as JobCoverMaterials["snapshot"] };
}
