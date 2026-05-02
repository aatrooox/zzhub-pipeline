/**
 * render — Execute Render phase: image-plan + bundled imgx invocation.
 *
 * 1. Reads state + post.md
 * 2. Runs image-plan logic (template selection, cover_title, output_dir)
 * 3. Invokes bundled imgx renderer methods
 * 4. Records render_assets and bumps render_version
 *
 * Usage:
 *   zzhub-pipeline render \
 *     --state /path/to/state.json \
 *     [--skip-render]  (plan only, don't invoke imgx)
 *
 * Output: Updated state with images.plan, images.render_assets
 */

import { mkdir, readFile, rm, rmdir, writeFile } from "fs/promises";
import { join } from "path";

import { parseArgs, requireArg, flagArg } from "../args";
import { printResult, renderRender } from "../output";
import { resolveWorkspacePaths } from "../config";
import { runRenderArticleCli, runRenderCardCli, type RenderArticleResult } from "../imgx";
import {
  defaultBodyInputs,
  normalizeNewspicRenderSpec,
  readState,
  writeState,
  type AccountVisualParams,
  type NewspicRenderSpec,
  type RenderAsset,
} from "../state";
import {
  stripFrontmatter,
  removeIllustrationMarkers,
  removePageMarkers,
  compressBlankLines,
  countParagraphs,
  generateCoverTitle,
} from "../text";
import { getLongformTheme } from "../routes";
import { collectNewspicRequiredMarkers } from "../workflow-materials";

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
    images: Array<{
      src: string;
      alt: string;
      caption: string;
    }>;
  }>;
};

function getNewspicRenderSpec(state: Awaited<ReturnType<typeof readState>>): NewspicRenderSpec {
  const spec = normalizeNewspicRenderSpec(state.intent.newspic_render);
  return {
    ...spec,
    min_pages: Math.max(spec.min_pages, spec.pagination_mode === "multi" ? 2 : 1),
  };
}

