import { parseArgs, optionalArg, requireArg } from "../args";
import { readArticleTheme, snapshotArticleTheme } from "../article-theme";
import { printResult } from "../output";

/** 校验或安装离线模板，供 CLI 和桌面端共用。 */
export async function articleTheme(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  if (parsed.help) {
    console.log("Usage: zzp article-theme --path <模板目录或 manifest.json> [--install <本地模板库>]\n只校验或复制模板，不联网、不发布。");
    return;
  }
  let theme = await readArticleTheme(requireArg(parsed, "path", "template path"));
  const destination = optionalArg(parsed, "install");
  if (destination) theme = await snapshotArticleTheme(theme, destination);
  printResult({ ...theme.manifest, path: theme.path, hash: theme.hash });
}
