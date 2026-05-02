/**
 * Built-in image renderer adapter — wraps imgx (runRenderCardCli + runRenderArticleCli).
 *
 * Implements ImageRenderPlugin interface. This is the default adapter used
 * when no user-provided plugin is configured.
 */

import { mkdir, readdir, rm, rmdir, writeFile } from "fs/promises";
import { join } from "path";

import { runRenderArticleCli, runRenderCardCli } from "../imgx";
import type { RenderArticleResult } from "../imgx";
import {
  removeIllustrationMarkers,
  removePageMarkers,
  compressBlankLines,
  countParagraphs,
  generateCoverTitle,
} from "../text";
import { getLongformTheme } from "../routes";
import { resolveWorkspacePaths } from "../config";
import type {
  ImageRenderPlugin,
  ImageRenderInput,
  ImageRenderOutput,
  PipelinePluginDoctorCheck,
} from "../adapter-types";
import type {
  NewspicRenderSpec,
  RenderAsset,
  AccountVisualParams,
} from "../state";

// ── Helpers ──────────────────────────────────────────────────────

function appendPosterVisualArgs(
  cmdParts: string[],
  visualParams: AccountVisualParams | null,
  highlightWords: string[],
): void {
  if (visualParams) {
    cmdParts.push("--highlight", visualParams.highlight);
    cmdParts.push("--bg", visualParams.bg);
    cmdParts.push("--footer", visualParams.footer);
    cmdParts.push("--fallback-icon", visualParams.fallback_icon);
  }
  cmdParts.push("--highlight-words", highlightWords.join(","));
}

type ResolvedPageImageSpecFile = {
  default_image_layout: string;
  target_fill_ratio: number;
  page_specs: Array<{
    page: number;
    image_layout?: string;
    target_fill_ratio?: number;
    images: Array<{ src: string; alt: string; caption: string }>;
  }>;
};

function buildExplicitPageImageSpec(
  spec: NewspicRenderSpec,
  received: Array<{ marker: string; path: string }>,
): ResolvedPageImageSpecFile | null {
  if (!spec.page_specs || spec.page_specs.length === 0) {
    return null;
  }

  const receivedMap = new Map(received.map((item) => [item.marker, item.path]));
  const pageSpecs = spec.page_specs.map((pageSpec) => {
    const images = pageSpec.image_markers
      .map((marker) => {
        const path = receivedMap.get(marker);
        if (!path) return null;
        return { src: path, alt: marker, caption: "" };
      })
      .filter((item): item is { src: string; alt: string; caption: string } => item !== null);

    return {
      page: pageSpec.page,
      image_layout: pageSpec.image_layout ?? spec.default_image_layout,
      target_fill_ratio: pageSpec.target_fill_ratio ?? spec.target_fill_ratio,
      images,
    };
  });

  return {
    default_image_layout: spec.default_image_layout,
    target_fill_ratio: spec.target_fill_ratio,
    page_specs: pageSpecs,
  };
}

function validateNewspicRenderResult(
  spec: NewspicRenderSpec,
  result: { pageCount: number; pages: Array<{ page: number; imageCount: number }> },
): string[] {
  const errors: string[] = [];

  if (result.pageCount < spec.min_pages) {
    errors.push(
      `newspic render produced ${result.pageCount} page(s), but at least ${spec.min_pages} page(s) were requested`,
    );
  }

  if (spec.require_image_every_page) {
    const missingPages = result.pages
      .filter((page) => page.imageCount < 1)
      .map((page) => page.page);
    if (missingPages.length > 0) {
      errors.push(`pages without required body images: ${missingPages.join(", ")}`);
    }
  }

  for (const pageSpec of spec.page_specs) {
    if (pageSpec.image_markers.length === 0) continue;
    const page = result.pages.find((item) => item.page === pageSpec.page);
    if (!page) {
      errors.push(
        `page ${pageSpec.page} was explicitly configured but render only produced ${result.pageCount} page(s)`,
      );
      continue;
    }
    if (page.imageCount < pageSpec.image_markers.length) {
      errors.push(
        `page ${pageSpec.page} expected ${pageSpec.image_markers.length} body image(s), but render placed ${page.imageCount}`,
      );
    }
  }

  return errors;
}

