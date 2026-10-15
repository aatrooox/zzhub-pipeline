import type { ArticleThemePackage } from "../article-theme";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import {
  type PipelineConfig,
  type ResolvedWorkspacePaths,
} from "../config";
import { PublishResult, RenderAsset, RoutePrimary, WorkflowState } from "../state";
import {
  prepareBodyForNewspic,
} from "../text";
import { exportWechatArticle, readFrozenArticleArtifacts } from "./article-export";
import { publishBlogRoute } from "./blog";
import { createWechatDraft, createWechatNewspic, extractImageUrls, mergePhotoLists } from "./wechat";

export interface PublishRouteContext {
  state: WorkflowState;
  dryRun: boolean;
  config: PipelineConfig;
  workspacePaths: ResolvedWorkspacePaths;
  accountOverride?: string;
  articleTheme?: ArticleThemePackage;
}

export type PublishProvider = (ctx: PublishRouteContext) => Promise<PublishResult>;

async function publishWechatArticleRoute({
  state,
  dryRun,
  config,
  workspacePaths,
  accountOverride,
  articleTheme,
}: PublishRouteContext): Promise<PublishResult> {
  const account = accountOverride || state.route.account;
  if (dryRun) {
    return { route: "wechat-article", account, status: "skipped", detail: "dry-run", published_at: null,
      content_version: state.artifacts.content_version, render_version: state.artifacts.render_version };
  }

  try {
    if (process.env.ZZHUB_PIPELINE_PREVIEW_ONLY === "1") throw new Error("Preview operation cannot publish or upload WeChat images");
    const frozenPath = process.env.ZZHUB_PIPELINE_ARTICLE_ARTIFACTS;
    const prepared = frozenPath
      ? await readFrozenArticleArtifacts(frozenPath)
      : await exportWechatArticle({ state, config, workspacePaths, account, articleTheme });
    const { html, photos, rendered, exportPostPath } = prepared;

    // Register with local preview server unless explicitly disabled.
    if (rendered && process.env.ZZHUB_WECHAT_PREVIEW_ON_PUBLISH !== "0") {
      try {
        const { registerPreviewEntry } = await import("../wechat-preview/server");
        const registration = await registerPreviewEntry(
          {
            title: `[publish] ${state.metadata.title || "untitled"}`,
            account,
            status: "success",
            duration_ms: rendered.durationMs ?? 0,
            markdown_path: exportPostPath,
            html_path: workspacePaths.zotepadExportHtml,
            preview_style: rendered.previewStyle,
            html,
            debug: {
              bundle_rebuilt: rendered.bundleRebuilt,
              bundle_stale: rendered.bundleStale,
            },
          },
          { autoStart: process.env.ZZHUB_WECHAT_PREVIEW_AUTO_START !== "0" },
        );
        if (!registration.ok) console.warn(`微信预览登记失败：${registration.error || "未知原因"}`);
      } catch (error) {
        // 预览故障只记录警告，不改变发布结果。
        console.warn("微信预览登记失败：", error);
      }
    }

    const response = await createWechatDraft({
      account,
      title: state.metadata.title,
      html,
      photos,
      ...(frozenPath ? { explicitPhotos: true } : {}),
      idempotencyKey: createHash("sha256").update(JSON.stringify([state.run_id, state.publish.attempt ?? 0, account, state.artifacts.content_version, state.artifacts.render_version, articleTheme?.hash, state.intent.existing_draft_media_id])).digest("hex"),
      config,
      existingDraftMediaId: state.intent.existing_draft_media_id,
      noteId: state.intent.note_id,
      nezusBaseUrl: process.env.ZZHUB_WX_BASE_URL || config.wx.baseUrl,
      nezusPat: process.env.ZZCLUB_PAT || config.wx.accounts[account]?.pat || config.wx.accounts[config.wx.defaultAccount]?.pat,
    });
    return {
      route: "wechat-article",
      account,
      status: "success",
      detail: null,
      external_id: typeof response.draftMediaId === "string" ? response.draftMediaId : null,
      published_at: new Date().toISOString(),
      content_version: state.artifacts.content_version,
      render_version: state.artifacts.render_version,
    };
  } catch (error) {
    return {
      route: "wechat-article",
      account,
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
      published_at: null,
      content_version: state.artifacts.content_version,
      render_version: state.artifacts.render_version,
    };
  }

}

