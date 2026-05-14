/**
 * Built-in markdown renderer adapter — wraps wechat-preview (exportMarkdownToWechatHtml).
 *
 * Implements MarkdownRenderPlugin interface. This is the default adapter used
 * when no user-provided plugin is configured.
 */

import { exportMarkdownToWechatHtml } from "../wechat-preview";
import { findChrome } from "../imgx/runtime";
import type {
  MarkdownRenderPlugin,
  MarkdownRenderInput,
  MarkdownRenderOutput,
  PipelinePluginDoctorCheck,
} from "../adapter-types";

export const builtinMarkdownRenderer: MarkdownRenderPlugin = {
  name: "builtin-wechat-preview",
  version: "1.0.0",

  async doctor(): Promise<PipelinePluginDoctorCheck[]> {
    const checks: PipelinePluginDoctorCheck[] = [];

    // Check Chrome/Chromium
    const chromePath = findChrome();
    if (chromePath) {
      checks.push({ name: "chrome", ok: true, message: chromePath });
    } else {
      checks.push({
        name: "chrome",
        ok: false,
        message:
          "Chrome/Chromium not found. Required for WeChat HTML export.\n" +
          "Install one of:\n" +
          "  macOS:   brew install --cask chromium\n" +
          "  Ubuntu:  sudo apt install chromium-browser\n" +
          "  Or install Google Chrome from https://www.google.com/chrome/\n" +
          "  Or set CHROME_PATH environment variable to the binary path.",
      });
    }

    return checks;
  },

  async render(input: MarkdownRenderInput): Promise<MarkdownRenderOutput> {
    const result = await exportMarkdownToWechatHtml({
      markdownPath: input.markdownPath,
      outPath: input.outPath,
      account: input.account,
      title: input.title,
      previewShellOutPath: input.previewShellOutPath,
      customCss: input.customCss,
    });

    return {
      html: result.html,
      htmlPath: result.htmlPath,
      account: result.account,
      previewStyle: result.previewStyle,
      previewShellPath: result.previewShellPath,
    };
  },
};
