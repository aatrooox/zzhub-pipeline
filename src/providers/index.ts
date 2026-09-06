import { readFile, writeFile } from "fs/promises";
import { join } from "path";
import {
  resolveConfigRelativePath,
  type PipelineConfig,
  type ResolvedWorkspacePaths,
} from "../config";
import { PublishResult, RenderAsset, RoutePrimary, WorkflowState } from "../state";
import {
  injectIllustrationImages,
  prepareBodyForNewspic,
} from "../text";
import { resolveMarkdownRenderer } from "../adapter-loader";
import { reportProgress } from "../monitor/recorder";
import { publishBlogRoute } from "./blog";
import { createWechatDraft, createWechatNewspic, extractImageUrls, mergePhotoLists } from "./wechat";

export interface PublishRouteContext {
  state: WorkflowState;
  dryRun: boolean;
  config: PipelineConfig;
  workspacePaths: ResolvedWorkspacePaths;
  accountOverride?: string;
}

export type PublishProvider = (ctx: PublishRouteContext) => Promise<PublishResult>;

async function publishWechatArticleRoute({
  state,
  dryRun,
  config,
  workspacePaths,
  accountOverride,
}: PublishRouteContext): Promise<PublishResult> {
  const postPath = join(state.asset_path, "post.md");
  let exportPostPath = postPath;
  const cover = (state.images.render_assets as RenderAsset[]).find(
    (asset) => asset.route === "wechat-article" && asset.kind === "cover",
  );

  const photos: string[] = [];
  if (cover) {
    photos.push(cover.path);
  }
  if (
    state.images.body_inputs.scope === "article" &&
    state.images.body_inputs.status === "ready"
  ) {
    const postContent = await readFile(postPath, "utf-8");
    const draftContent = injectIllustrationImages(
      postContent,
      state.images.body_inputs.received,
    );
    exportPostPath = join(state.asset_path, "post-wechat-draft.md");
    if (!dryRun) {
      await writeFile(exportPostPath, draftContent, "utf-8");
    }

    for (const img of state.images.body_inputs.received) {
      photos.push(img.path);
    }
  }

  const account = accountOverride || state.route.account;

  if (dryRun) {
    console.error(`[dry-run] Zotepad export: ${exportPostPath}`);
    console.error(`[dry-run] Wechat draft: ${state.metadata.title}`);
    return {
      route: "wechat-article",
      account,
      status: "skipped",
      detail: "dry-run",
      published_at: null,
      content_version: state.artifacts.content_version,
      render_version: state.artifacts.render_version,
    };
  }

  try {
    const markdownRenderer = await resolveMarkdownRenderer(config);
    const wxAccount = config.wx.accounts[account] ?? config.wx.accounts[config.wx.defaultAccount];
    const rendered = await markdownRenderer.render({
      onProgress: reportProgress,
      markdownPath: exportPostPath,
      outPath: workspacePaths.zotepadExportHtml,
      account,
      title: state.metadata.title,
      customCss: resolveConfigRelativePath(wxAccount?.customCss),
      themeOverrides: wxAccount?.theme,
    });
    const { html } = rendered;

    // Register with local preview server unless explicitly disabled.
    if (process.env.ZZHUB_WECHAT_PREVIEW_ON_PUBLISH !== "0") {
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
  const bodyImageUrls = extractImageUrls(postContent);
  const cleanContent = prepareBodyForNewspic(postContent);
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
  const photos = mergePhotoLists(renderPhotos, bodyImageUrls);

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
      account,
      title: state.metadata.title,
      content: cleanContent,
      photos,
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
