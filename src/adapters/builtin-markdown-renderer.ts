/**
 * Built-in markdown renderer adapter — wraps wechat-preview (exportMarkdownToWechatHtml).
 *
 * Implements MarkdownRenderPlugin interface. This is the default adapter used
 * when no user-provided plugin is configured.
 */

import { exportMarkdownToWechatHtml } from "../wechat-preview";
import type {
  MarkdownRenderPlugin,
  MarkdownRenderInput,
  MarkdownRenderOutput,
} from "../adapter-types";

export const builtinMarkdownRenderer: MarkdownRenderPlugin = {
  name: "builtin-wechat-preview",
  version: "1.0.0",

  async render(input: MarkdownRenderInput): Promise<MarkdownRenderOutput> {
    const result = await exportMarkdownToWechatHtml({
      markdownPath: input.markdownPath,
      outPath: input.outPath,
      account: input.account,
      title: input.title,
      previewShellOutPath: input.previewShellOutPath,
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