// ── Render helpers ───────────────────────────────────────────────

async function renderCover(
  template: string,
  title: string,
  outputDir: string,
  visualParams: AccountVisualParams | null,
  highlightWords: string[],
): Promise<RenderAsset> {
  const coverOut = join(outputDir, "cover.png");
  const route = template === "wechat-cover-split" ? "wechat-article" : "wechat-newspic";

  if (template === "wechat-cover-split") {
    const cmdParts = ["--template", "wechat-cover-split", "--text", title];
    cmdParts.push("--highlight-words", highlightWords.join(","));
    cmdParts.push("--out", coverOut);
    runRenderCardCli(cmdParts);
  } else {
    const cmdParts = ["--template", "poster-3-4", "--text", title];
    appendPosterVisualArgs(cmdParts, visualParams, highlightWords);
    cmdParts.push("--out", coverOut);
    runRenderCardCli(cmdParts);
  }

  return { kind: "cover", route: route as RenderAsset["route"], path: coverOut };
}

async function renderLongformPages(
  input: ImageRenderInput,
  outputDir: string,
  newspicRenderSpec: NewspicRenderSpec,
  bodyImages: Array<{ marker: string; path: string }>,
  vp: AccountVisualParams | null,
): Promise<{ assets: RenderAsset[]; pageCount: number; pages: ImageRenderOutput["pages"] }> {
  const state = input.state;
  const cleanBody = removeIllustrationMarkers(input.bodyText);

  const explicitPageImageSpec = buildExplicitPageImageSpec(newspicRenderSpec, bodyImages);

  let pageBody = cleanBody;
  if (explicitPageImageSpec === null) {
    pageBody = removePageMarkers(pageBody);
  }
  pageBody = compressBlankLines(pageBody);

  const workspacePaths = resolveWorkspacePaths(state.workspace_root);
  const tempRunDir = join(workspacePaths.tempRoot, state.run_id);
  const tempDir = join(tempRunDir, "render-longform");
  const tempBodyPath = join(tempDir, "body.md");
  const tempPageImageSpecPath = join(tempDir, "page-images.json");
  const keepTempFiles = process.env.ZZHUB_PIPELINE_KEEP_TMP === "1";
  await mkdir(tempDir, { recursive: true });
  await writeFile(tempBodyPath, pageBody, "utf-8");

  const theme = input.theme ?? getLongformTheme(state.route.account);
  const pageParts = [
    "--title", input.title,
    "--text-file", tempBodyPath,
    "--out-dir", outputDir,
    "--theme", theme,
  ];

  if (newspicRenderSpec.min_pages > 1) {
    pageParts.push("--min-pages", String(newspicRenderSpec.min_pages));
  }
  if (newspicRenderSpec.max_pages > 0) {
    pageParts.push("--max-pages", String(newspicRenderSpec.max_pages));
  }

  if (vp?.footer) {
    pageParts.push("--footer", vp.footer);
  }

  if (explicitPageImageSpec) {
    await writeFile(tempPageImageSpecPath, JSON.stringify(explicitPageImageSpec, null, 2), "utf-8");
    pageParts.push("--page-image-spec-file", tempPageImageSpecPath);
  }

  if (bodyImages.length > 0 && !explicitPageImageSpec) {
    for (const img of bodyImages) {
      pageParts.push("--body-image", img.path);
    }
    pageParts.push(
      "--image-layout",
      newspicRenderSpec.default_image_layout,
    );
  }

  let result: RenderArticleResult;
  try {
    result = runRenderArticleCli(pageParts);
  } finally {
    if (!keepTempFiles) {
      await rm(tempDir, { recursive: true, force: true });
      await rmdir(tempRunDir).catch(() => undefined);
    }
  }

  const errors = validateNewspicRenderResult(newspicRenderSpec, result);
  if (errors.length > 0) {
    throw new Error(`newspic render constraints not satisfied: ${errors.join("; ")}`);
  }

  // Discover generated page files
  const files = await readdir(outputDir);
  const pageFiles = files.filter((f) => /^article-\d+\.png$/.test(f)).sort();

  const assets: RenderAsset[] = [];
  for (let i = 0; i < pageFiles.length; i++) {
    assets.push({
      kind: "page",
      route: "wechat-newspic",
      index: i + 1,
      path: join(outputDir, pageFiles[i]),
    });
  }

  return { assets, pageCount: result.pageCount, pages: result.pages };
}

