import { loadConfig, resolveConfigRelativePath } from "../../src/config";
import { readArticleTheme } from "../../src/article-theme";
import { resolveWechatArticleTheme } from "../../src/wechat-preview";
import { resolveCoverTheme } from "../../src/schema/cover-theme";
import { resolveRenderBranding } from "../../src/render-branding";
import { defaultState } from "../../src/state";
import { getVisualParams } from "../../src/routes";
import type { CloudJobInput } from "./store";
import { readFile } from "node:fs/promises";

// 默认解析在一次性受信子进程中读取部署配置，不改变 Worker 常驻环境。
const input = await Bun.stdin.json() as CloudJobInput;
const config = loadConfig();
const imageRenderer = config.plugins.imageRenderer;
if (imageRenderer && typeof imageRenderer === "object" && typeof imageRenderer.options.dataDir === "string") process.env.TYPESET_DATA_DIR = resolveConfigRelativePath(imageRenderer.options.dataDir)!;
const { resolveArticleCoverConfig } = await import("@akairos/typeset-studio/server-config");
const account = config.wx.accounts[input.account] ?? config.wx.accounts[config.wx.defaultAccount];
const selected = input.articleStyle ? null : resolveConfigRelativePath(account?.articleTheme);
let theme = selected ? await readArticleTheme(selected) : null;
if (input.articleStyle) {
  const path = process.env.PIPELINE_STYLE_INPUT!;
  theme = await readArticleTheme(path);
}
const effective = resolveWechatArticleTheme(input.account, theme?.manifest.css !== undefined ? undefined : account?.theme, theme);
const customCss = theme?.manifest.css !== undefined || !account?.customCss ? "" : await readFile(resolveConfigRelativePath(account.customCss)!, "utf8");
const css = [theme?.css, customCss].filter(Boolean).join("\n");
const standalone = {
  schemaVersion: 1, engineVersion: 1, id: "frozen-article", name: "Frozen article", version: "1.0.0",
  editorVars: effective.theme.editorVars, exportTheme: effective.theme.exportTheme,
  syntaxPresets: effective.syntaxPresets, structure: effective.structure, css,
};
const imageEntry = config.plugins.imageRenderer;
const markdownEntry = config.plugins.markdownRenderer;
if ((typeof imageEntry === "string" ? imageEntry : imageEntry?.module) !== "@akairos/typeset-studio/adapter" ||
  (typeof markdownEntry === "string" ? markdownEntry : markdownEntry?.module) !== "@akairos/myno/adapter") throw new Error("Full article snapshots require the packaged Typeset Studio and myno renderers");
const state = defaultState();
state.route.primary = "wechat-article"; state.route.account = input.account;
state.route.account_visual_params = getVisualParams(input.account);
state.metadata.title = input.title;
const branding = resolveRenderBranding(config, input.account);
const cover = input.coverSnapshot ? null : resolveArticleCoverConfig({
  state: { route: { ...state.route, account_visual_params: state.route.account_visual_params ?? undefined }, metadata: { title: input.title } }, title: input.title, route: "wechat-article", outputDir: "", bodyText: "", template: "wechat-cover-split",
  coverTheme: resolveCoverTheme(config.render.cover, "wechat-cover-split", input.account),
  accountVisualParams: { footer: branding.footerText, fallbackIcon: branding.logo,
    bg: state.route.account_visual_params?.bg, highlight: state.route.account_visual_params?.highlight },
});
// 凭据由账号连接按修订注入，默认配置与完整快照均不复制秘密。
config.wx.accounts = Object.fromEntries(Object.entries(config.wx.accounts).map(([key, value]) => [key, { ...value, appId: "", appSecret: "", pat: "", customCss: null, articleTheme: null }]));
config.cos.pat = "";
console.log(JSON.stringify({ config, article: standalone, cover }));