async function publishWechatNewspicRoute({
  state,
  dryRun,
  config,
  accountOverride,
}: PublishRouteContext): Promise<PublishResult> {
  const postPath = join(state.asset_path, "post.md");
  const postContent = await readFile(postPath, "utf-8");
  // 副本正文原样发送，手动配图优先，空配图使用生成的封面和内容页。
  const snapshot = state.intent.newspic_file
    ? JSON.parse(await readFile(state.intent.newspic_file, "utf8")) as { content: string; photos: string[] }
    : null;
  const bodyImageUrls = extractImageUrls(postContent);
  let cleanContent = snapshot?.content ?? prepareBodyForNewspic(postContent);
  // 旧入口没有独立配文时使用短摘录，全文已保存在内容图中。
  if (!snapshot && Buffer.byteLength(cleanContent, "utf8") > 2048)
    cleanContent = `${Array.from(cleanContent).slice(0, 500).join("")}…`;
  const cleanPath = join(state.asset_path, "post-clean.md");
  if (!dryRun) {
    await writeFile(cleanPath, cleanContent, "utf-8");
  }

  const assets = (state.images.render_assets as RenderAsset[])
    .filter((asset) => asset.route === "wechat-newspic")
    .sort((a, b) => {
      if (a.kind === "cover" && b.kind !== "cover") return -1;
      if (a.kind !== "cover" && b.kind === "cover") return 1;
      return (a.index ?? 0) - (b.index ?? 0);
    });

  const renderPhotos = assets.map((asset) => asset.path);
  const photos = snapshot ? (snapshot.photos.length ? snapshot.photos : renderPhotos) : mergePhotoLists(renderPhotos, bodyImageUrls);

  const account = accountOverride || state.route.account;

  if (dryRun) {
    console.error(`[dry-run] Wechat newspic: ${state.metadata.title}`);
    console.error(`[dry-run] Content file: ${cleanPath}`);
    return {
      route: "wechat-newspic",
      account,
      status: "skipped",
      detail: "dry-run",
      published_at: null,
      content_version: state.artifacts.content_version,
      render_version: state.artifacts.render_version,
    };
  }

  try {
    const response = await createWechatNewspic({
      idempotencyKey: createHash("sha256").update(JSON.stringify([state.run_id, state.publish.attempt ?? 0, account, "newspic", state.artifacts.content_version, state.artifacts.render_version, state.intent.existing_draft_media_id])).digest("hex"),
      account,
      title: state.metadata.title,
      content: cleanContent,
      photos,
      explicitPhotos: !!snapshot,
      config,
      existingDraftMediaId: state.intent.existing_draft_media_id,
      noteId: state.intent.note_id,
      nezusBaseUrl: process.env.ZZHUB_WX_BASE_URL || config.wx.baseUrl,
      nezusPat: process.env.ZZCLUB_PAT || config.wx.accounts[account]?.pat || config.wx.accounts[config.wx.defaultAccount]?.pat,
    });
    return {
      route: "wechat-newspic",
      account,
      status: "success",
      detail: null,
      external_id: typeof response.draftMediaId === "string" ? response.draftMediaId : null,
      published_at: new Date().toISOString(),
      content_version: state.artifacts.content_version,
      render_version: state.artifacts.render_version,
    };
  } catch (error) {
    return {
      route: "wechat-newspic",
      account,
      status: "failed",
      detail: error instanceof Error ? error.message : String(error),
      published_at: null,
      content_version: state.artifacts.content_version,
      render_version: state.artifacts.render_version,
    };
  }

}

const PUBLISH_PROVIDERS: Record<RoutePrimary, PublishProvider> = {
  "wechat-article": publishWechatArticleRoute,
  "wechat-newspic": publishWechatNewspicRoute,
  "blog": publishBlogRoute,
};

export function getPublishProvider(route: RoutePrimary): PublishProvider {
  const provider = PUBLISH_PROVIDERS[route];
  if (!provider) {
    throw new Error(`Unsupported workflow publish route: ${route}`);
  }
  return provider;
}

export function listPublishProviders(): RoutePrimary[] {
  return Object.keys(PUBLISH_PROVIDERS) as RoutePrimary[];
}
