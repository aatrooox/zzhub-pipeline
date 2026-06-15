/**
 * prepare — Execute deterministic Prepare phase steps:
 *   1. channel-route (1st pass): route.primary, extras, account, content_profile, visual_params
 *   2. authoring decision: rewrite_allowed, style_mode
 *   3. format: apply text formatting rules to body
 *   4. asset-meta: title, slug, date, description, tags
 *
 * Style step is NOT included — it requires LLM and stays as a skill.
 * This command reads the run state, applies deterministic transforms,
 * and writes back the updated state.
 *
 * Usage:
 *   zzhub-pipeline prepare \
 *     --state /path/to/state.json \
 *     [--body /path/to/body_raw.md] \
 *     [--title "Custom title"] \
 *     [--intent-text "发公众号文章"] \
 *     [--account default] \
 *     [--route wechat-article] \
 *     [--extras blog] \
 *     [--style-request]
 *
 * Output: Updated state JSON. body_formatted is written to a managed temp file
 *         unless --body-out is explicitly provided.
 */

import { copyFile, mkdir, readFile, writeFile } from "fs/promises";
import { extname, join, resolve } from "path";
import { parseArgs, requireArg, optionalArg, flagArg } from "../args";
import { printResult, renderPrepare } from "../output";
import { resolveWorkspacePaths } from "../config";
import {
  defaultBodyInputs,
  readState,
  writeState,
} from "../state";
import { resolveFullRoute } from "../routes";
import { resolveAuthoring, hasStyleRequest } from "../profiles";
import {
  formatArticle,
  generateSlug,
  todayDate,
  extractDescription,
  findIllustrationMarkers,
  stripFrontmatter,
} from "../text";
import type { RoutePrimary } from "../state";

async function stageManagedBodyFile(
  workspaceRoot: string,
  runId: string,
  sourcePath: string,
): Promise<string> {
  const tempRoot = resolveWorkspacePaths(workspaceRoot).tempRoot;
  const extension = extname(sourcePath) || ".md";
  const managedDir = join(tempRoot, runId);
  const managedPath = join(managedDir, `source-body${extension}`);
  await mkdir(managedDir, { recursive: true });
  if (resolve(sourcePath) !== resolve(managedPath)) {
    await copyFile(sourcePath, managedPath);
  }
  return managedPath;
}

function getManagedFormattedBodyPath(workspaceRoot: string, runId: string): string {
  return join(resolveWorkspacePaths(workspaceRoot).tempRoot, runId, "formatted-body.md");
}

function shouldPreserveExistingRoute(params: {
  intentText: string;
  routeOverride?: RoutePrimary;
  extrasRaw?: string;
  accountOverride?: string;
  assetPath: string;
}): boolean {
  return (
    Boolean(params.assetPath) &&
    !params.intentText.trim() &&
    !params.routeOverride &&
    !params.extrasRaw &&
    !params.accountOverride
  );
}

