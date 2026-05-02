import { Crepe } from "@milkdown/crepe";
import { listener } from "@milkdown/plugin-listener";
import "@milkdown/crepe/theme/common/style.css";
import "@milkdown/crepe/theme/frame.css";
import "../browser/editor-export.css";
import { getWeChatMinimalHTML, type WechatExportTheme } from "../wechat-formatter";

interface BrowserPayload {
  markdown: string;
  editorVars: Record<string, string>;
  exportTheme: WechatExportTheme;
}

declare global {
  interface Window {
    __ZZHUB_WECHAT_PAYLOAD__?: BrowserPayload;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setResult(result: { status: "success"; html: string } | { status: "error"; error: string }): void {
  const el = document.getElementById("zzhub-wechat-export-result");
  if (!el) {
    return;
  }
  el.textContent = JSON.stringify(result);
}

function doubleRaf(timeoutMs = 1500): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const timer = setTimeout(() => {
      if (done) {
        return;
      }
      done = true;
      resolve();
    }, timeoutMs);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (done) {
          return;
        }
        done = true;
        clearTimeout(timer);
        resolve();
      });
    });
  });
}

function applyEditorVars(vars: Record<string, string>): void {
  const root = document.documentElement;
  for (const [key, value] of Object.entries(vars)) {
    root.style.setProperty(key, value);
  }
}

async function main(): Promise<void> {
  const payload = window.__ZZHUB_WECHAT_PAYLOAD__;
  if (!payload) {
    throw new Error("Missing __ZZHUB_WECHAT_PAYLOAD__");
  }

  applyEditorVars(payload.editorVars);

  const host = document.getElementById("editor-host");
  if (!host) {
    throw new Error("Missing editor host");
  }

  const crepe = new Crepe({
    root: host,
    defaultValue: payload.markdown,
    features: {},
  });

  crepe.setReadonly(true);
  await crepe.editor.use(listener).create();
  crepe.setReadonly(true);

  await sleep(80);
  await doubleRaf();
  await sleep(160);
  await doubleRaf();

  const editorDom = host.querySelector(".milkdown .editor") as HTMLElement | null;
  if (!editorDom) {
    throw new Error("Milkdown editor DOM not found");
  }

  const html = getWeChatMinimalHTML(editorDom, payload.exportTheme);
  setResult({ status: "success", html });
}

void main().catch((error: unknown) => {
  const detail = error instanceof Error ? error.message : String(error);
  setResult({ status: "error", error: detail });
});
