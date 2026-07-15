import { defaultValueCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getHTML } from "@milkdown/kit/utils";
import articleCss from "./editor-export.css?raw";
import { renderWechatHtml } from "../wechat-renderer";
import type { WechatExportTheme } from "../themes";

interface BrowserPayload {
  markdown: string;
  editorVars: Record<string, string>;
  exportTheme: WechatExportTheme;
  customCss?: string;
}

declare global {
  interface Window {
    __ZZHUB_WECHAT_PAYLOAD__?: BrowserPayload;
  }
}

function setResult(result: { status: "success"; html: string } | { status: "error"; error: string }): void {
  const el = document.getElementById("zzhub-wechat-export-result");
  if (!el) {
    return;
  }
  el.textContent = JSON.stringify(result);
}

async function main(): Promise<void> {
  const payload = window.__ZZHUB_WECHAT_PAYLOAD__;
  if (!payload) {
    throw new Error("Missing __ZZHUB_WECHAT_PAYLOAD__");
  }

  const host = document.getElementById("editor-host");
  if (!host) {
    throw new Error("Missing editor host");
  }

  const editor = Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, host);
      ctx.set(defaultValueCtx, payload.markdown);
    })
    .use(commonmark)
    .use(gfm);
  await editor.create();
  const semanticHtml = editor.action(getHTML());
  const html = renderWechatHtml({
    semanticHtml,
    baseCss: articleCss,
    customCss: payload.customCss,
    editorVars: payload.editorVars,
    theme: payload.exportTheme,
  });
  await editor.destroy();
  setResult({ status: "success", html });
}

void main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  setResult({ status: "error", error: detail });
});