export async function prepare(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline prepare [options]

Options:
  --state          Path to state JSON (required)
  --body           Path to body text file (body_raw or body_styled) (optional if body already attached)
  --title          Override title (optional; defaults to first heading or first line)
  --intent-text    Original user intent text for route resolution (optional)
  --account        Override account (optional)
  --route          Override primary route (optional)
  --extras         Comma-separated extra routes (optional)
  --style-request  Flag: user requested style processing
  --body-out       Path to write formatted body (optional; defaults to managed temp path)
  --suggested-title  Suggested title from writer (optional)
  --suggested-slug   Suggested slug from writer (optional; English + hyphens, ≤50 chars; overrides auto-generated slug)
  --highlight-words  Comma-separated highlight words for cover (optional; overrides auto-extract in prepare-finalize)
`.trim());
    return;
  }

  const statePath = requireArg(parsed, "state", "state JSON path");
  const bodyPath = optionalArg(parsed, "body");
  const titleOverride = optionalArg(parsed, "title");
  const accountOverride = optionalArg(parsed, "account");
  const routeOverride = optionalArg(parsed, "route") as RoutePrimary | undefined;
  const extrasRaw = optionalArg(parsed, "extras");
  const isStyleRequest = flagArg(parsed, "style-request");
  const bodyOutPath = optionalArg(parsed, "body-out");
  const suggestedTitle = optionalArg(parsed, "suggested-title");
  const suggestedSlug = optionalArg(parsed, "suggested-slug");
  const highlightWordsRaw = optionalArg(parsed, "highlight-words");
  const highlightWordsOverride = highlightWordsRaw
    ? highlightWordsRaw.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  const extras = extrasRaw
    ? (extrasRaw.split(",").map((s) => s.trim()) as RoutePrimary[])
    : undefined;

  // Read state and body
  const state = await readState(statePath);
  const intentText = optionalArg(parsed, "intent-text") ?? state.intent.intent_text ?? "";
  const resolvedBodyPath = bodyPath
    ? await stageManagedBodyFile(state.workspace_root, state.run_id, bodyPath)
    : state.source_body_path;
  if (!resolvedBodyPath) {
    throw new Error("No body is attached yet. Use attach-body first or pass --body.");
  }
  const bodyRaw = await readFile(resolvedBodyPath, "utf-8");
  const cleanBody = stripFrontmatter(bodyRaw);
  state.source_body_path = resolvedBodyPath;
  state.intent.intent_text = intentText || state.intent.intent_text;

  // ── Step 1: Channel route (1st pass) ──
  const route = shouldPreserveExistingRoute({
    intentText,
    routeOverride,
    extrasRaw,
    accountOverride,
    assetPath: state.asset_path,
  })
    ? state.route
    : resolveFullRoute(intentText, {
        primary: routeOverride,
        extras,
        account: accountOverride ?? state.route?.account || undefined,
        contentForm: state.intent.content_form,
        targets: state.intent.targets,
      });

  state.route = route;

  // If caller provided explicit highlight words, store them now so prepare-finalize
  // can skip the auto-extract algorithm.
  if (highlightWordsOverride && highlightWordsOverride.length > 0) {
    state.route.highlight_words = highlightWordsOverride;
  }

  // Re-derive requires.render and requires.publish based on resolved route.
  // requires.research is intentional (set at init from user request), not touched here.
  // Same for render/publish: if the orchestrator set them at init, keep that value.
  // wechat-article always needs render regardless.
  state.intent.requires.render =
    state.intent.requires.render ||
    route.primary === "wechat-article";
  state.intent.requires.publish =
    state.intent.requires.publish ||
    state.intent.task_kind === "publish";

  // ── Step 2: Author select ──
  const styleRequest =
    isStyleRequest || hasStyleRequest(intentText);

  const authoring = resolveAuthoring({
    contentOrigin: state.intent.content_origin,
    styleHint: state.intent.style_hint,
    hasStyleRequest: styleRequest,
  });

  state.authoring = authoring;

  // Update requires.style based on authoring result
  state.intent.requires.style =
    authoring.rewrite_allowed && authoring.style_mode !== "none";

  // ── Step 3: Format ──
  // In the current workflow, Writer/Style already own the LLM rewrite.
  // Prepare records the authoring snapshot, then always formats the final body.
  const bodyFormatted = formatArticle(cleanBody);

  // ── Step 4: Asset meta ──
  // Determine title
  let title = titleOverride ?? suggestedTitle ?? state.metadata.title.trim();
  if (!title) {
    // Extract from body: first heading or first line
    const lines = cleanBody.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const headingMatch = trimmed.match(/^#{1,6}\s+(.+)/);
      if (headingMatch) {
        title = headingMatch[1].trim();
        break;
      }
      // Use first non-empty line
      title = trimmed;
      break;
    }
  }

  // Prefer editor-supplied slug; sanitize it defensively, then fall back to auto-generate
  const slug = suggestedSlug
    ? suggestedSlug
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 80) || generateSlug(title)
    : generateSlug(title);
  const date = todayDate();

  // Description: required for wechat-article, optional otherwise
  let description: string | null = null;
  if (route.primary === "wechat-article") {
    description = extractDescription(bodyFormatted);
  }

  // Tags: required for blog (can be empty list)
  const tags: string[] = [];

  state.metadata = {
    title,
    slug,
    date,
    description,
    tags,
  };

  // ── Scan for illustration markers (for article body_inputs) ──
  const needsArticleInputs =
    route.primary === "wechat-article" ||
    route.extras.includes("wechat-article");
  const keepsNewspicInputs =
    route.primary === "wechat-newspic" ||
    route.extras.includes("wechat-newspic");

  if (needsArticleInputs) {
    const markers = findIllustrationMarkers(cleanBody);
    if (markers.length > 0) {
      const previousInputs =
        state.images.body_inputs.scope === "article"
          ? state.images.body_inputs
          : null;
      const markerSet = new Set(markers);
      const received = previousInputs
        ? previousInputs.received.filter((item) => markerSet.has(item.marker))
        : [];
      state.images.body_inputs = {
        scope: "article",
        expected: markers.length,
        received,
        status:
          received.length >= markers.length
            ? "ready"
            : "pending",
        layout: previousInputs?.layout ?? "staggered",
      };
    } else {
      state.images.body_inputs = defaultBodyInputs();
    }
  } else if (!keepsNewspicInputs || state.images.body_inputs.scope === "article") {
    state.images.body_inputs = defaultBodyInputs();
  }

  // ── Write state ──
  state.formatted_body_path =
    bodyOutPath ?? getManagedFormattedBodyPath(state.workspace_root, state.run_id);
  await writeState(statePath, state);

  // ── Output formatted body ──
  const formattedBodyPath = state.formatted_body_path;
  await mkdir(join(resolveWorkspacePaths(state.workspace_root).tempRoot, state.run_id), { recursive: true });
  await writeFile(formattedBodyPath, bodyFormatted, "utf-8");

  // Output summary for orchestrator
  const illustrationMarkers = findIllustrationMarkers(cleanBody);
  const output = {
    state_path: statePath,
    route: {
      primary: state.route.primary,
      account: state.route.account,
    },
    metadata: {
      title: state.metadata.title,
      slug: state.metadata.slug,
      date: state.metadata.date,
    },
    requires_style: state.intent.requires.style,
    body_formatted_path: formattedBodyPath,
    ...(illustrationMarkers.length > 0 ? { illustration_markers: illustrationMarkers } : {}),
  };
  printResult(output, renderPrepare);
}
