import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { resolveMarkdownRenderer } from "../adapter-loader";
import { resolveConfigRelativePath, type PipelineConfig, type ResolvedWorkspacePaths } from "../config";
import type { ArticleThemePackage } from "../article-theme";
import type { WorkflowState } from "../state";
import { injectIllustrationImages } from "../text";
import { reportProgress } from "../monitor/recorder";
import { validateArtifactManifest, type ArtifactManifest } from "../article-snapshot";
import type { MarkdownRenderOutput } from "../adapter-types";

/** 文章导出只做本地排版，预览与直接发布复用；没有微信上传操作。 */
export async function exportWechatArticle({ state, config, workspacePaths, account, articleTheme }: {
  state: WorkflowState; config: PipelineConfig; workspacePaths: ResolvedWorkspacePaths; account: string; articleTheme?: ArticleThemePackage;
}): Promise<{ html: string; photos: string[]; rendered: MarkdownRenderOutput; exportPostPath: string }> {
  let exportPostPath = join(state.asset_path, "post.md");
  const cover = state.images.render_assets.find(asset => asset.route === "wechat-article" && asset.kind === "cover");
  const photos = cover ? [cover.path] : [];
  if (state.images.body_inputs.scope === "article" && state.images.body_inputs.status === "ready") {
    const body = injectIllustrationImages(await readFile(exportPostPath, "utf8"), state.images.body_inputs.received);
    exportPostPath = join(state.asset_path, "post-wechat-draft.md");
    await writeFile(exportPostPath, body);
    photos.push(...state.images.body_inputs.received.map(image => image.path));
  }
  const renderer = await resolveMarkdownRenderer(config);
  const wxAccount = config.wx.accounts[account] ?? config.wx.accounts[config.wx.defaultAccount];
  const standalone = articleTheme?.manifest.css !== undefined;
  const rendered = await renderer.render({ onProgress: reportProgress, markdownPath: exportPostPath,
    outPath: workspacePaths.zotepadExportHtml, account, title: state.metadata.title,
    customCss: standalone ? null : resolveConfigRelativePath(wxAccount?.customCss),
    articleThemePath: articleTheme?.path, themeOverrides: standalone ? undefined : wxAccount?.theme });
  return { html: rendered.html, photos, rendered, exportPostPath };
}

export interface FrozenArticleArtifacts {
  manifest: ArtifactManifest;
  manifestHash: string;
  files: Record<string, string>;
}

/** 私有 manifest 是唯一文件白名单；确认发布只读已验证产物，不再导出或渲染。 */
export async function readFrozenArticleArtifacts(manifestPath: string): Promise<{ html: string; photos: string[]; rendered?: undefined; exportPostPath: string }> {
  const stored = JSON.parse(await readFile(manifestPath, "utf8")) as FrozenArticleArtifacts;
  if (stored.manifestHash !== process.env.ZZHUB_PIPELINE_ARTIFACT_MANIFEST_HASH || stored.manifest.snapshotHash !== process.env.ZZHUB_PIPELINE_ARTICLE_SNAPSHOT_HASH) throw new Error("Frozen artifact identity does not match the confirmed job");
  const manifest = validateArtifactManifest(stored.manifest, stored.manifestHash);
  const root = dirname(resolve(manifestPath));
  const bytes = new Map<string, Buffer>();
  const paths = new Map<string, string>();
  for (const artifact of manifest.artifacts) {
    const name = stored.files[artifact.key];
    if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") throw new Error("Invalid private artifact file");
    const path = join(root, name);
    const data = await readFile(path);
    if (data.byteLength !== artifact.byteLength || createHash("sha256").update(data).digest("hex") !== artifact.sha256) throw new Error("Frozen article artifact hash mismatch");
    bytes.set(artifact.key, data); paths.set(artifact.key, path);
  }
  let html = bytes.get("article")!.toString("utf8");
  html = await new HTMLRewriter().on("img", { element(element) {
    const source = element.getAttribute("src") || "";
    const id = /^asset:([a-f\d-]{36})$/.exec(source)?.[1];
    const path = id ? paths.get(`media_${id}`) : undefined;
    if (!path) throw new Error("Frozen HTML contains an unmanaged image");
    element.setAttribute("src", path);
    if (element.hasAttribute("data-src")) element.setAttribute("data-src", path);
  } }).transform(new Response(html)).text();
  return { html, photos: [paths.get("cover")!, ...manifest.artifacts.filter(artifact => artifact.kind === "media").map(artifact => paths.get(artifact.key)!)], exportPostPath: paths.get("article")! };
}
