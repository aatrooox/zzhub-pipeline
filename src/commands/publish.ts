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
import {
  readState,
  validateForPhase,
  writeState,
  type PublishTarget,
  type RoutePrimary,
} from "../state";
import { executePublishTargets } from "../providers/publish-core";

export async function publish(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline publish [options]

Options:
  --state      Path to state JSON (required)
  --route      Only publish this route (optional; default: all targets)
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

  // Determine targets
  let targets: PublishTarget[];
  if (routeOverride) {
    targets = [{ route: routeOverride, account: state.route.account }];
  } else if (state.publish_targets.length > 0) {
    targets = state.publish_targets;
  } else {
    // Derive from route (backward compat)
    targets = [{ route: state.route.primary, account: state.route.account }];
    for (const extra of state.route.extras) {
      targets.push({ route: extra, account: state.route.account });
    }
  }

  const { results, errors } = await executePublishTargets({
    state,
    targets,
    dryRun,
    config,
    workspacePaths,
  });

  // Upsert results into state
  for (const result of results) {
    const idx = state.publish.results.findIndex(
      (r) => r.route === result.route && r.account === result.account,
    );
    if (idx >= 0) {
      state.publish.results[idx] = result;
    } else {
      state.publish.results.push(result);
    }
  }

  // Check if all targets are done
  const allDone = targets.every((target) => {
    const r = state.publish.results.find(
      (x) => x.route === target.route && x.account === target.account,
    );
    return r && (r.status === "success" || r.status === "skipped");
  });

  if (allDone) {
    state.mode = "done";
    state.phase.publish = { status: "done", error: null };
    state.phase.current = "done";
  } else {
    state.mode = "active";
    state.phase.publish = { status: "pending", error: null };
    state.phase.current = "publish";
  }

  await writeState(statePath, state);

  const output: any = {
    publish_results: state.publish.results,
    mode: state.mode,
    phase: state.phase.current,
  };
  if (errors.length > 0) {
    output.errors = errors;
  }
  printResult(output, renderPublish);
}
