import { spawn } from "child_process";
import { resolve } from "path";
import { flagArg, optionalArg, parseArgs, requireArg } from "../args";
import { printResult, renderWechatExport } from "../output";
import { loadConfig, resolveConfigRelativePath } from "../config";
import { resolveMarkdownRenderer } from "../adapter-loader";
import { WechatExportError } from "../wechat-preview";
import { registerPreviewEntry } from "../wechat-preview/server";

const CSS_DEMO = `
Custom CSS is cascaded after the built-in theme and converted to conservative
inline styles. Use semantic selectors or stable data-wechat-node hooks.

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

export function resolveWechatExportCustomCss(
  cliCustomCss: string | undefined,
  accountCustomCss: string | null | undefined,
  cwd: string = process.cwd(),
  configPath?: string,
): string | null {
  return cliCustomCss
    ? resolve(cwd, cliCustomCss)
    : resolveConfigRelativePath(accountCustomCss, configPath);
}

async function openUrl(url: string): Promise<void> {
  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(opener, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // non-fatal
  }
}

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
  --preview-shell-out  Path to exact final-HTML preview (optional)
  --custom-css         CSS override path; replaces account customCss (optional)
  --timeout-ms         Chrome virtual-time-budget in ms (default: 15000)
  --debug-dir          Write intermediate artifacts for debugging (optional)
  --preview            Register result with local preview server (default: true)
  --no-preview         Do not register with preview server
  --preview-auto-start Auto-start preview server if needed (default: true)
  --open               Open preview URL in browser after export

${CSS_DEMO}
`.trim());
    return;
  }

  const markdownPath = requireArg(parsed, "markdown", "markdown file path");
  const outPath = requireArg(parsed, "out", "html output path");
  const account = optionalArg(parsed, "account") ?? "default";
  const title = optionalArg(parsed, "title");
  const previewShellOutPath = optionalArg(parsed, "preview-shell-out");
  const cliCustomCss = optionalArg(parsed, "custom-css");
  const timeoutRaw = optionalArg(parsed, "timeout-ms");
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : undefined;
  const debugDir = optionalArg(parsed, "debug-dir");
  const noPreview = flagArg(parsed, "no-preview");
  // Default true unless --no-preview or --preview=false
  const previewExplicit = parsed.preview;
  const preview =
    !noPreview &&
    previewExplicit !== false &&
    previewExplicit !== "false";
  const previewAutoStartExplicit = parsed["preview-auto-start"];
  const previewAutoStart =
    previewAutoStartExplicit !== false &&
    previewAutoStartExplicit !== "false";
  const open = flagArg(parsed, "open");

  const config = loadConfig();
  const wxAccount = config.wx.accounts[account] ?? config.wx.accounts[config.wx.defaultAccount];
  const customCss = resolveWechatExportCustomCss(
    cliCustomCss,
    wxAccount?.customCss,
  );
  const markdownRenderer = await resolveMarkdownRenderer(config);

  const displayTitle = title ?? "Wechat Preview Export";

  try {
    const result = await markdownRenderer.render({
      markdownPath,
      outPath,
      account,
      title,
      previewShellOutPath,
      customCss,
      themeOverrides: wxAccount?.theme,
      timeoutMs: timeoutMs !== undefined && Number.isFinite(timeoutMs) ? timeoutMs : undefined,
      debugDir: debugDir ? resolve(process.cwd(), debugDir) : undefined,
    });

    let preview_url: string | undefined;
    let preview_dashboard_url: string | undefined;
    let preview_register_error: string | undefined;

    if (preview) {
      const reg = await registerPreviewEntry(
        {
          title: displayTitle,
          account: result.account,
          status: "success",
          duration_ms: result.durationMs ?? 0,
          markdown_path: resolve(process.cwd(), markdownPath),
          html_path: result.htmlPath,
          preview_style: result.previewStyle,
          html: result.html,
          debug: {
            bundle_rebuilt: result.bundleRebuilt,
            bundle_stale: result.bundleStale,
            debug_dir: result.debugDir,
          },
        },
        { autoStart: previewAutoStart },
      );
      if (reg.ok) {
        preview_url = reg.preview_url;
        preview_dashboard_url = reg.dashboard_url;
        if (open && preview_url) await openUrl(preview_url);
      } else {
        preview_register_error = reg.error;
      }
    }

    // Keep semanticHtml out of default CLI output (large); it still lands in --debug-dir.
    const { semanticHtml: _semanticHtml, ...resultRest } = result;
    printResult(
      {
        ...resultRest,
        preview_url,
        preview_dashboard_url,
        preview_register_error,
      },
      renderWechatExport,
    );
  } catch (error) {
    if (preview && error instanceof WechatExportError) {
      const reg = await registerPreviewEntry(
        {
          title: error.title ?? displayTitle,
          account: error.account,
          status: "failed",
          duration_ms: error.durationMs,
          markdown_path: error.markdownPath,
          error: error.message,
          error_kind: error.kind,
          debug: error.debug,
        },
        { autoStart: previewAutoStart },
      );
      if (reg.ok) {
        printResult(
          {
            ok: false,
            error: error.message,
            error_kind: error.kind,
            duration_ms: error.durationMs,
            debug: error.debug,
            preview_url: reg.preview_url,
            preview_dashboard_url: reg.dashboard_url,
          },
          renderWechatExport,
        );
        if (open && reg.preview_url) await openUrl(reg.preview_url);
        process.exitCode = 1;
        return;
      }
    }
    throw error;
  }
}
