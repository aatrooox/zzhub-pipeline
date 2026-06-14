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
  readState,
  writeState,
  type PublishTarget,
  type RoutePrimary,
} from "../state";
import { executePublishTargets } from "../providers/publish-core";

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

  const statePath = requireArg(parsed, "state", "state JSON path");
  const accountArg = optionalArg(parsed, "account");
  const targetsArg = optionalArg(parsed, "targets");
  const dryRun = flagArg(parsed, "dry-run");

  const state = await readState(statePath);
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
        const route = part.slice(0, atIdx).trim() as RoutePrimary;
        const account = part.slice(atIdx + 1).trim();
        newTargets.push({ route, account });
      } else {
        // No @: use state.route.primary as route, part as account
        newTargets.push({
          route: state.route.primary,
          account: part.trim(),
        });
      }
    }
  }

  if (newTargets.length === 0) {
    throw new Error("No targets specified. Use --account or --targets.");
  }

  // Append to publish_targets (dedupe handled by executePublishTargets)
  state.publish_targets = [...state.publish_targets, ...newTargets];

  // Execute (executePublishTargets handles dedupe and idempotent filter)
  const { results, errors } = await executePublishTargets({
    state,
    targets: newTargets,
    dryRun,
    config,
    workspacePaths,
  });

  // Upsert results
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

  // Mode stays done (or whatever it was)
  state.updated_at = new Date().toISOString();

  await writeState(statePath, state);

  const output: any = {
    publish_results: state.publish.results,
    mode: state.mode,
    new_targets: newTargets,
  };
  if (errors.length > 0) {
    output.errors = errors;
  }
  printResult(output);
}
