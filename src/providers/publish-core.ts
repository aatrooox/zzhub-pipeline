/**
 * publish-core.ts — Shared publish execution logic.
 *
 * Used by both `publish` (normal flow) and `republish` (add-on).
 */

import type { PipelineConfig, ResolvedWorkspacePaths } from "../config";
import type { PublishResult, PublishTarget, WorkflowState } from "../state";
import { getPublishProvider, type PublishRouteContext } from "./index";
import { reportProgress } from "../monitor/recorder";
import { join } from "node:path";
import { resolveConfigRelativePath } from "../config";
import { readArticleTheme, snapshotArticleTheme, type ArticleThemePackage } from "../article-theme";

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
  onResult?: (result: PublishResult) => Promise<void>;
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
  themeHashes?: Map<string, string | null>,
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
    // 模板变化必须重新导出；旧结果无模板时继续兼容。
    return !existing || (themeHashes && (existing.article_theme_hash ?? null) !== (themeHashes.get(`${target.route}@${target.account}`) ?? null));
  });
}

export function upsertPublishResult(
  state: WorkflowState,
  result: PublishResult,
): void {
  const index = state.publish.results.findIndex(
    (item) => item.route === result.route && item.account === result.account,
  );
  if (index >= 0) {
    state.publish.results[index] = result;
  } else {
    state.publish.results.push(result);
  }
}

/**
 * Execute publish targets sequentially so callers can persist each outcome
 * before the next external side effect begins.
 */
export async function executePublishTargets(
  params: ExecutePublishTargetsParams,
): Promise<ExecutePublishTargetsResult> {
  const { state, targets, dryRun, config, workspacePaths, onResult } = params;

  const deduped = dedupeTargets(targets);
  const themes = new Map<string, ArticleThemePackage>();
  const themeHashes = new Map<string, string | null>();
  const themeErrors = new Map<string, unknown>();
  for (const target of deduped) {
    if (target.route !== "wechat-article") continue;
    const account = config.wx.accounts[target.account] ?? config.wx.accounts[config.wx.defaultAccount];
    const selected = state.intent.article_theme || resolveConfigRelativePath(account?.articleTheme);
    if (!selected) continue;
    const key = `${target.route}@${target.account}`;
    try {
      const source = await readArticleTheme(selected);
      const theme = dryRun ? source : await snapshotArticleTheme(source, join(state.workspace_root, ".zzhub-media", "article-themes"));
      themes.set(key, theme);
      themeHashes.set(key, theme.hash);
    } catch (error) {
      // 一个账号的模板损坏不阻断其他发布目标，结果仍按原契约逐个记录。
      themeHashes.set(key, "invalid");
      themeErrors.set(key, error);
    }
  }
  const filtered = filterIdempotent(
    deduped,
    state.publish.results,
    state.artifacts.content_version,
    state.artifacts.render_version,
    themeHashes,
  );

  const results: PublishResult[] = [];
  const errors: PublishTargetError[] = [];

  for (const target of filtered) {
    reportProgress({ stage: "publish.targets", message: "正在发布", current: results.length, total: filtered.length, unit: "targets", route: target.route, account: target.account });
    let result: PublishResult;
    try {
      const previous = state.publish.results.find(item => item.route === target.route && item.account === target.account);
      if (previous?.detail?.includes("WX_RESULT_UNKNOWN")) throw new Error("WX_RESULT_UNKNOWN: 上次发送结果未知，请检查草稿箱后再通过 reset --mode publish 明确重试");
      if (themeErrors.has(`${target.route}@${target.account}`)) throw themeErrors.get(`${target.route}@${target.account}`);
      const provider = getPublishProvider(target.route);
      const ctx: PublishRouteContext = {
        state,
        dryRun,
        config,
        workspacePaths,
        accountOverride: target.account,
        articleTheme: themes.get(`${target.route}@${target.account}`),
      };
      const providerResult = await provider(ctx);
      result = {
        ...providerResult,
        route: target.route,
        account: target.account,
        content_version: state.artifacts.content_version,
        render_version: state.artifacts.render_version,
        article_theme_hash: themeHashes.get(`${target.route}@${target.account}`) ?? null,
      };
    } catch (err) {
      const error: PublishTargetError = {
        route: target.route,
        account: target.account,
        error: err instanceof Error ? err.message : String(err),
      };
      result = {
        route: target.route,
        account: target.account,
        status: "failed",
        detail: error.error,
        published_at: null,
        content_version: state.artifacts.content_version,
        render_version: state.artifacts.render_version,
      };
    }
    // provider 返回 failed 与抛出异常使用同一条错误汇总路径。
    if (result.status === "failed") {
      errors.push({ route: target.route, account: target.account, error: result.detail || "发布失败，provider 未提供原因" });
    }
    results.push(result);
    await onResult?.(result);
    reportProgress({ stage: "publish.targets", message: result.status === "failed" ? "目标发布失败" : "目标处理完成", current: results.length, total: filtered.length, unit: "targets", route: target.route, account: target.account });
  }

  return { results, errors };
}
