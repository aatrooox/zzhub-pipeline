import { defaultValueCtx, Editor, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getHTML } from "@milkdown/kit/utils";
import articleCss from "@zzclub/milkdown-article-style/article.css?raw";
import { highlightPlugins } from "./highlight";
import type { ArticleStructure } from "../wechat-renderer";
import { renderWechatHtml } from "../wechat-renderer";
import type { WechatExportTheme } from "../themes";

interface BrowserPayload {
  markdown: string;
  assetBaseUrl?: string;
  editorVars: Record<string, string>;
  exportTheme: WechatExportTheme;
  customCss?: string;
  structure?: ArticleStructure;
}

type BrowserResult =
  | { status: "success"; html: string; semanticHtml?: string }
  | { status: "error"; error: string };

declare global {
  interface Window {
    __ZZHUB_WECHAT_PAYLOAD__?: BrowserPayload;
    __ZZHUB_SET_RESULT__: (result: BrowserResult) => void;
  }
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
    .use(gfm)
    .use(highlightPlugins);
  await editor.create();
  // 在解析后处理真实图片节点，引用式图片也生效，代码中的图片语法不被改写。
  const semantic = new DOMParser().parseFromString(editor.action(getHTML()), "text/html");
  for (const image of semantic.querySelectorAll("img")) {
    const src = image.getAttribute("src") || "";
    if (src && payload.assetBaseUrl && !/^(?:[a-z][a-z0-9+.-]*:|\/)/i.test(src)) {
      const url = new URL(src, payload.assetBaseUrl);
      image.setAttribute("src", url.protocol === "file:" ? decodeURIComponent(url.pathname) : url.href);
    }
  }
  const semanticHtml = semantic.body.innerHTML;
  const html = await renderWechatHtml({
    semanticHtml,
    baseCss: articleCss,
    customCss: payload.customCss,
    structure: payload.structure,
    editorVars: payload.editorVars,
    theme: payload.exportTheme,
  });
  await editor.destroy();
  window.__ZZHUB_SET_RESULT__({ status: "success", html, semanticHtml });
}

void main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  window.__ZZHUB_SET_RESULT__({ status: "error", error: detail });
});
