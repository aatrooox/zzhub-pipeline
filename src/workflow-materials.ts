import { access, readFile, readdir } from "fs/promises";
import { join } from "path";

import {
  normalizeNewspicRenderSpec,
  defaultNewspicRenderSpec,
  type BodyInputReceived,
  defaultBodyInputs,
  type RenderAsset,
  type WorkflowState,
} from "./state";
import {
  countParagraphs,
  findIllustrationMarkers,
  stripFrontmatter,
} from "./text";

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function dedupeReceived(received: BodyInputReceived[]): BodyInputReceived[] {
  const map = new Map<string, string>();
  for (const item of received) {
    if (!item.marker?.trim() || !item.path?.trim()) {
      continue;
    }
    map.set(item.marker.trim(), item.path.trim());
  }
  return [...map.entries()].map(([marker, path]) => ({ marker, path }));
}

export async function getPreferredBodyPath(state: WorkflowState): Promise<string | null> {
  if (state.source_body_path && await pathExists(state.source_body_path)) {
    return state.source_body_path;
  }
  if (state.asset_path) {
    const canonicalBodyPath = join(state.asset_path, "post.md");
    if (await pathExists(canonicalBodyPath)) {
      return canonicalBodyPath;
    }
  }
  return null;
}

export async function readBodyContent(state: WorkflowState): Promise<{ path: string | null; content: string | null }> {
  const bodyPath = await getPreferredBodyPath(state);
  if (!bodyPath) {
    return { path: null, content: null };
  }
  return {
    path: bodyPath,
    content: await readFile(bodyPath, "utf-8"),
  };
}

export function collectNewspicRequiredMarkers(
  cleanBody: string,
  state: WorkflowState,
): string[] {
  const spec = normalizeNewspicRenderSpec(state.intent.newspic_render);
  const markers = new Set(findIllustrationMarkers(cleanBody).map((item) => item.trim()));
  for (const pageSpec of spec.page_specs) {
    for (const marker of pageSpec.image_markers) {
      if (marker.trim()) {
        markers.add(marker.trim());
      }
    }
  }
  return [...markers];
}

export function shouldUseNewspicLongform(cleanBody: string, state: WorkflowState): boolean {
  const stats = countParagraphs(cleanBody);
  const autoLong = stats.paragraphs >= 3 || stats.charCount > 150;
  const spec = normalizeNewspicRenderSpec(state.intent.newspic_render);
  return spec.pagination_mode === "multi" || (spec.pagination_mode !== "single" && autoLong);
}

/**
 * Infer and write `state.intent.newspic_render` from body content.
 *
 * Only runs when:
 * 1. The route uses newspic (wechat-newspic primary or extra), AND
 * 2. `state.intent.newspic_render` is currently null (never been set by user or orchestrator).
 *
 * Heuristic:
 * - Short body (paragraphs < 3 AND charCount ≤ 150) → single page
 * - Otherwise → multi page; estimate min_pages = ceil(charCount / 300), capped at 8
 */
export function inferNewspicRenderSpec(cleanBody: string, state: WorkflowState): void {
  // Only infer when route actually uses newspic
  const usesNewspic =
    state.route.primary === "wechat-newspic" || state.route.extras.includes("wechat-newspic");
  if (!usesNewspic) {
    return;
  }

  // Respect explicitly set spec — don't overwrite
  if (state.intent.newspic_render !== null) {
    return;
  }

  const stats = countParagraphs(cleanBody);
  const isShort = stats.paragraphs < 3 && stats.charCount <= 150;

  if (isShort) {
    state.intent.newspic_render = {
      ...defaultNewspicRenderSpec(),
      pagination_mode: "single",
    };
  } else {
    const estimatedPages = Math.min(8, Math.ceil(stats.charCount / 300));
    state.intent.newspic_render = {
      ...defaultNewspicRenderSpec(),
      pagination_mode: "multi",
      min_pages: Math.max(1, estimatedPages),
    };
  }
}

