import { optionalArg, parseArgs, requireArg } from "../args";
import { printResult, renderWechatExport } from "../output";
import { loadConfig } from "../config";
import { resolveMarkdownRenderer } from "../adapter-loader";

const CSS_DEMO = `
Custom CSS is injected as a <style> tag after the built-in Milkdown styles
and before the browser renders. WeChat requires inline styles, so the
rendering pipeline captures computed styles from the DOM — your CSS
cascades naturally and the final inline-styled HTML will reflect it.

Example custom.css:

  /* Tweak headings */
  h1 { color: #1a1a2e; font-size: 22px; }
  h2 { color: #333; border-bottom: 1px solid #eee; }

  /* Wider paragraph spacing */
  p { margin: 1.2em 0; line-height: 2; }

  /* Subtle blockquote */
  blockquote {
    border-left: 3px solid #b35d85;
    background: #fdf6f9;
    padding: 8px 14px;
  }
`.trim();

export async function wechatExport(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline wechat-export [options]

Options:
  --markdown           Path to markdown file (required)
  --out                Path to exported html file (required)
  --account            Account/theme key (optional; default: default)
  --title              Page title for the render shell (optional)
  --preview-shell-out  Path to full Milkdown preview html (optional)
  --custom-css         Path to custom CSS file for style overrides (optional)

${CSS_DEMO}
`.trim());
    return;
  }

  const markdownPath = requireArg(parsed, "markdown", "markdown file path");
  const outPath = requireArg(parsed, "out", "html output path");
  const account = optionalArg(parsed, "account") ?? "default";
  const title = optionalArg(parsed, "title");
  const previewShellOutPath = optionalArg(parsed, "preview-shell-out");
  const customCss = optionalArg(parsed, "custom-css");

  const config = loadConfig();
  const wxAccount = config.wx.accounts[account] ?? config.wx.accounts[config.wx.defaultAccount];
  const markdownRenderer = await resolveMarkdownRenderer(config);
  const result = await markdownRenderer.render({
    markdownPath,
    outPath,
    account,
    title,
    previewShellOutPath,
    customCss,
    themeOverrides: wxAccount?.theme,
  });

  printResult(result, renderWechatExport);
}
