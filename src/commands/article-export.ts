import { parseArgs, requireArg } from "../args";
import { loadTaskState } from "../task-manager";
import { loadConfig, resolveWorkspacePaths } from "../config";
import { readArticleTheme } from "../article-theme";
import { exportWechatArticle } from "../providers/article-export";
import { printResult } from "../output";

/** 在发布检查点只导出本地 HTML，预览绝不调用发布 provider。 */
export async function articleExport(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  const { state } = await loadTaskState(requireArg(parsed, "state", "state JSON path"));
  if (state.route.primary !== "wechat-article" || state.phase.render.status !== "done" || !state.asset_path) throw new Error("Article preview requires a rendered article run");
  const config = loadConfig();
  const articleTheme = state.intent.article_theme ? await readArticleTheme(state.intent.article_theme) : undefined;
  const result = await exportWechatArticle({ state, config, workspacePaths: resolveWorkspacePaths(state.workspace_root, config), account: state.route.account, articleTheme });
  printResult({ htmlPath: result.rendered.htmlPath, coverPath: result.photos[0], assetPath: state.asset_path });
}
