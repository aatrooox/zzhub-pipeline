/**
 * prepare-finalize — Complete the Prepare phase:
 *   1. channel-route 2nd pass: generate highlight_words from final title
 *   2. asset-save: create asset directory, write post.md with frontmatter, write canonical state
 *
 * Called after style (if needed) and format are done.
 * This is the boundary between temp run state and canonical asset state.
 *
 * Usage:
 *   zzhub-pipeline prepare-finalize \
 *     --state /path/to/state.json \
 *     --body /path/to/body_formatted.md \
 *     [--workspace /abs/workspace]
 *
 * Output: asset_path, canonical state_path
 */

import { copyFile, readFile, writeFile, mkdir, rename, rm } from "fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "path";
import { parseArgs, requireArg, optionalArg } from "../args";
import { printResult, renderPrepareFinalize } from "../output";
import {
  loadConfig,
  renderPostsRelativePath,
  resolveWorkspacePaths,
  resolveWorkspaceRoot,
} from "../config";
import {
  acquireStateOperationLock,
  readResolvedState,
  writeState,
  getCanonicalStatePath,
} from "../state";
import {
  extractHighlightWords,
  buildFrontmatter,
  formatArticle,
  stripLeadingTitleHeading,
  removePageMarkers,
} from "../text";

function isExternalAssetRef(value: string): boolean {
  return /^(https?:|data:|blob:|\/\/)/i.test(value);
}

