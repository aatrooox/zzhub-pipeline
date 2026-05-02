import { optionalArg, parseArgs, requireArg } from "../args";
import { printResult, renderWechatExport } from "../output";
import { exportMarkdownToWechatHtml } from "../wechat-preview";

export async function wechatExport(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline wechat-export [options]

Options:
  --markdown    Path to markdown file (required)
  --out         Path to exported html file (required)
  --account     Account/theme key (optional; default: default)
  --title       Page title for the render shell (optional)
  --preview-shell-out  Path to full Milkdown preview html (optional)
`.trim());
    return;
  }

  const markdownPath = requireArg(parsed, "markdown", "markdown file path");
  const outPath = requireArg(parsed, "out", "html output path");
  const account = optionalArg(parsed, "account") ?? "default";
  const title = optionalArg(parsed, "title");
  const previewShellOutPath = optionalArg(parsed, "preview-shell-out");

  const result = await exportMarkdownToWechatHtml({
    markdownPath,
    outPath,
    account,
    title,
    previewShellOutPath,
  });

  printResult(result, renderWechatExport);
}