function buildExplicitPageImageSpec(
  spec: NewspicRenderSpec,
  received: Array<{ marker: string; path: string }>,
): ResolvedPageImageSpecFile | null {
  if (spec.page_specs.length === 0) {
    return null;
  }

  const receivedMap = new Map(received.map((item) => [item.marker, item.path]));
  const pageSpecs = spec.page_specs
    .map((pageSpec) => {
      const images = pageSpec.image_markers
        .map((marker) => {
          const path = receivedMap.get(marker);
          if (!path) {
            return null;
          }
          return {
            src: path,
            alt: marker,
            caption: "",
          };
        })
        .filter((item): item is { src: string; alt: string; caption: string } => item !== null);

      return {
        page: pageSpec.page,
        image_layout: pageSpec.image_layout ?? spec.default_image_layout,
        target_fill_ratio: pageSpec.target_fill_ratio ?? spec.target_fill_ratio,
        images,
      };
    })

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
    errors.push(`newspic render produced ${result.pageCount} page(s), but at least ${spec.min_pages} page(s) were requested`);
  }

  if (spec.require_image_every_page) {
    const missingPages = result.pages.filter((page) => page.imageCount < 1).map((page) => page.page);
    if (missingPages.length > 0) {
      errors.push(`pages without required body images: ${missingPages.join(", ")}`);
    }
  }

  for (const pageSpec of spec.page_specs) {
    if (pageSpec.image_markers.length === 0) {
      continue;
    }
    const page = result.pages.find((item) => item.page === pageSpec.page);
    if (!page) {
      errors.push(`page ${pageSpec.page} was explicitly configured but render only produced ${result.pageCount} page(s)`);
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

export async function render(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline render [options]

Options:
  --state        Path to state JSON (required)
  --skip-render  Plan only, don't invoke imgx (optional)
`.trim());
    return;
  }

  const statePath = requireArg(parsed, "state", "state JSON path");
  const skipRender = flagArg(parsed, "skip-render");

  const state = await readState(statePath);

  // Validate prerequisites
  if (!state.asset_path) {
    throw new Error("asset_path not set. Run prepare-finalize first.");
  }

  const postPath = join(state.asset_path, "post.md");
  const postContent = await readFile(postPath, "utf-8");
  const cleanBody = stripFrontmatter(postContent);

  // ── Image Plan ──────────────────────────────────────────────────

  const routePrimary = state.route.primary;

  if (routePrimary === "blog") {
    // Blog doesn't need images by default
    state.images.plan = {
      needed: false,
      template: null,
      cover_template: null,
      cover_title: null,
      output_dir: null,
      preview_required: false,
      status: "skipped",
    };
    state.images.render_assets = [];
    state.phase.render = { status: "done", error: null };
    state.phase.current = state.intent.requires.publish ? "publish" : "done";
    await writeState(statePath, state);
    printResult({
      plan: state.images.plan,
      render_assets: [],
      phase: state.phase.current,
    }, renderRender);
    return;
  }

  let template: string;
  let coverTemplate: string | null = null;
  let coverTitle: string | null = null;
  let outputDir: string;
  const newspicRenderSpec = getNewspicRenderSpec(state);

  if (routePrimary === "wechat-article") {
    template = "wechat-cover-split";
    outputDir = join(state.asset_path, "images", "wechat");
  } else {
    // wechat-newspic: determine short vs long
    const stats = countParagraphs(cleanBody);
    const autoLong = stats.paragraphs >= 3 || stats.charCount > 150;
    const isLong =
      newspicRenderSpec.pagination_mode === "multi" ||
      (newspicRenderSpec.pagination_mode !== "single" && autoLong);

    if (isLong) {
      template = "longform-3-4";
      coverTemplate = "poster-3-4";
      coverTitle = generateCoverTitle(state.metadata.title);
    } else {
      template = "poster-3-4";
      coverTitle = generateCoverTitle(state.metadata.title);
    }
    outputDir = join(state.asset_path, "images", "newspic");
  }

  state.images.plan = {
    needed: true,
    template,
    cover_template: coverTemplate,
    cover_title: coverTitle,
    output_dir: outputDir,
    preview_required: false,
    status: "planned",
  };

  // For longform, set up body_inputs
  if (template === "longform-3-4") {
    const markers = collectNewspicRequiredMarkers(cleanBody, state);
    const previousInputs =
      state.images.body_inputs.scope === "newspic-longform"
        ? state.images.body_inputs
        : null;
    const markerSet = new Set(markers);
    const received = previousInputs
      ? previousInputs.received.filter((item) => markerSet.has(item.marker))
      : [];
    state.images.body_inputs = {
      scope: "newspic-longform",
      expected: markers.length,
      received,
      status:
        markers.length === 0
          ? "none"
          : received.length >= markers.length
            ? "ready"
            : "pending",
      layout: previousInputs?.layout ?? newspicRenderSpec.default_image_layout,
    };

    // If body inputs are pending, we need to pause for user
    if (state.images.body_inputs.status === "pending") {
      state.images.plan.status = "planned";
      await writeState(statePath, state);
      printResult({
        plan: state.images.plan,
        body_inputs: state.images.body_inputs,
        newspic_render: newspicRenderSpec,
        waiting_for_user: true,
        message: `Waiting for ${markers.length} body image(s)`,
        phase: state.phase.current,
      }, renderRender);
      return;
    }
  } else if (state.images.body_inputs.scope === "newspic-longform") {
    state.images.body_inputs = defaultBodyInputs();
  }

  if (skipRender) {
    await writeState(statePath, state);
    printResult({
      plan: state.images.plan,
      newspic_render: routePrimary === "wechat-newspic" ? newspicRenderSpec : null,
      skip_render: true,
      phase: state.phase.current,
    }, renderRender);
    return;
  }

  // ── Invoke imgx ─────────────────────────────────────────────────

  const renderAssets: RenderAsset[] = [];
  await mkdir(outputDir, { recursive: true });

  if (template === "wechat-cover-split") {
    // Article cover
    const coverOut = join(outputDir, "cover.png");
    const cmdParts = ["--template", "wechat-cover-split", "--text", state.metadata.title];
    if (state.route.highlight_words.length > 0) {
      cmdParts.push(
        "--highlight-words",
        state.route.highlight_words.join(","),
      );
    } else {
      cmdParts.push("--highlight-words", "");
    }
    cmdParts.push(
      "--out", coverOut,
    );

    try {
      runRenderCardCli(cmdParts);
    } catch {
      state.images.plan.status = "planned";
      state.phase.render = { status: "failed", error: "imgx render-card failed" };
      await writeState(statePath, state);
      throw new Error("imgx render-card failed for wechat-cover-split");
    }

    renderAssets.push({
      kind: "cover",
      route: "wechat-article",
      path: coverOut,
    });
  } else if (template === "poster-3-4") {
    // Newspic short cover
    const coverOut = join(outputDir, "cover.png");
    const vp = state.route.account_visual_params;
    const cmdParts = ["--template", "poster-3-4", "--text", coverTitle ?? state.metadata.title];
    appendPosterVisualArgs(cmdParts, vp, state.route.highlight_words);
    cmdParts.push("--out", coverOut);

    try {
      runRenderCardCli(cmdParts);
    } catch {
      state.phase.render = { status: "failed", error: "imgx render-card failed" };
      await writeState(statePath, state);
      throw new Error("imgx render-card failed for poster-3-4");
    }

    renderAssets.push({
      kind: "cover",
      route: "wechat-newspic",
      path: coverOut,
    });
  } else if (template === "longform-3-4") {
    // Longform: first render cover with poster-3-4, then pages
    const coverOut = join(outputDir, "cover.png");
    const vp = state.route.account_visual_params;

    // Cover
    const coverParts = ["--template", "poster-3-4", "--text", coverTitle ?? state.metadata.title];
    appendPosterVisualArgs(coverParts, vp, state.route.highlight_words);
    coverParts.push("--out", coverOut);

    try {
      runRenderCardCli(coverParts);
    } catch {
      state.phase.render = { status: "failed", error: "imgx cover render failed" };
      await writeState(statePath, state);
      throw new Error("imgx cover render failed for longform");
    }

    renderAssets.push({
      kind: "cover",
      route: "wechat-newspic",
      path: coverOut,
    });

    // Prepare clean body for longform pages
    const explicitPageImageSpec = (
      state.images.body_inputs.scope === "newspic-longform" &&
      state.images.body_inputs.status === "ready"
    )
      ? buildExplicitPageImageSpec(
          newspicRenderSpec,
          state.images.body_inputs.received,
        )
      : buildExplicitPageImageSpec(newspicRenderSpec, []);

    let pageBody = removeIllustrationMarkers(cleanBody);
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

    // Pages
    const theme = getLongformTheme(state.route.account);
    const pageParts = [
      "--title", state.metadata.title,
      "--text-file", tempBodyPath,
      "--out-dir", outputDir,
      "--theme", theme,
    ];

    // When forced multi-page, pass min-pages to the render engine so it can
    // adaptively shrink contentHeight until the pagination target is reached.
    if (newspicRenderSpec.min_pages > 1) {
      pageParts.push("--min-pages", String(newspicRenderSpec.min_pages));
    }

    // When max-pages is set, pass it to the render engine so it can
    // adaptively grow contentHeight until page count is within limit.
    if (newspicRenderSpec.max_pages > 0) {
      pageParts.push("--max-pages", String(newspicRenderSpec.max_pages));
    }

    if (vp) {
      pageParts.push("--footer", vp.footer);
    }

    if (explicitPageImageSpec) {
      await writeFile(tempPageImageSpecPath, JSON.stringify(explicitPageImageSpec, null, 2), "utf-8");
      pageParts.push("--page-image-spec-file", tempPageImageSpecPath);
    }

    // Body images
    if (
      state.images.body_inputs.scope === "newspic-longform" &&
      state.images.body_inputs.status === "ready"
    ) {
      if (!explicitPageImageSpec) {
        for (const img of state.images.body_inputs.received) {
          pageParts.push("--body-image", img.path);
        }
      }
      pageParts.push(
        "--image-layout",
        state.images.body_inputs.layout || newspicRenderSpec.default_image_layout,
      );
    }

    let renderArticleResult: RenderArticleResult;
    try {
      renderArticleResult = runRenderArticleCli(pageParts);
    } catch {
      state.phase.render = { status: "failed", error: "imgx render-article failed" };
      await writeState(statePath, state);
      throw new Error("imgx render-article failed for longform");
    }

    const renderErrors = validateNewspicRenderResult(newspicRenderSpec, renderArticleResult);
    if (renderErrors.length > 0) {
      state.phase.render = { status: "failed", error: renderErrors.join("; ") };
      await writeState(statePath, state);
      throw new Error(`newspic render constraints not satisfied: ${renderErrors.join("; ")}`);
    }

    if (!keepTempFiles) {
      await rm(tempDir, { recursive: true, force: true });
      await rmdir(tempRunDir).catch(() => undefined);
    }

    // Discover generated page files
    const { readdir } = await import("fs/promises");
    const files = await readdir(outputDir);
    const pageFiles = files
      .filter((f) => /^article-\d+\.png$/.test(f))
      .sort();

    for (let i = 0; i < pageFiles.length; i++) {
      renderAssets.push({
        kind: "page",
        route: "wechat-newspic",
        index: i + 1,
        path: join(outputDir, pageFiles[i]),
      });
    }
  }

  // ── Update state ────────────────────────────────────────────────

  state.images.render_assets = renderAssets;
  state.images.plan.status = "rendered";
  state.phase.render = { status: "done", error: null };
  state.phase.current = state.intent.requires.publish ? "publish" : "done";
  state.artifacts.render_version += 1;

  await writeState(statePath, state);

  printResult({
    plan: state.images.plan,
    render_assets: renderAssets,
    render_version: state.artifacts.render_version,
    phase: state.phase.current,
  }, renderRender);
}
