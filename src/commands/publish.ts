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
  acquireStateOperationLock,
  readResolvedState,
  validateForPhase,
  writeState,
  type PublishTarget,
  type RoutePrimary,
} from "../state";
import {
  getStatePublishTargets,
  parseRoutePrimary,
  validatePublishTargetCompatibility,
} from "../publish-targets";
import {
  executePublishTargets,
  upsertPublishResult,
} from "../providers/publish-core";
import { loadTaskState } from "../task-manager";

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

  const requestedStatePath = requireArg(parsed, "state", "state JSON path");
  const routeRaw = optionalArg(parsed, "route");
  const routeOverride: RoutePrimary | undefined = routeRaw
    ? parseRoutePrimary(routeRaw)
    : undefined;
  const dryRun = flagArg(parsed, "dry-run");

  const initialResolved = await readResolvedState(requestedStatePath);
  const releaseOperationLock = await acquireStateOperationLock(initialResolved.path);
  try {
  const resolved = await loadTaskState(initialResolved.path);
  const statePath = resolved.path;
  const state = resolved.state;
  const config = loadConfig();
  const workspacePaths = resolveWorkspacePaths(state.workspace_root, config);

  if (!state.asset_path) {
    throw new Error("asset_path not set. Cannot publish.");
  }

  // Determine targets
  let targets: PublishTarget[];
  if (routeOverride) {
    targets = [{ route: routeOverride, account: state.route.account }];
  } else {
    targets = getStatePublishTargets(state);
  }
  validatePublishTargetCompatibility(targets, state.intent.content_form);
  const validationState = {
    ...state,
    state_path: state.state_path || statePath,
    publish_targets: targets,
  };
  const validationErrors = validateForPhase(validationState, "publish");
  if (validationErrors.length > 0) {
    throw new Error(
      `Publish validation failed: ${validationErrors.map((item) => `${item.field}: ${item.message}`).join("; ")}`,
    );
  }

  const wechatTargets = targets.filter((target) => target.route.startsWith("wechat-"));
  if (state.intent.existing_draft_media_id && wechatTargets.length > 1) {
    throw new Error(
      "existing_draft_media_id can only be used with one WeChat publish target",
    );
  }

  const { results, errors } = await executePublishTargets({
    state,
    targets,
    dryRun,
    config,
    workspacePaths,
    onResult: dryRun
      ? undefined
      : async (result) => {
          upsertPublishResult(state, result);
          await writeState(statePath, state);
        },
  });

  if (dryRun) {
    printResult({
      publish_results: results,
      mode: state.mode,
      phase: state.phase.current,
      dry_run: true,
      ...(errors.length > 0 ? { errors } : {}),
    }, renderPublish);
    return;
  }

  // Check if all targets are done
  const allDone = targets.every((target) => {
    const r = state.publish.results.find(
      (x) => x.route === target.route && x.account === target.account,
    );
    return r?.status === "success";
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
  } finally {
    await releaseOperationLock();
  }
}