export async function reconcileBodyInputs(state: WorkflowState): Promise<void> {
  const body = await readBodyContent(state);
  if (!body.content) {
    if (state.images.body_inputs.scope !== "none" && state.images.body_inputs.received.length === 0) {
      state.images.body_inputs = defaultBodyInputs();
    }
    return;
  }

  const cleanBody = stripFrontmatter(body.content);
  const previousReceived = dedupeReceived(state.images.body_inputs.received);
  const usesArticleImages =
    state.intent.content_form === "article" ||
    state.route.primary === "wechat-article" ||
    state.route.extras.includes("wechat-article");
  const usesNewspicImages =
    state.intent.content_form === "newspic" ||
    state.route.primary === "wechat-newspic" ||
    state.route.extras.includes("wechat-newspic");

  if (usesArticleImages && !usesNewspicImages) {
    const markers = findIllustrationMarkers(cleanBody);
    const markerSet = new Set(markers);
    const received = previousReceived.filter((item) => markerSet.has(item.marker));
    if (markers.length === 0) {
      state.images.body_inputs = defaultBodyInputs();
      return;
    }
    state.images.body_inputs = {
      scope: "article",
      expected: markers.length,
      received,
      status: received.length >= markers.length ? "ready" : "pending",
      layout: state.images.body_inputs.layout || "staggered",
    };
    return;
  }

  if (usesNewspicImages && shouldUseNewspicLongform(cleanBody, state)) {
    const markers = collectNewspicRequiredMarkers(cleanBody, state);
    const markerSet = new Set(markers);
    const received = previousReceived.filter((item) => markerSet.has(item.marker));
    state.images.body_inputs = {
      scope: markers.length > 0 ? "newspic-longform" : "none",
      expected: markers.length,
      received,
      status:
        markers.length === 0
          ? "none"
          : received.length >= markers.length
            ? "ready"
            : "pending",
      layout:
        state.images.body_inputs.layout ||
        normalizeNewspicRenderSpec(state.intent.newspic_render).default_image_layout,
    };
    return;
  }

  if (state.images.body_inputs.scope !== "none") {
    state.images.body_inputs = defaultBodyInputs();
  }
}

export async function discoverRenderAssets(state: WorkflowState): Promise<RenderAsset[]> {
  if (!state.asset_path) {
    return [];
  }

  const assets: RenderAsset[] = [];
  const needsWechatArticle =
    state.route.primary === "wechat-article" || state.route.extras.includes("wechat-article");
  const needsNewspic =
    state.route.primary === "wechat-newspic" || state.route.extras.includes("wechat-newspic");

  if (needsWechatArticle) {
    const coverPath = join(state.asset_path, "images", "wechat", "cover.png");
    if (await pathExists(coverPath)) {
      assets.push({
        kind: "cover",
        route: "wechat-article",
        path: coverPath,
      });
    }
  }

  if (needsNewspic) {
    const newspicDir = join(state.asset_path, "images", "newspic");
    const coverPath = join(newspicDir, "cover.png");
    if (await pathExists(coverPath)) {
      assets.push({
        kind: "cover",
        route: "wechat-newspic",
        path: coverPath,
      });
    }

    if (await pathExists(newspicDir)) {
      const files = await readdir(newspicDir);
      const pageFiles = files
        .filter((name) => /^article-\d+\.png$/.test(name))
        .sort();
      for (let index = 0; index < pageFiles.length; index += 1) {
        assets.push({
          kind: "page",
          route: "wechat-newspic",
          path: join(newspicDir, pageFiles[index]),
          index: index + 1,
        });
      }
    }
  }

  return assets;
}

export async function reconcileStateArtifacts(state: WorkflowState): Promise<void> {
  // NOTE: This function mutates `state` in memory only — it does NOT write back to disk.
  // It is called on every `status` read to produce a reconciled view.
  // Any caller reading the raw state file directly (bypassing this function) will see
  // stale values for images.body_inputs and images.render_assets.

  // Infer newspic_render spec from body content before reconciling body inputs,
  // so that reconcileBodyInputs can use the inferred spec (e.g. pagination_mode).
  const body = await readBodyContent(state);
  if (body.content) {
    const cleanBody = stripFrontmatter(body.content);
    inferNewspicRenderSpec(cleanBody, state);
  }

  await reconcileBodyInputs(state);

  if (!state.asset_path) {
    return;
  }

  const renderAssets = await discoverRenderAssets(state);
  if (renderAssets.length > 0) {
    state.images.render_assets = renderAssets;
    state.images.plan.status = "rendered";
  } else if (state.images.plan.needed && state.images.plan.status === "rendered") {
    state.images.plan.status = "planned";
    state.images.render_assets = [];
  }
}
