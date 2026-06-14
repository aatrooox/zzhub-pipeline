/**
 * publish-core.ts — Shared publish execution logic.
 *
 * Used by both `publish` (normal flow) and `republish` (add-on).
 */

import type { PipelineConfig, ResolvedWorkspacePaths } from "../config";
import type { PublishResult, PublishTarget, WorkflowState } from "../state";
import { getPublishProvider, type PublishRouteContext } from "./index";

export interface PublishTargetError {
  route: string;
  account: string;
  error: string;
}

export interface ExecutePublishTargetsParams {
  state: WorkflowState;
  targets: PublishTarget[];
  dryRun: boolean;
  config: PipelineConfig;
  workspacePaths: ResolvedWorkspacePaths;
}

export interface ExecutePublishTargetsResult {
  results: PublishResult[];
  errors: PublishTargetError[];
}

/**
 * Deduplicate targets by route+account.
 */
export function dedupeTargets(targets: PublishTarget[]): PublishTarget[] {
  const seen = new Set<string>();
  const result: PublishTarget[] = [];
  for (const target of targets) {
    const key = `${target.route}@${target.account}`;
    if (!seen.has(key)) {
      seen.add(key);
      result.push(target);
    }
  }
  return result;
}

/**
 * Filter out targets that already have a successful publish result
 * at the current content_version + render_version.
 */
export function filterIdempotent(
  targets: PublishTarget[],
  existingResults: PublishResult[],
  contentVersion: number,
  renderVersion: number,
): PublishTarget[] {
  return targets.filter((target) => {
    const existing = existingResults.find(
      (r) =>
        r.route === target.route &&
        r.account === target.account &&
        r.status === "success" &&
        r.content_version === contentVersion &&
        r.render_version === renderVersion,
    );
    return !existing;
  });
}

/**
 * Execute publish for a list of targets in parallel.
 */
export async function executePublishTargets(
  params: ExecutePublishTargetsParams,
): Promise<ExecutePublishTargetsResult> {
  const { state, targets, dryRun, config, workspacePaths } = params;

  const deduped = dedupeTargets(targets);
  const filtered = filterIdempotent(
    deduped,
    state.publish.results,
    state.artifacts.content_version,
    state.artifacts.render_version,
  );

  const results: PublishResult[] = [];
  const errors: PublishTargetError[] = [];

  // Execute in parallel
  const promises = filtered.map(async (target) => {
    const provider = getPublishProvider(target.route);
    const ctx: PublishRouteContext = {
      state,
      dryRun,
      config,
      workspacePaths,
      accountOverride: target.account,
    };

    try {
      const result = await provider(ctx);
      return { result, error: null };
    } catch (err) {
      const error: PublishTargetError = {
        route: target.route,
        account: target.account,
        error: err instanceof Error ? err.message : String(err),
      };
      return { result: null, error };
    }
  });

  const outcomes = await Promise.all(promises);

  for (const { result, error } of outcomes) {
    if (result) {
      results.push(result);
    }
    if (error) {
      errors.push(error);
    }
  }

  return { results, errors };
}
