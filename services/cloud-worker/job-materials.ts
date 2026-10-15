import { mkdir, readFile, realpath, writeFile } from "node:fs/promises";
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

export interface PreparedArticle {
  schemaVersion: 1; inputHash: string; snapshotHash: string;
  articleThemeHash: string; coverTemplateId: string;
  configFile: string; articleThemePath: string; bodyPath: string; dataDir: string; imagesFile: string;
  bodyAssets: Array<BodyAssetIdentity & { path: string }>;
  systemAssets: Array<Omit<BodyAssetIdentity, "contentType"> & { contentType: BodyAssetIdentity["contentType"] | "image/gif"; path: string; source: string }>;
  resources: Array<{ key: string; sha256: string; path: string; contentType: string }>;
  fonts: Array<{ requested: string; resolved: string; sha256: string }>;
  fontPath: string;
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
    return { bytes: Buffer.from(base64!, "base64"), contentType: header!.slice(5).split(";")[0]! };
  }
  if (!isAbsolute(source)) throw new Error("Default resource requires a trusted absolute path");
  const type = ({ ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" } as Record<string, string>)[extname(source).toLowerCase()] || "";
  return { bytes: await readFile(source), contentType: type };
}

/** 接收阶段解析并固化实际默认，入队后不再读取可变模板、字体或素材。 */
export async function prepareArticleMaterials(workspace: string, input: CloudJobInput, root: string): Promise<PreparedArticle> {
  const header = validateArticleSnapshot(input.articleSnapshot, input);
  await verifyArticleCoverFont();
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  const fontPath = join(workspace, "cover-font.ttc");
  await writeFile(fontPath, await readFile(articleCoverFontPath()), { mode: 0o600 });
  const styleInput = join(workspace, "style-input.json");
  if (input.articleStyle) await writeFile(styleInput, JSON.stringify(input.articleStyle.manifest), { mode: 0o600 });
  const env: Record<string, string | undefined> = { ...process.env, PIPELINE_STYLE_INPUT: styleInput };
  if (process.env.PIPELINE_CONFIG_FILE) env.ZZHUB_PIPELINE_CONFIG = process.env.PIPELINE_CONFIG_FILE;
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "resolve-defaults.ts")], { env, stdin: "pipe", stdout: "pipe", stderr: "pipe" });
  child.stdin.write(JSON.stringify(input)); child.stdin.end();
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  if (exit !== 0) throw new Error(`Cannot freeze article defaults: ${stderr.slice(-2000)}`);
  const defaults = JSON.parse(stdout) as { config: PipelineConfig; article: any; cover: { config: TypesetConfig; source: string; resources: Array<{ key: string; src: string }> } | null };
  const fonts: PreparedArticle["fonts"] = [];
  const recordFont = (requested: string) => { fonts.push({ requested, resolved: ARTICLE_COVER_FONT.family, sha256: ARTICLE_COVER_FONT.sha256 }); return ARTICLE_COVER_FONT.family; };
  const article = ArticleThemeSchema.parse(defaults.article);
  validateArticleThemeCss(article, article.css || "");
  const systemAssets: PreparedArticle["systemAssets"] = [];
  if (article.structure.headerImageUrl) {
    const source = article.structure.headerImageUrl;
    const resource = await trustedResource(source);
    const identity = await validateSystemAsset(resource.bytes, resource.contentType);
    const hex = identity.sha256.slice(0, 32);
    const id = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20)}`;
    const path = join(workspace, `header-${id}.${identity.contentType === "image/gif" ? "gif" : assetExtension(identity.contentType)}`);
    await writeFile(path, resource.bytes, { mode: 0o600 });
    systemAssets.push({ ...identity, id, path, source });
  }
  const articleThemePath = join(workspace, "article-style.json");
  await writeFile(articleThemePath, JSON.stringify(article), { mode: 0o600 });
  const articleThemeHash = (await readArticleTheme(articleThemePath)).hash;

  const coverConfig = structuredClone(input.coverSnapshot?.config ?? defaults.cover!.config);
  const requestedFonts = [coverConfig.typography.headingFont, coverConfig.typography.bodyFont, ...Object.values(coverConfig.coverTheme?.typography || {}).map((font: any) => font.fontFamily)];
  const supported = /^(Publishing Cover|PingFang SC|Songti SC|Hiragino Sans GB|Noto Sans CJK SC|Noto Sans SC|system-ui|sans-serif|AlimamaShuHeiTi|LXGWNeoZhiSongPlus|LXGWWenKai)$/;
  if (requestedFonts.some(font => !supported.test(font))) throw new Error("Default template uses an unsupported custom font");
  coverConfig.typography.headingFont = recordFont(coverConfig.typography.headingFont);
  coverConfig.typography.bodyFont = recordFont(coverConfig.typography.bodyFont);
  for (const font of Object.values(coverConfig.coverTheme?.typography || {}) as Array<{ fontFamily: string }>) font.fontFamily = recordFont(font.fontFamily);
  const dataDir = join(workspace, "cover", "typeset");
  const templateDir = join(dataDir, "templates");
  const resourceDir = join(workspace, "resources");
  await mkdir(templateDir, { recursive: true, mode: 0o700 }); await mkdir(resourceDir, { recursive: true, mode: 0o700 });
  await Promise.all([".initialized", ".canvas-presets-v1"].map(name => writeFile(join(templateDir, name), "1", { mode: 0o600 })));
  const resources: PreparedArticle["resources"] = [];
  const refs = input.coverSnapshot ? [{ key: "images.0.src", src: `data:image/jpeg;base64,${input.coverSnapshot.asset.dataBase64}` }] : defaults.cover!.resources;
  for (const [index, ref] of refs.entries()) {
    const resource = await trustedResource(ref.src);
    const identity = await validateBodyAsset(resource.bytes, resource.contentType);
    const path = join(resourceDir, `${index}.${assetExtension(identity.contentType)}`);
    await writeFile(path, resource.bytes, { mode: 0o600 });
    replaceResource(coverConfig, ref.key, path);
    resources.push({ key: ref.key, sha256: identity.sha256, path, contentType: identity.contentType });
  }
  const coverTemplateId = input.coverSnapshot?.id ?? "frozen-default-cover";
  coverConfig.id = coverTemplateId;
  await writeFile(join(templateDir, `${coverTemplateId}.json`), JSON.stringify(coverConfig), { mode: 0o600 });
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
  await writeFile(configFile, JSON.stringify(defaults.config), { mode: 0o600 });
  const imagesFile = join(workspace, "cover", "template-images.json"); await writeFile(imagesFile, JSON.stringify({ cover: {} }), { mode: 0o600 });
  const runtime = { pipeline: pkg.version, myno: pkg.dependencies["@akairos/myno"], typeset: pkg.dependencies["@akairos/typeset-studio"] };
  const canonicalCover = structuredClone(coverConfig);
  // Typeset 普通图片槽位会生成运行期 UUID，快照仅按稳定位置描述同一素材。
  canonicalCover.images?.forEach((image, index) => { image.id = `frozen-image-${index}`; });
  for (const resource of resources) replaceResource(canonicalCover, resource.key, `sha256:${resource.sha256}`);
  const snapshot = { schemaVersion: 1, inputHash: header.inputHash, title: input.title, body: input.body, account: input.account,
    documentId: header.documentId, documentRevision: header.documentRevision, article,
    cover: canonicalCover,
    coverSource: defaults.cover?.source ?? "explicit", resources: resources.map(({ path: _, ...value }) => value),
    bodyAssets: header.bodyAssets, systemAssets: systemAssets.map(({ path: _, source: __, ...value }) => value), fonts, runtime };
  const snapshotHash = canonicalHash(snapshot);
  await writeFile(join(workspace, "snapshot.json"), JSON.stringify({ ...snapshot, snapshotHash }), { mode: 0o600 });
  const fileHashes: Record<string, string> = {};
  for (const path of [configFile, articleThemePath, bodyPath, imagesFile, fontPath, join(workspace, "snapshot.json"), join(templateDir, `${coverTemplateId}.json`), ...bodyAssets.map(asset => asset.path), ...systemAssets.map(asset => asset.path), ...resources.map(resource => resource.path)]) {
    fileHashes[path] = canonicalHash((await readFile(path)).toString("base64"));
  }
  const prepared: PreparedArticle = { schemaVersion: 1, inputHash: header.inputHash, snapshotHash, articleThemeHash, coverTemplateId,
    configFile, articleThemePath, bodyPath, dataDir, imagesFile, bodyAssets, systemAssets, resources, fonts, fontPath, fileHashes, runtime };
  await writeFile(join(workspace, "prepared.json"), JSON.stringify(prepared), { mode: 0o600 });
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
export function preparedCover(prepared: PreparedArticle): JobCoverMaterials {
  return { dataDir: prepared.dataDir, imagesFile: prepared.imagesFile, fontPath: prepared.fontPath, snapshot: { id: prepared.coverTemplateId } as JobCoverMaterials["snapshot"] };
}
