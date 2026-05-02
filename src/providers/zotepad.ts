import { PipelineConfig, ResolvedWorkspacePaths } from "../config";
import {
  exportMarkdownToWechatHtml as exportWithInternalPreview,
} from "../wechat-preview";

interface OpenPreviewParams {
  postPath: string;
  config: PipelineConfig;
  workspacePaths: ResolvedWorkspacePaths;
  account: string;
  title?: string;
}

export async function exportMarkdownToWechatHtml({
  postPath,
  workspacePaths,
  account,
  title,
}: OpenPreviewParams): Promise<{ html: string; htmlPath: string }> {
  const result = await exportWithInternalPreview({
    markdownPath: postPath,
    outPath: workspacePaths.zotepadExportHtml,
    account,
    title,
  });
  return { html: result.html, htmlPath: result.htmlPath };
}