// ── Plugin implementation ────────────────────────────────────────

export const builtinImageRenderer: ImageRenderPlugin = {
  name: "builtin-imgx",
  version: "1.0.0",

  async doctor(): Promise<PipelinePluginDoctorCheck[]> {
    const checks: PipelinePluginDoctorCheck[] = [];

    // Check @napi-rs/canvas
    try {
      await import("@napi-rs/canvas");
      checks.push({ name: "@napi-rs/canvas", ok: true });
    } catch {
      checks.push({
        name: "@napi-rs/canvas",
        ok: false,
        message:
          "@napi-rs/canvas not installed. Install it with:\n" +
          "  npm install @napi-rs/canvas\n" +
          "  # or: bun add @napi-rs/canvas\n" +
          "This is required for image rendering (poster, longform, cover).",
      });
    }

    return checks;
  },

  async render(input: ImageRenderInput): Promise<ImageRenderOutput> {
    const { state, bodyText, outputDir, title, route } = input;
    const highlightWords = state.route.highlight_words ?? [];

    // Normalize visual params: adapter input uses camelCase, state uses snake_case
    const adapterVp = input.accountVisualParams;
    const stateVp = state.route.account_visual_params;
    const vp: AccountVisualParams | null = adapterVp
      ? {
          footer: adapterVp.footer ?? "",
          bg: adapterVp.bg ?? "",
          highlight: adapterVp.highlight ?? "",
          fallback_icon: adapterVp.fallbackIcon ?? "",
        }
      : stateVp;

    await mkdir(outputDir, { recursive: true });

    if (route === "wechat-article") {
      // Article: cover only (wechat-cover-split)
      const cover = await renderCover("wechat-cover-split", title, outputDir, null, highlightWords);
      return { assets: [cover], pageCount: 1, pages: [{ page: 1, imageCount: 0, imageSources: [] }] };
    }

    if (route === "blog") {
      return { assets: [], pageCount: 0, pages: [] };
    }

    // wechat-newspic: determine short vs long
    const stats = countParagraphs(bodyText);
    const autoLong = stats.paragraphs >= 3 || stats.charCount > 150;
    const newspicRenderSpec: NewspicRenderSpec = {
      pagination_mode: input.pageSpecs && input.pageSpecs.length > 0 ? "multi" : "auto",
      min_pages: input.minPages ?? 1,
      max_pages: input.maxPages ?? 0,
      require_image_every_page: false,
      default_image_layout: "staggered",
      target_fill_ratio: 0.8,
      page_specs: (input.pageSpecs ?? []).map((ps) => ({
        page: ps.page,
        image_markers: ps.imageMarkers ?? [],
        image_layout: ps.imageLayout ?? null,
        target_fill_ratio: ps.targetFillRatio ?? null,
        note: ps.note ?? null,
      })),
    };

    const isLong =
      newspicRenderSpec.pagination_mode === "multi" ||
      (newspicRenderSpec.pagination_mode !== "single" && autoLong);

    if (!isLong) {
      // Short: single poster cover
      const coverTitle = generateCoverTitle(title);
      const cover = await renderCover("poster-3-4", coverTitle, outputDir, vp, highlightWords);
      return { assets: [cover], pageCount: 1, pages: [{ page: 1, imageCount: 0, imageSources: [] }] };
    }

    // Long: cover + article pages
    const coverTitle = generateCoverTitle(title);
    const cover = await renderCover("poster-3-4", coverTitle, outputDir, vp, highlightWords);

    const bodyImages = input.bodyImages ?? [];
    const pageResult = await renderLongformPages(input, outputDir, newspicRenderSpec, bodyImages, vp);

    return {
      assets: [cover, ...pageResult.assets],
      pageCount: pageResult.pageCount,
      pages: pageResult.pages,
    };
  },
};
