/**
 * render — Execute Render phase: image-plan + adapter-based rendering.
 *
 * 1. Reads state + post.md
 * 2. Runs image-plan logic (template selection, cover_title, output_dir)
 * 3. Invokes image renderer adapter (pluggable via config.plugins)
 * 4. Records render_assets and bumps render_version
 *
 * Usage:
 *   zzhub-pipeline render \
 *     --state /path/to/state.json \
 *     [--skip-render]  (plan only, don't invoke renderer)
 *
 * Output: Updated state with images.plan, images.render_assets
 */

import { readFile } from "fs/promises";
import { join } from "path";

import { parseArgs, requireArg, flagArg } from "../args";
import { printResult, renderRender } from "../output";
import { loadConfig } from "../config";
import { resolveImageRenderer } from "../adapter-loader";
import {
  defaultBodyInputs,
  normalizeNewspicRenderSpec,
  readState,
  writeState,
  type NewspicRenderSpec,
} from "../state";
import {
  stripFrontmatter,
  countParagraphs,
  generateCoverTitle,
} from "../text";
import { getLongformTheme } from "../routes";
import { collectNewspicRequiredMarkers } from "../workflow-materials";

function getNewspicRenderSpec(state: Awaited<ReturnType<typeof readState>>): NewspicRenderSpec {
  const spec = normalizeNewspicRenderSpec(state.intent.newspic_render);
  return {
    ...spec,
    min_pages: Math.max(spec.min_pages, spec.pagination_mode === "multi" ? 2 : 1),
  };
}

export async function render(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline render [options]

Options:
  --state        Path to state JSON (required)
  --skip-render  Plan only, don't invoke renderer (optional)
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

  // ── Invoke image renderer adapter ───────────────────────────────

  const config = loadConfig();
  const imageRenderer = await resolveImageRenderer(config);

  const bodyImages = (
    state.images.body_inputs.scope === "newspic-longform" &&
    state.images.body_inputs.status === "ready"
  )
    ? state.images.body_inputs.received
    : [];

  const renderResult = await imageRenderer.render({
    state,
    bodyText: cleanBody,
    outputDir,
    title: state.metadata.title,
    route: routePrimary,
    pageSpecs: newspicRenderSpec.page_specs.map((ps) => ({
      page: ps.page,
      imageMarkers: ps.image_markers,
      imageLayout: ps.image_layout ?? undefined,
      targetFillRatio: ps.target_fill_ratio ?? undefined,
      note: ps.note ?? undefined,
    })),
    bodyImages,
    minPages: newspicRenderSpec.min_pages,
    maxPages: newspicRenderSpec.max_pages,
    accountVisualParams: state.route.account_visual_params
      ? {
          footer: state.route.account_visual_params.footer,
          bg: state.route.account_visual_params.bg,
          highlight: state.route.account_visual_params.highlight,
          fallbackIcon: state.route.account_visual_params.fallback_icon,
        }
      : undefined,
    theme: routePrimary === "wechat-newspic" ? getLongformTheme(state.route.account) : undefined,
    template,
  });

  // ── Update state ────────────────────────────────────────────────

  state.images.render_assets = renderResult.assets;
  state.images.plan.status = "rendered";
  state.phase.render = { status: "done", error: null };
  state.phase.current = state.intent.requires.publish ? "publish" : "done";
  state.artifacts.render_version += 1;

  await writeState(statePath, state);

  printResult({
    plan: state.images.plan,
    render_assets: renderResult.assets,
    render_version: state.artifacts.render_version,
    phase: state.phase.current,
  }, renderRender);
}
