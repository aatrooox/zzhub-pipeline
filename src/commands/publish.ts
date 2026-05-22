/**
 * publish — Execute publish routes.
 *
 * Reads state, determines which routes to publish, executes publish commands,
 * records results. Supports idempotent skipping based on version matching.
 *
 * Usage:
 *   zzhub-pipeline publish \
 *     --state /path/to/state.json \
 *     [--route wechat-article] (override: only publish this route)
 *     [--dry-run]
 *
 * Output: Updated state with publish.results
 */

import { parseArgs, requireArg, optionalArg, flagArg } from "../args";
import { printResult, renderPublish } from "../output";
import { loadConfig, resolveWorkspacePaths } from "../config";
import { getPublishProvider } from "../providers";
import {
  readState,
  validateForPhase,
  writeState,
  type PublishResult,
  type RoutePrimary,
} from "../state";

export async function publish(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline publish [options]

Options:
  --state      Path to state JSON (required)
  --route      Only publish this route (optional; default: all routes)
  --dry-run    Print commands without executing (optional)
`.trim());
    return;
  }

  const statePath = requireArg(parsed, "state", "state JSON path");
  const routeOverride = optionalArg(parsed, "route") as RoutePrimary | undefined;
  const dryRun = flagArg(parsed, "dry-run");

  const state = await readState(statePath);
  const config = loadConfig();
  const workspacePaths = resolveWorkspacePaths(state.workspace_root, config);
  const validationErrors = validateForPhase(state, "publish");

  if (!state.asset_path) {
    throw new Error("asset_path not set. Cannot publish.");
  }
  if (validationErrors.length > 0) {
    throw new Error(
      `Publish validation failed: ${validationErrors.map((item) => `${item.field}: ${item.message}`).join("; ")}`,
    );
  }

  // Collect all routes to publish
  const routes: RoutePrimary[] = routeOverride
    ? [routeOverride]
    : [state.route.primary, ...state.route.extras];

  const results: PublishResult[] = [...state.publish.results];
  let hasUnfinishedPublish = false;

  for (const route of routes) {
    // ── Idempotency check ──
    const existing = results.find((r) => r.route === route);
    if (
      existing &&
      existing.status === "success" &&
      existing.content_version === state.artifacts.content_version &&
      existing.render_version === state.artifacts.render_version
    ) {
      console.error(`[publish] Skipping ${route}: already published at current version`);
      continue;
    }

    try {
      const provider = getPublishProvider(route);
      const result = await provider({
        state,
        dryRun,
        config,
        workspacePaths,
      });

      // Upsert result
      const idx = results.findIndex((r) => r.route === route);
      if (idx >= 0) {
        results[idx] = result;
      } else {
        results.push(result);
      }

      if (result.status !== "success" && result.status !== "skipped") {
        hasUnfinishedPublish = true;
      }
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const failResult: PublishResult = {
        route,
        status: "failed",
        detail,
        published_at: null,
        content_version: state.artifacts.content_version,
        render_version: state.artifacts.render_version,
      };
      const idx = results.findIndex((r) => r.route === route);
      if (idx >= 0) {
        results[idx] = failResult;
      } else {
        results.push(failResult);
      }
      hasUnfinishedPublish = true;
    }
  }

  // Update state
  state.publish.results = results;

  const allDone = routes.every((route) => {
    const r = results.find((x) => x.route === route);
    return r && (r.status === "success" || r.status === "skipped");
  });

  if (allDone) {
    state.mode = "done";
    state.phase.publish = { status: "done", error: null };
    state.phase.current = "done";
  } else if (hasUnfinishedPublish) {
    state.mode = "active";
    state.phase.publish = { status: "pending", error: null };
    state.phase.current = "publish";
  }

  await writeState(statePath, state);

  printResult({
    publish_results: results,
    mode: state.mode,
    phase: state.phase.current,
  }, renderPublish);
}
