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

import { access, readFile } from "fs/promises";
import { dirname, isAbsolute, join, resolve } from "path";
import { StudioRenderSchema } from "../schema/state";

import { parseArgs, requireArg, flagArg } from "../args";
import { printResult, renderRender } from "../output";
import { loadConfig } from "../config";
import { resolveRenderBranding } from "../render-branding";
import { resolveCoverTheme } from "../schema/cover-theme";
import { resolveImageRenderer } from "../adapter-loader";
import { validateNewspicRenderResult } from "../adapters/validate-newspic-render";
import {
  acquireStateOperationLock,
  defaultBodyInputs,
  normalizeNewspicRenderSpec,
  readResolvedState,
  reenterRender,
  validateForPhase,
  writeState,
  type NewspicRenderSpec,
  type WorkflowState,
} from "../state";
import { loadTaskState } from "../task-manager";
import {
  stripFrontmatter,
  generateCoverTitle,
} from "../text";
import { getLongformTheme } from "../routes";
import { collectNewspicRequiredMarkers } from "../workflow-materials";
import type { CommandOutcome } from "../command-outcome";
import { reportProgress } from "../monitor/recorder";
import { copyRenderedCover } from "../rendered-cover";

function getNewspicRenderSpec(state: WorkflowState): NewspicRenderSpec {
  const spec = normalizeNewspicRenderSpec(state.intent.newspic_render);
  return {
    ...spec,
    min_pages: Math.max(spec.min_pages, spec.pagination_mode === "multi" ? 2 : 1),
  };
}

export async function render(args: string[]): Promise<void | CommandOutcome> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline render [options]

Options:
  --state        Path to state JSON (required)
  --skip-render  Plan only, don't invoke renderer (optional)
  --cover-theme  Cover theme ID; saves the task choice (optional)
  --studio-cover-template  Studio cover template ID/name; empty resets to slot default
  --studio-content-template  Studio content template ID/name; empty resets to slot default
  --template-images-file  JSON with cover/content asset-key -> image reference mappings
