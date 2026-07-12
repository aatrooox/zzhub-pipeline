import { access, readFile, readdir } from "fs/promises";
import { join } from "path";

import {
  normalizeNewspicRenderSpec,
  type BodyInputReceived,
  defaultBodyInputs,
  type RenderAsset,
  type WorkflowState,
} from "./state";
import {
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

export function shouldUseNewspicLongform(state: WorkflowState): boolean {
  const spec = normalizeNewspicRenderSpec(state.intent.newspic_render);
  return spec.pagination_mode === "multi";
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
    const markers = [...new Set(findIllustrationMarkers(cleanBody))];
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

  if (usesNewspicImages && shouldUseNewspicLongform(state)) {
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
        .flatMap((name) => {
          const match = name.match(/^article-(\d+)\.png$/);
          return match ? [{ name, index: Number.parseInt(match[1], 10) }] : [];
        })
        .sort((a, b) => a.index - b.index);
      for (const pageFile of pageFiles) {
        assets.push({
          kind: "page",
          route: "wechat-newspic",
          path: join(newspicDir, pageFile.name),
          index: pageFile.index,
        });
      }
    }
  }

  return assets;
}

function hasRequiredRenderAssets(
  state: WorkflowState,
  renderAssets: RenderAsset[],
): boolean {
  const publishRoutes = state.publish_targets.length > 0
    ? state.publish_targets.map((target) => target.route)
    : [state.route.primary, ...state.route.extras];
  const hasArticleCover = !publishRoutes.includes("wechat-article") || renderAssets.some(
    (asset) => asset.route === "wechat-article" && asset.kind === "cover",
  );
  const hasNewspicAssets = !publishRoutes.includes("wechat-newspic") || renderAssets.some(
    (asset) =>
      asset.route === "wechat-newspic" &&
      (!shouldUseNewspicLongform(state) || asset.kind === "page"),
  );
  return renderAssets.length > 0 && hasArticleCover && hasNewspicAssets;
}

export async function reconcileStateArtifacts(state: WorkflowState): Promise<void> {
  // NOTE: This function mutates `state` in memory only — it does NOT write back to disk.
  // It is called on every `status` read to produce a reconciled view.
  // Any caller reading the raw state file directly (bypassing this function) will see
  // stale values for images.body_inputs and images.render_assets.

  await reconcileBodyInputs(state);

  if (!state.asset_path) {
    return;
  }
  if (state.phase.current === "prepare" || state.phase.prepare.status !== "done") {
    return;
  }

  const recordedAssets = state.images.render_assets;
  if (
    state.phase.render.status === "done" &&
    hasRequiredRenderAssets(state, recordedAssets) &&
    (await Promise.all(recordedAssets.map((asset) => pathExists(asset.path)))).every(Boolean)
  ) {
    state.images.plan.status = "rendered";
    return;
  }

  const renderAssets = await discoverRenderAssets(state);
  if (hasRequiredRenderAssets(state, renderAssets)) {
    state.images.render_assets = renderAssets;
    state.images.plan.status = "rendered";
  } else if (state.images.plan.needed && state.images.plan.status === "rendered") {
    state.images.plan.status = "planned";
    state.images.render_assets = [];
  }
}