function normalizeSafeRelativeAssetPath(rawPath: string): string | null {
  const normalized = rawPath
    .trim()
    .replace(/^file:\/\//i, "")
    .replaceAll("\\", "/")
    .replace(/^[.]\//, "")
    .replace(/[?#].*$/, "");

  if (
    !normalized ||
    normalized.startsWith("/") ||
    normalized.startsWith("../") ||
    normalized.includes("/../")
  ) {
    return null;
  }

  return normalized;
}

function formatRelativeAssetRef(relativePath: string): string {
  return relativePath.startsWith(".") ? relativePath : `./${relativePath}`;
}

function uniqueRelativeAssetPath(
  targetRelativePath: string,
  sourcePath: string,
  usedTargetPaths: Map<string, string>,
): string {
  const normalizedTarget = targetRelativePath.replaceAll("\\", "/");
  const existingSource = usedTargetPaths.get(normalizedTarget);
  if (!existingSource || existingSource === sourcePath) {
    usedTargetPaths.set(normalizedTarget, sourcePath);
    return normalizedTarget;
  }

  const fileName = basename(normalizedTarget);
  const extensionIndex = fileName.lastIndexOf(".");
  const name = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;
  const ext = extensionIndex > 0 ? fileName.slice(extensionIndex) : "";
  const directory = dirname(normalizedTarget);

  let suffix = 2;
  while (true) {
    const candidateLeaf = `${name}-${suffix}${ext}`;
    const candidate = directory === "."
      ? candidateLeaf
      : join(directory, candidateLeaf).replaceAll("\\", "/");
    const candidateSource = usedTargetPaths.get(candidate);
    if (!candidateSource || candidateSource === sourcePath) {
      usedTargetPaths.set(candidate, sourcePath);
      return candidate;
    }
    suffix += 1;
  }
}

async function materializeInlineAssets(options: {
  body: string;
  bodySourceDir: string;
  assetPath: string;
}): Promise<string> {
  const usedTargetPaths = new Map<string, string>();
  const copyJobs = new Map<string, { sourcePath: string; targetRelativePath: string }>();

  const registerAsset = (rawSource: string): string | null => {
    const trimmed = rawSource.trim();
    if (!trimmed || isExternalAssetRef(trimmed)) {
      return null;
    }

    const sourcePath = trimmed.startsWith("file://")
      ? new URL(trimmed).pathname
      : isAbsolute(trimmed)
        ? trimmed
        : resolve(options.bodySourceDir, trimmed);

    const safeRelativePath = normalizeSafeRelativeAssetPath(trimmed);
    const targetRelativePath = uniqueRelativeAssetPath(
      safeRelativePath ?? join("_inline-assets", basename(sourcePath)).replaceAll("\\", "/"),
      sourcePath,
      usedTargetPaths,
    );

    copyJobs.set(sourcePath, { sourcePath, targetRelativePath });
    return targetRelativePath;
  };

  let rewritten = options.body.replace(
    /!\[([^\]]*)\]\((?:<([^>]+)>|([^\s)]+))(\s+(?:"[^"]*"|'[^']*'))?\)/g,
    (match, alt, angleSrc, bareSrc, titleSuffix) => {
      const targetRelativePath = registerAsset(String(angleSrc ?? bareSrc ?? ""));
      if (!targetRelativePath) {
        return match;
      }
      const rewrittenSource = angleSrc
        ? `<${formatRelativeAssetRef(targetRelativePath)}>`
        : formatRelativeAssetRef(targetRelativePath);
      return `![${alt}](${rewrittenSource}${titleSuffix ?? ""})`;
    },
  );

  rewritten = rewritten.replace(
    /(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi,
    (match, prefix, src, suffix) => {
      const targetRelativePath = registerAsset(String(src ?? ""));
      if (!targetRelativePath) {
        return match;
      }
      return `${prefix}${formatRelativeAssetRef(targetRelativePath)}${suffix}`;
    },
  );

  for (const job of copyJobs.values()) {
    const destinationPath = join(options.assetPath, job.targetRelativePath);
    await mkdir(dirname(destinationPath), { recursive: true });
    await copyFile(job.sourcePath, destinationPath);
  }

  return rewritten;
}

function appendSuffixToRelativePath(relativePath: string, suffix: number): string {
  const normalized = relativePath.replace(/\\/g, "/");
  const parent = dirname(normalized);
  const leaf = normalized.split("/").filter(Boolean).pop() || "untitled";
  const suffixedLeaf = `${leaf}-v${suffix}`;
  return parent === "." ? suffixedLeaf : join(parent, suffixedLeaf);
}

export async function prepareFinalize(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline prepare-finalize [options]

Options:
  --state          Path to state JSON (required)
  --body           Path to body text file (optional; defaults to state.formatted_body_path)
  --workspace      Workspace root (optional; defaults to state.workspace_root)
`.trim());
    return;
  }

  const requestedStatePath = requireArg(parsed, "state", "state JSON path");
  const explicitBodyPath = optionalArg(parsed, "body");
  const workspaceOverride = optionalArg(parsed, "workspace");

  const initialResolved = await readResolvedState(requestedStatePath);
  const releaseOperationLock = await acquireStateOperationLock(initialResolved.path);
  try {
  const resolved = await readResolvedState(initialResolved.path);
  const statePath = resolved.path;
  const state = resolved.state;
  if (state.content_review.status !== "passed") {
    throw new Error(
      `content_review must be passed before prepare-finalize (current: ${state.content_review.status})`,
    );
  }
  const bodyPath = explicitBodyPath ?? state.formatted_body_path;
  if (!bodyPath) {
    throw new Error(
      "Missing required argument: --body (body text file path). Run prepare first or pass --body explicitly.",
    );
  }
  let body = await readFile(bodyPath, "utf-8");

  // If style was applied but format wasn't re-applied, apply format now
  // (format is idempotent, safe to re-apply)
  body = formatArticle(body);
  body = stripLeadingTitleHeading(body, state.metadata.title);

  const config = loadConfig();
  const workspace = resolveWorkspaceRoot(workspaceOverride ?? state.workspace_root, config);
  const workspacePaths = resolveWorkspacePaths(workspace, config);
  state.workspace_root = workspace;

  const missingMetadata = [
    ["metadata.title", state.metadata.title],
    ["metadata.slug", state.metadata.slug],
    ["metadata.date", state.metadata.date],
  ].filter(([, value]) => !value);
  if (missingMetadata.length > 0) {
    throw new Error(
      `prepare-finalize requires complete metadata: ${missingMetadata.map(([field]) => field).join(", ")}`,
    );
  }

  // ── Step 1: Channel route 2nd pass — highlight_words ──
  // If highlight_words were already set explicitly via `prepare --highlight-words`,
  // respect that and skip the auto-extract algorithm.
  const highlightWords =
    state.route.highlight_words && state.route.highlight_words.length > 0
      ? state.route.highlight_words
      : extractHighlightWords(state.metadata.title);
  state.route.highlight_words = highlightWords;

  // ── Step 2: Asset save ──

  // Build asset path from configured posts pattern.
  let assetPath = state.asset_path;
  if (!assetPath) {
    const patternUsesSlug = config.paths.postsPathPattern.includes("{slug}");
    const patternUsesTitle = config.paths.postsPathPattern.includes("{title}");
    const baseSlug = state.metadata.slug;
    const baseTitle = state.metadata.title;
    let nextSlug = baseSlug;
    let nextTitle = baseTitle;
    const baseRelativePath = renderPostsRelativePath(config, {
      date: state.metadata.date,
      slug: nextSlug,
      title: nextTitle,
    });
    let suffix = 1;

    while (true) {
      if (suffix > 1 && patternUsesSlug) {
        nextSlug = `${baseSlug}-v${suffix}`;
      } else if (suffix > 1 && patternUsesTitle) {
        nextTitle = `${baseTitle}-v${suffix}`;
      }
      const relativePath = suffix === 1
        ? baseRelativePath
        : patternUsesSlug || patternUsesTitle
          ? renderPostsRelativePath(config, {
              date: state.metadata.date,
              slug: nextSlug,
              title: nextTitle,
            })
          : appendSuffixToRelativePath(baseRelativePath, suffix);
      const candidatePath = join(workspacePaths.postsRoot, relativePath);
      await mkdir(dirname(candidatePath), { recursive: true });
      try {
        await mkdir(candidatePath);
        assetPath = candidatePath;
        break;
      } catch (error) {
        const code = error instanceof Error && "code" in error
          ? String((error as NodeJS.ErrnoException).code)
          : "";
        if (code !== "EEXIST") {
          throw error;
        }
        suffix += 1;
      }
    }

    if (patternUsesSlug && nextSlug !== state.metadata.slug) {
      state.metadata.slug = nextSlug;
    }
  } else {
    await mkdir(assetPath, { recursive: true });
  }

  const bodySourceDir = dirname(state.source_body_path ?? bodyPath);
  body = await materializeInlineAssets({
    body,
    bodySourceDir,
    assetPath,
  });

  // Create image directories based on route
  if (
    state.route.primary === "wechat-article" ||
    state.route.extras.includes("wechat-article")
  ) {
    await mkdir(join(assetPath, "images", "wechat"), { recursive: true });
  }
  if (
    state.route.primary === "wechat-newspic" ||
    state.route.extras.includes("wechat-newspic")
  ) {
    await mkdir(join(assetPath, "images", "newspic"), { recursive: true });
  }

  // Build frontmatter
  const frontmatter = buildFrontmatter({
    title: state.metadata.title,
    date: state.metadata.date,
    platform: state.route.primary,
    description: state.metadata.description,
    tags: state.metadata.tags,
  });

  // Write post.md
  const postContent = `${frontmatter}\n\n${removePageMarkers(body)}`;
  const postPath = join(assetPath, "post.md");
  const postTempPath = `${postPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    await writeFile(postTempPath, postContent, "utf-8");
    await rename(postTempPath, postPath);
  } catch (error) {
    await rm(postTempPath, { force: true }).catch(() => undefined);
    throw error;
  }

  // Update state
  state.asset_path = assetPath;
  state.state_path = getCanonicalStatePath(assetPath);

  // Phase transitions
  state.phase.prepare = { status: "done", error: null };
  state.phase.current = state.intent.requires.render ? "render" : 
                         state.intent.requires.publish ? "publish" : "done";
  state.mode = state.phase.current === "done" ? "done" : "active";
  
  // Clear redo_hint — prepare sub-sequence is complete
  state.redo_hint = null;

  // Bump content version
  state.artifacts.content_version += 1;

  // Write canonical state
  await writeState(state.state_path, state);

  // Also update the temp run state to point to canonical
  if (resolve(statePath) !== resolve(state.state_path)) {
    await writeState(statePath, state);
  }

  // Output summary
  const output = {
    asset_path: assetPath,
    state_path: state.state_path,
    post_path: postPath,
    highlight_words: highlightWords,
    phase: state.phase.current,
    content_version: state.artifacts.content_version,
  };
  printResult(output, renderPrepareFinalize);
  } finally {
    await releaseOperationLock();
  }
}