`.trim());
    return;
  }

  const requestedStatePath = requireArg(parsed, "state", "state JSON path");
  const skipRender = flagArg(parsed, "skip-render");

  const initialResolved = await readResolvedState(requestedStatePath);
  const releaseOperationLock = await acquireStateOperationLock(initialResolved.path);
  try {
  const resolved = await loadTaskState(initialResolved.path);
  const statePath = resolved.path;
  const state = resolved.state;

  // Validate prerequisites
  const validationErrors = validateForPhase(state, "render");
  if (validationErrors.length > 0) {
    throw new Error(
      `Render validation failed: ${validationErrors.map((item) => `${item.field}: ${item.message}`).join("; ")}`,
    );
  }

  const postPath = join(state.asset_path, "post.md");
  const postContent = await readFile(postPath, "utf-8");
  const cleanBody = stripFrontmatter(postContent);

  // ── Image Plan ──────────────────────────────────────────────────

  const routePrimary = state.route.primary;
  const config = loadConfig();
  const requestedTheme = parsed["cover-theme"] === undefined ? undefined : requireArg(parsed, "cover-theme", "cover theme ID").trim();
  const coverTheme = routePrimary === "blog" ? undefined : resolveCoverTheme(
    config.render.cover,
    routePrimary === "wechat-article" ? "wechat-cover-split" : "poster-3-4",
    state.route.account,
    requestedTheme ?? state.intent.cover_theme,
  );
  if (requestedTheme !== undefined && requestedTheme !== state.intent.cover_theme) {
    if (!coverTheme) throw new Error("blog 路由不需要封面主题");
    state.intent.cover_theme = requestedTheme;
    reenterRender(state);
    await writeState(statePath, state);
  }

  // 任务级模板替换独立于正文配图，空映射文件用于清除覆盖。
  const studioRender = structuredClone(state.intent.studio_render || {});
  for (const [flag, kind] of [["studio-cover-template", "cover"], ["studio-content-template", "content"]] as const) {
    if (parsed[flag] === undefined) continue;
    const selected = requireArg(parsed, flag, "Studio template ID/name").trim();
    studioRender.templates ||= {};
    if (selected) studioRender.templates[kind] = selected;
    else delete studioRender.templates[kind];
  }
  if (parsed["template-images-file"] !== undefined) {
    const mappingPath = resolve(requireArg(parsed, "template-images-file", "template image mapping JSON"));
    const raw: unknown = JSON.parse(await readFile(mappingPath, "utf8"));
    const mappings = StudioRenderSchema.shape.image_overrides.unwrap().parse(raw);
    for (const mapping of Object.values(mappings)) {
      for (const [key, src] of Object.entries(mapping || {})) {
        if (!/^(https?:|data:)/i.test(src) && !isAbsolute(src)) mapping![key] = resolve(dirname(mappingPath), src);
      }
    }
    studioRender.image_overrides = mappings;
  }
  const validatedStudioRender = StudioRenderSchema.parse(studioRender);
  if (JSON.stringify(validatedStudioRender) !== JSON.stringify(state.intent.studio_render || {})) {
    state.intent.studio_render = validatedStudioRender;
    reenterRender(state);
    await writeState(statePath, state);
  }

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
    state.mode = state.phase.current === "done" ? "done" : "active";
    state.redo_hint = null;
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
    const isLong = newspicRenderSpec.pagination_mode === "multi";

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
    cover_theme: coverTheme?.id ?? null,
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
      return { status: "waiting" };
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
    return { status: "skipped" };
  }

  // ── Invoke image renderer adapter ───────────────────────────────

  try {
  const renderedCover = process.env.ZZHUB_PIPELINE_RENDERED_COVER;
  if (renderedCover) {
    if (process.env.ZZHUB_PIPELINE_ARTICLE_SNAPSHOT !== "1" || routePrimary !== "wechat-article") throw new Error("Rendered covers require a frozen article preview");
    state.images.render_assets = [await copyRenderedCover(renderedCover, state.workspace_root, outputDir, state.metadata.title)];
  } else {
  const imageRenderer = await resolveImageRenderer(config);
  if (process.env.ZZHUB_PIPELINE_COVER_SNAPSHOT === "1" && imageRenderer.name !== "typeset-studio") {
    throw new Error("Cover snapshot requires the Typeset Studio image renderer");
  }
  reportProgress({ stage: "render.adapter", message: "开始生成图片" });

  const bodyImages = (
    state.images.body_inputs.scope === "newspic-longform" &&
    state.images.body_inputs.status === "ready"
  )
    ? state.images.body_inputs.received
    : [];

  const branding = resolveRenderBranding(config, state.route.account);
  const renderResult = await imageRenderer.render({
    coverTheme,
    studioTemplates: state.intent.studio_render?.templates,
    templateImageOverrides: state.intent.studio_render?.image_overrides,
    onProgress: reportProgress,
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
    accountVisualParams: {
      footer: branding.footerText,
      bg: state.route.account_visual_params?.bg,
      highlight: state.route.account_visual_params?.highlight,
      fallbackIcon: branding.logo,
    },
    theme: routePrimary === "wechat-newspic" ? getLongformTheme(state.route.account) : undefined,
    template,
  });
  const routeAssets = renderResult.assets.filter(
    (asset) => asset.route === routePrimary && asset.path.trim().length > 0,
  );
  if (routeAssets.length === 0) {
    throw new Error(
      `Image renderer '${imageRenderer.name}' returned no assets for ${routePrimary}`,
    );
  }
  if (routePrimary === "wechat-newspic" && newspicRenderSpec.pagination_mode === "multi") {
    const errors = validateNewspicRenderResult(newspicRenderSpec, renderResult);
    const pageAssets = routeAssets.filter(asset => asset.kind === "page");
    if (pageAssets.length !== renderResult.pageCount ||
        renderResult.pages.some(page => !pageAssets.some(asset => asset.index === page.page))) {
      errors.push("newspic render page assets do not match page summaries");
    }
    if (errors.length > 0) throw new Error(`newspic render constraints not satisfied: ${errors.join("; ")}`);
  }
  if (
    routePrimary === "wechat-article" &&
    !routeAssets.some((asset) => asset.kind === "cover")
  ) {
    throw new Error(
      `Image renderer '${imageRenderer.name}' did not return a WeChat article cover`,
    );
  }
  for (const asset of routeAssets) {
    await access(asset.path).catch(() => {
      throw new Error(
        `Image renderer '${imageRenderer.name}' returned a missing asset: ${asset.path}`,
      );
    });
  }
  state.images.render_assets = routeAssets;
  }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    state.phase.render = { status: "failed", error: message };
    state.phase.current = "render";
    state.mode = "failed";
    await writeState(statePath, state);
    const failure = error instanceof Error ? error : new Error(message);
    failure.message += `\n渲染未完成，未发布；任务已停止。修复后执行 zzp reset --state "${statePath}" --mode render 再重试。`;
    throw failure;
  }

  // ── Update state ────────────────────────────────────────────────

  state.images.plan.status = "rendered";
  state.phase.render = { status: "done", error: null };
  state.phase.current = state.intent.requires.publish ? "publish" : "done";
  state.mode = state.phase.current === "done" ? "done" : "active";
  state.redo_hint = null;
  state.artifacts.render_version += 1;

  await writeState(statePath, state);

  printResult({
    plan: state.images.plan,
    render_assets: state.images.render_assets,
    render_version: state.artifacts.render_version,
    phase: state.phase.current,
  }, renderRender);
  } finally {
    await releaseOperationLock();
  }
}
