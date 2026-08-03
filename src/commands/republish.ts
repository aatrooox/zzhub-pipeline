/**
 * republish — Add publish targets and execute for new targets only.
 *
 * Used to publish a completed task to additional accounts/platforms
 * without re-rendering.
 *
 * Usage:
 *   zzhub-pipeline republish \
 *     --state /path/to/state.json \
 *     [--account ancientone] \
 *     [--targets "wechat-article@ancientone,blog@default"] \
 *     [--dry-run]
 *
 * Output: Updated state with new publish.results entries
 */

import { parseArgs, requireArg, optionalArg, flagArg } from "../args";
import { printResult } from "../output";
import { loadConfig, resolveWorkspacePaths } from "../config";
import {
  acquireStateOperationLock,
  readResolvedState,
  validateForPhase,
  writeState,
  type PublishTarget,
} from "../state";
import {
  getStatePublishTargets,
  parseAccountName,
  parseRoutePrimary,
  validatePublishTargetCompatibility,
} from "../publish-targets";
import {
  dedupeTargets,
  executePublishTargets,
  upsertPublishResult,
} from "../providers/publish-core";
import { loadTaskState } from "../task-manager";

export async function republish(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline republish [options]

Add publish targets and execute for new targets only.
Used to publish a completed task to additional accounts/platforms.

Options:
  --state      Path to state JSON (required)
  --account    Add target with state.route.primary and this account (optional)
  --targets    Comma-separated: route@account,route@account (optional)
  --dry-run    Print commands without executing (optional)

Examples:
  # Add single target (same route, different account)
  zzhub-pipeline republish --state path --account ancientone

  # Add multiple targets
  zzhub-pipeline republish --state path --targets "wechat-article@ancientone,blog@default"

  # Mix both
  zzhub-pipeline republish --state path --account ancientone --targets "blog@default"
`.trim());
    return;
  }

  const requestedStatePath = requireArg(parsed, "state", "state JSON path");
  const accountRaw = optionalArg(parsed, "account");
  const accountArg = accountRaw ? parseAccountName(accountRaw) : undefined;
  const targetsArg = optionalArg(parsed, "targets");
  const dryRun = flagArg(parsed, "dry-run");

  const initialResolved = await readResolvedState(requestedStatePath);
  const releaseOperationLock = await acquireStateOperationLock(initialResolved.path);
  try {
  const resolved = await loadTaskState(initialResolved.path);
  const statePath = resolved.path;
  const state = resolved.state;
  const config = loadConfig();
  const workspacePaths = resolveWorkspacePaths(state.workspace_root, config);

  // Validate prerequisites
  if (!state.asset_path) {
    throw new Error("asset_path not set. Cannot republish.");
  }
  if (state.content_review.status !== "passed") {
    throw new Error("content_review must be 'passed' before republish.");
  }

  // Parse new targets
  const newTargets: PublishTarget[] = [];

  // --account: add {state.route.primary, account}
  if (accountArg) {
    newTargets.push({
      route: state.route.primary,
      account: accountArg,
    });
  }

  // --targets: parse "route@account,route@account,..."
  if (targetsArg) {
    const parts = targetsArg.split(",").map((t) => t.trim());
    for (const part of parts) {
      const atIdx = part.indexOf("@");
      if (atIdx !== -1) {
        const route = parseRoutePrimary(part.slice(0, atIdx).trim());
        const account = parseAccountName(part.slice(atIdx + 1), `account in target '${part}'`);
        newTargets.push({ route, account });
      } else {
        // No @: use state.route.primary as route, part as account
        newTargets.push({
          route: state.route.primary,
          account: parseAccountName(part, "target account"),
        });
      }
    }
  }

  if (newTargets.length === 0) {
    throw new Error("No targets specified. Use --account or --targets.");
  }
  if (
    state.intent.existing_draft_media_id &&
    newTargets.some((target) =>
      target.route.startsWith("wechat-") &&
      (target.route !== state.route.primary || target.account !== state.route.account))
  ) {
    throw new Error(
      "existing_draft_media_id cannot be republished to a different WeChat target",
    );
  }

  const mergedTargets = dedupeTargets([
    ...getStatePublishTargets(state),
    ...newTargets,
  ]);
  validatePublishTargetCompatibility(mergedTargets, state.intent.content_form);
  const validationErrors = validateForPhase(
    {
      ...state,
      state_path: state.state_path || statePath,
      publish_targets: mergedTargets,
    },
    "publish",
  );
  if (validationErrors.length > 0) {
    throw new Error(
      `Republish validation failed: ${validationErrors.map((item) => `${item.field}: ${item.message}`).join("; ")}`,
    );
  }

  if (!dryRun) {
    state.publish_targets = mergedTargets;
    await writeState(statePath, state);
  }

  // Execute (executePublishTargets handles dedupe and idempotent filter)
  const { results, errors } = await executePublishTargets({
    state,
    targets: newTargets,
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

  const output: Record<string, unknown> = {
    publish_results: dryRun ? results : state.publish.results,
    mode: state.mode,
    new_targets: newTargets,
    ...(dryRun ? { dry_run: true } : {}),
  };
  if (errors.length > 0) {
    output.errors = errors;
  }
  printResult(output);
  } finally {
    await releaseOperationLock();
  }
}
