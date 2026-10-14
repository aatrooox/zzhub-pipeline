import { Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getHTML } from "@milkdown/kit/utils";
import articleCss from "@akairos/milkdown-article-style/article.css?raw";
import { getCombinedMilkdownPlugins, type WechatPluginDoc } from "@akairos/milkdown-article-plugins";
import { renderWechatHtml } from "../../wechat-renderer";
import type { ArticleStructure } from "../../wechat-renderer";
import type { WechatExportTheme } from "../../themes";
import { SYNTAX_CATEGORIES, buildCombinedPresetsCss } from "./syntax-presets";
import { COLOR_PALETTES } from "./color-palettes";
import { extractFrontmatter } from "../../frontmatter-handler";
import { stripLeadingH1 } from "../../../text";

interface AccountData {
  name: string;
  customCssPath: string | null;
  customCssContent: string;
  theme: {
    editorVars: Record<string, string>;
    exportTheme: Partial<WechatExportTheme>;
    syntaxPresets?: Record<string, string>;
    structure?: ArticleStructure;
  };
  articleThemeCss?: string;
  articleTheme?: string | null;
  articleThemeStandalone?: boolean;
}

interface StudioConfigResponse {
  defaultAccount: string;
  accounts: Record<string, AccountData>;
  plugins: WechatPluginDoc[];
  sampleMarkdown: string;
}

let accounts: Record<string, AccountData> = {};
let currentAccount = "default";
let pluginsList: WechatPluginDoc[] = [];
let latestWechatHtml = "";
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let showingHtmlSource = false;
let currentSyntaxPresets: Record<string, string> = {};
// 串行渲染，旧结果不能覆盖最新编辑或账号。
let renderRevision = 0;
let rendering = false;

// DOM Elements
const accountSelect = document.getElementById("account-select") as HTMLSelectElement;
const editorMarkdown = document.getElementById("editor-markdown") as HTMLTextAreaElement;
const previewScreen = document.getElementById("preview-screen") as HTMLElement;
const editorStats = document.getElementById("editor-stats") as HTMLElement;
const htmlSourceContainer = document.getElementById("html-source-container") as HTMLElement;
const htmlSourceCode = document.getElementById("html-source-code") as HTMLTextAreaElement;
const toastContainer = document.getElementById("toast-container") as HTMLElement;
const hiddenHost = document.getElementById("studio-editor-host") as HTMLElement;

// Controls
const inputFontSize = document.getElementById("input-font-size") as HTMLInputElement;
const valFontSize = document.getElementById("val-font-size") as HTMLElement;
const inputLineHeight = document.getElementById("input-line-height") as HTMLInputElement;
const valLineHeight = document.getElementById("val-line-height") as HTMLElement;
const inputLetterSpacing = document.getElementById("input-letter-spacing") as HTMLInputElement;
const valLetterSpacing = document.getElementById("val-letter-spacing") as HTMLElement;
const inputParaSpacing = document.getElementById("input-para-spacing") as HTMLInputElement;
const valParaSpacing = document.getElementById("val-para-spacing") as HTMLElement;

const paletteSelect = document.getElementById("palette-select") as HTMLSelectElement;
const paletteDesc = document.getElementById("palette-desc") as HTMLElement;

const pickerBrandColor = document.getElementById("picker-brand-color") as HTMLInputElement;
const hexBrandColor = document.getElementById("hex-brand-color") as HTMLInputElement;
const pickerTextColor = document.getElementById("picker-text-color") as HTMLInputElement;
const hexTextColor = document.getElementById("hex-text-color") as HTMLInputElement;
const pickerH2Color = document.getElementById("picker-h2-color") as HTMLInputElement;
const hexH2Color = document.getElementById("hex-h2-color") as HTMLInputElement;
const pickerH3Color = document.getElementById("picker-h3-color") as HTMLInputElement;
const hexH3Color = document.getElementById("hex-h3-color") as HTMLInputElement;
const pickerQuoteColor = document.getElementById("picker-quote-color") as HTMLInputElement;
const hexQuoteColor = document.getElementById("hex-quote-color") as HTMLInputElement;
const pickerDividerColor = document.getElementById("picker-divider-color") as HTMLInputElement;
const hexDividerColor = document.getElementById("hex-divider-color") as HTMLInputElement;

const switchNumberedHeadings = document.getElementById("switch-numbered-headings") as HTMLInputElement;
const inputHeadingLabel = document.getElementById("input-heading-label") as HTMLInputElement;
const inputQuoteLabel = document.getElementById("input-quote-label") as HTMLInputElement;
const inputCustomCss = document.getElementById("input-custom-css") as HTMLTextAreaElement;

function showToast(message: string, type: "info" | "success" | "error" = "info") {
  const toast = document.createElement("div");
  toast.className = `toast ${type === "success" ? "toast-success" : ""}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

function bindColorPair(picker: HTMLInputElement, hex: HTMLInputElement, onChange: () => void) {
  picker.addEventListener("input", () => {
    hex.value = picker.value;
    onChange();
  });
  hex.addEventListener("input", () => {
    if (/^#[0-9a-f]{6}$/i.test(hex.value)) {
      picker.value = hex.value;
      onChange();
    }
  });
}

function updateStats() {
  const text = editorMarkdown.value;
  const chars = text.replace(/\s+/g, "").length;
  const minutes = Math.max(1, Math.round(chars / 400));
  editorStats.textContent = `字数: ${chars.toLocaleString()} 字 | 预计阅读: ${minutes} 分钟`;
}

/** 预览、保存与独立导出共用同一份样式参数。 */
function readStyleControls() {
  const account = accounts[currentAccount];
  const exportTheme: WechatExportTheme = {
    ...account.theme.exportTheme as WechatExportTheme,
    bodyFontSize: `${inputFontSize.value}px`,
    bodyParagraphSpacing: `${inputParaSpacing.value}em`,
    bodyColor: hexTextColor.value,
    h2Color: hexH2Color.value,
    h3Color: hexH3Color.value,
    primaryColor: hexBrandColor.value,
    dividerColor: hexDividerColor.value,
    blockquoteBorderColor: hexQuoteColor.value,
    bodyLineHeight: inputLineHeight.value,
    bodyLetterSpacing: `${inputLetterSpacing.value}em`,
  };
  const editorVars = {
    ...account.theme.editorVars,
    "--brand": hexBrandColor.value,
    "--text": hexTextColor.value,
    "--divider": hexDividerColor.value,
  };
  const structure: ArticleStructure = {
    ...account.theme.structure,
    numberedHeadings: switchNumberedHeadings.checked,
    headingLabel: inputHeadingLabel.value.trim(),
    quoteLabel: inputQuoteLabel.value.trim(),
  };
  return { editorVars, exportTheme, structure };
}

async function doRender() {
  if (rendering || !accounts[currentAccount]) return;
  rendering = true;
  const revision = renderRevision;
  const markdown = stripLeadingH1(extractFrontmatter(editorMarkdown.value).content).trimStart();
  const style = readStyleControls();
  const customCss = [
    buildCombinedPresetsCss(currentSyntaxPresets),
    accounts[currentAccount].articleThemeCss,
    inputCustomCss.value,
  ].filter(Boolean).join("\n\n");
  updateStats();

  try {
    hiddenHost.innerHTML = "";
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, hiddenHost);
        ctx.set(defaultValueCtx, markdown);
      })
      .use(commonmark)
      .use(gfm)
      .use(getCombinedMilkdownPlugins());

    let semanticHtml: string;
    try {
      await editor.create();
      semanticHtml = editor.action(getHTML());
    } finally {
      await editor.destroy();
    }
    const inlinedHtml = await renderWechatHtml({
      semanticHtml,
      baseCss: articleCss,
      customCss,
      structure: style.structure,
      editorVars: style.editorVars,
      theme: style.exportTheme,
    });
    if (revision !== renderRevision) return;
    latestWechatHtml = inlinedHtml;
    previewScreen.innerHTML = inlinedHtml;
    htmlSourceCode.value = inlinedHtml;
  } catch (error) {
    if (revision !== renderRevision) return;
    console.error("Studio render error:", error);
    const message = error instanceof Error ? error.message : String(error);
    previewScreen.textContent = `渲染错误: ${message}`;
    htmlSourceCode.value = "";
  } finally {
    rendering = false;
    if (revision !== renderRevision) {
      if (debounceTimer) clearTimeout(debounceTimer);
      void doRender();
    }
  }
}

function scheduleRender(delay = 60) {
  renderRevision += 1;
  latestWechatHtml = "";
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void doRender();
  }, delay);
}

function renderSyntaxCards(plugins: WechatPluginDoc[]) {
  const container = document.getElementById("syntax-card-list");
  if (!container) return;
  container.innerHTML = "";

  for (const doc of plugins) {
    const card = document.createElement("div");
    card.className = "syntax-card";

    const header = document.createElement("div");
    header.className = "syntax-card-header";

    const title = document.createElement("span");
    title.className = "syntax-card-title";
    title.textContent = doc.name;

    const badge = document.createElement("span");
    badge.className = "syntax-card-badge";
    badge.textContent = doc.category === "inline" ? "行内扩展" : "块级组件";

    header.appendChild(title);
    header.appendChild(badge);
    card.appendChild(header);

    const desc = document.createElement("p");
    desc.className = "syntax-card-desc";
    desc.textContent = doc.description;
    card.appendChild(desc);

    const code = document.createElement("pre");
    code.className = "syntax-code-snippet";
    code.textContent = doc.sampleMarkdown;
    card.appendChild(code);

    const insertBtn = document.createElement("button");
    insertBtn.className = "syntax-btn-insert";
    insertBtn.textContent = "+ 插入示例到文章中";
    insertBtn.addEventListener("click", () => {
      insertTextAtCursor(doc.sampleMarkdown);
      showToast(`已插入「${doc.name}」示例`, "info");
    });
    card.appendChild(insertBtn);

    container.appendChild(card);
  }
}

function insertTextAtCursor(text: string) {
  const start = editorMarkdown.selectionStart;
  const end = editorMarkdown.selectionEnd;
  const original = editorMarkdown.value;
  const insertText = `\n\n${text}\n\n`;
  editorMarkdown.value = original.slice(0, start) + insertText + original.slice(end);
  editorMarkdown.focus();
  editorMarkdown.selectionStart = editorMarkdown.selectionEnd = start + insertText.length;
  scheduleRender(20);
}

function renderSyntaxPresetControls() {
  const container = document.getElementById("syntax-preset-container");
  if (!container) return;
  container.innerHTML = "";

  for (const cat of SYNTAX_CATEGORIES) {
    const group = document.createElement("div");
    group.className = "preset-group";

    const header = document.createElement("div");
    header.className = "preset-header";

    const title = document.createElement("span");
    title.className = "preset-title";
    title.textContent = `${cat.icon} ${cat.label}`;
    header.appendChild(title);

    const hasMultiplePresets = Boolean(cat.presets && cat.presets.length > 1);

    const extractBtn = document.createElement("button");
    extractBtn.type = "button";
    extractBtn.className = "btn-extract-css";
    extractBtn.textContent = "📋 提取 CSS";
    extractBtn.title = "将此语法的 CSS 追加到底部自定义编辑器，方便微调覆盖";
    extractBtn.addEventListener("click", () => {
      let snippet = "";
      if (hasMultiplePresets && cat.presets) {
        const activeId = currentSyntaxPresets[cat.key] || cat.defaultPresetId || cat.presets[0].id;
        const p = cat.presets.find((preset) => preset.id === activeId) || cat.presets[0];
        snippet = `/* [${cat.label}] - ${p.name} */\n${p.css.trim()}\n`;
      } else {
        const cssContent = cat.css || (cat.presets && cat.presets[0]?.css) || "";
        snippet = `/* [${cat.label}] 基础样式 */\n${cssContent.trim()}\n`;
      }
      if (!snippet) return;
      inputCustomCss.value = inputCustomCss.value ? `${inputCustomCss.value.trim()}\n\n${snippet}` : snippet;
      inputCustomCss.focus();
      inputCustomCss.scrollTop = inputCustomCss.scrollHeight;
      showToast(`已将「${cat.label}」CSS 追加到底部编辑框！`, "info");
      scheduleRender(20);
    });
    header.appendChild(extractBtn);

    group.appendChild(header);

    if (hasMultiplePresets && cat.presets) {
      const select = document.createElement("select");
      select.className = "preset-select";
      select.dataset.category = cat.key;

      for (const preset of cat.presets) {
        const opt = document.createElement("option");
        opt.value = preset.id;
        opt.textContent = preset.name;
        select.appendChild(opt);
      }

      const activePresetId = currentSyntaxPresets[cat.key] || cat.defaultPresetId || cat.presets[0].id;
      select.value = activePresetId;
      group.appendChild(select);

      const desc = document.createElement("div");
      desc.className = "preset-desc";
      const activePreset = cat.presets.find((p) => p.id === activePresetId) || cat.presets[0];
      desc.textContent = activePreset?.description || "";
      group.appendChild(desc);

      select.addEventListener("change", () => {
        currentSyntaxPresets[cat.key] = select.value;
        const p = cat.presets!.find((preset) => preset.id === select.value);
        desc.textContent = p?.description || "";
        scheduleRender(20);
      });
    } else if (cat.description) {
      const desc = document.createElement("div");
      desc.className = "preset-desc";
      desc.textContent = cat.description;
      group.appendChild(desc);
    }

    container.appendChild(group);
  }
}

function applyAccountConfig(accountKey: string) {
  const account = accounts[accountKey];
  if (!account) return;

  // 独立文件不读取账号覆盖，避免保存成功却不生效。
  const saveButton = document.getElementById("btn-save") as HTMLButtonElement;
  saveButton.disabled = Boolean(account.articleThemeStandalone);
  saveButton.title = account.articleThemeStandalone
    ? "当前账号引用独立配置，请通过导出配置保存调整后替换原文件"
    : "保存当前调整至本地 config.json 的当前账号";

  const exportTheme = account.theme?.exportTheme || {};
  const editorVars = account.theme?.editorVars || {};

  // 账号切换与重置必须恢复全部排版控件。
  inputFontSize.value = exportTheme.bodyFontSize?.replace(/px$/, "")
    || exportTheme.containerStyle?.match(/font-size:\s*(\d+(?:\.\d+)?)px/)?.[1] || "16";
  valFontSize.textContent = `${inputFontSize.value}px`;
  inputLineHeight.value = exportTheme.bodyLineHeight || "1.84";
  valLineHeight.textContent = inputLineHeight.value;
  inputLetterSpacing.value = String(parseFloat(exportTheme.bodyLetterSpacing || "0.012em"));
  valLetterSpacing.textContent = `${inputLetterSpacing.value}em`;
  inputParaSpacing.value = String(parseFloat(exportTheme.bodyParagraphSpacing || "1.18em"));
  valParaSpacing.textContent = `${inputParaSpacing.value}em`;
  paletteSelect.value = "";
  paletteDesc.textContent = "";

  // 4. Colors
  const brand = editorVars["--brand"] || exportTheme.primaryColor;
  if (brand) {
    pickerBrandColor.value = brand;
    hexBrandColor.value = brand;
  }
  const textColor = exportTheme.bodyColor || editorVars["--text"];
  if (textColor) {
    pickerTextColor.value = textColor;
    hexTextColor.value = textColor;
  }
  if (exportTheme.h2Color) {
    pickerH2Color.value = exportTheme.h2Color;
    hexH2Color.value = exportTheme.h2Color;
  }
  if (exportTheme.h3Color) {
    pickerH3Color.value = exportTheme.h3Color;
    hexH3Color.value = exportTheme.h3Color;
  }
  const quoteColor = exportTheme.blockquoteBorderColor || brand;
  if (quoteColor) {
    pickerQuoteColor.value = quoteColor;
    hexQuoteColor.value = quoteColor;
  }
  const dividerColor = exportTheme.dividerColor || editorVars["--divider"];
  if (dividerColor) {
    pickerDividerColor.value = dividerColor;
    hexDividerColor.value = dividerColor;
  }
  if (account.customCssContent) {
    inputCustomCss.value = account.customCssContent;
  } else {
    inputCustomCss.value = "";
  }

  // 5. Syntax Presets
  const savedPresets = account.theme?.syntaxPresets || {};
  currentSyntaxPresets = {};
  for (const cat of SYNTAX_CATEGORIES) {
    if (cat.defaultPresetId) {
      currentSyntaxPresets[cat.key] = savedPresets[cat.key] || cat.defaultPresetId;
    }
  }
  renderSyntaxPresetControls();

  // 6. Structure
  const structure = account.theme?.structure || {};
  switchNumberedHeadings.checked = Boolean(structure.numberedHeadings);
  inputHeadingLabel.value = structure.headingLabel || "";
  inputQuoteLabel.value = structure.quoteLabel || "";

  scheduleRender(20);
}

function initColorPalettes() {
  if (!paletteSelect) return;
  paletteSelect.innerHTML = `<option value="">-- 选择推荐调色盘 (一键应用) --</option>`;
  for (const p of COLOR_PALETTES) {
    const opt = document.createElement("option");
    opt.value = p.id;
    opt.textContent = `${p.name} · ${p.category}`;
    paletteSelect.appendChild(opt);
  }
  paletteSelect.addEventListener("change", () => {
    const pal = COLOR_PALETTES.find((p) => p.id === paletteSelect.value);
    if (!pal) return;
    pickerBrandColor.value = hexBrandColor.value = pal.colors.brand;
    pickerTextColor.value = hexTextColor.value = pal.colors.text;
    pickerH2Color.value = hexH2Color.value = pal.colors.h2;
    pickerH3Color.value = hexH3Color.value = pal.colors.h3;
    pickerQuoteColor.value = hexQuoteColor.value = pal.colors.quote;
    pickerDividerColor.value = hexDividerColor.value = pal.colors.divider;
    if (paletteDesc) paletteDesc.textContent = pal.description;
    showToast(`已应用「${pal.name}」高级配色方案！`, "info");
    scheduleRender(20);
  });
}

async function initStudio() {
  initColorPalettes();
  try {
    const res = await fetch("/api/studio/config");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as StudioConfigResponse;

    accounts = data.accounts || {};
    currentAccount = data.defaultAccount || "default";
    pluginsList = data.plugins || [];

    // Populate account selector
    accountSelect.innerHTML = "";
    for (const [key, acc] of Object.entries(accounts)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${acc.name || key} (${key})`;
      if (key === currentAccount) opt.selected = true;
      accountSelect.appendChild(opt);
    }

    // Prefill Markdown
    editorMarkdown.value = data.sampleMarkdown || "# 微信排版标题\n\n欢迎使用 WeChat Visual Studio！";

    // Render plugins cheatsheet
    renderSyntaxCards(pluginsList);

    // Apply active account config
    applyAccountConfig(currentAccount);
  } catch (err) {
    console.error("Failed to load studio config:", err);
    showToast("无法加载配置，使用默认设置", "error");
    scheduleRender(20);
  }
}

// Event Listeners
accountSelect.addEventListener("change", () => {
  currentAccount = accountSelect.value;
  applyAccountConfig(currentAccount);
});

editorMarkdown.addEventListener("input", () => scheduleRender(40));

// Sliders
inputFontSize.addEventListener("input", () => {
  valFontSize.textContent = `${inputFontSize.value}px`;
  scheduleRender(20);
});
inputLineHeight.addEventListener("input", () => {
  valLineHeight.textContent = inputLineHeight.value;
  scheduleRender(20);
});
inputLetterSpacing.addEventListener("input", () => {
  valLetterSpacing.textContent = `${inputLetterSpacing.value}em`;
  scheduleRender(20);
});
inputParaSpacing.addEventListener("input", () => {
  valParaSpacing.textContent = `${inputParaSpacing.value}em`;
  scheduleRender(20);
});

// Color Pickers
bindColorPair(pickerBrandColor, hexBrandColor, () => scheduleRender(20));
bindColorPair(pickerTextColor, hexTextColor, () => scheduleRender(20));
bindColorPair(pickerH2Color, hexH2Color, () => scheduleRender(20));
bindColorPair(pickerH3Color, hexH3Color, () => scheduleRender(20));
bindColorPair(pickerQuoteColor, hexQuoteColor, () => scheduleRender(20));
bindColorPair(pickerDividerColor, hexDividerColor, () => scheduleRender(20));

// Switches & text inputs
switchNumberedHeadings.addEventListener("change", () => scheduleRender(20));
inputHeadingLabel.addEventListener("input", () => scheduleRender(40));
inputQuoteLabel.addEventListener("input", () => scheduleRender(40));
inputCustomCss.addEventListener("input", () => scheduleRender(60));

// Tabs
const tabBtnStyle = document.getElementById("tab-btn-style") as HTMLButtonElement;
const tabBtnSyntax = document.getElementById("tab-btn-syntax") as HTMLButtonElement;
const tabContentStyle = document.getElementById("tab-content-style") as HTMLElement;
const tabContentSyntax = document.getElementById("tab-content-syntax") as HTMLElement;

tabBtnStyle.addEventListener("click", () => {
  tabBtnStyle.classList.add("active");
  tabBtnSyntax.classList.remove("active");
  tabContentStyle.style.display = "block";
  tabContentSyntax.style.display = "none";
});

tabBtnSyntax.addEventListener("click", () => {
  tabBtnSyntax.classList.add("active");
  tabBtnStyle.classList.remove("active");
  tabContentStyle.style.display = "none";
  tabContentSyntax.style.display = "block";
});

// Load sample / clear
document.getElementById("btn-load-sample")?.addEventListener("click", async () => {
  const res = await fetch("/api/studio/config");
  const data = (await res.json()) as StudioConfigResponse;
  editorMarkdown.value = data.sampleMarkdown || "";
  scheduleRender(20);
  showToast("已加载官方全语法测试稿", "info");
});

document.getElementById("btn-clear-md")?.addEventListener("click", () => {
  editorMarkdown.value = "";
  scheduleRender(20);
});

// Toggle HTML view
document.getElementById("btn-toggle-view")?.addEventListener("click", (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  showingHtmlSource = !showingHtmlSource;
  if (showingHtmlSource) {
    htmlSourceContainer.style.display = "block";
    btn.textContent = "📱 返回视图";
  } else {
    htmlSourceContainer.style.display = "none";
    btn.textContent = "🔍 查看 HTML 源码";
  }
});

// Reset
document.getElementById("btn-reset")?.addEventListener("click", () => {
  applyAccountConfig(currentAccount);
  showToast("已重置为当前账号默认样式", "info");
});

// Save to config.json
document.getElementById("btn-save")?.addEventListener("click", async () => {
  const account = accounts[currentAccount];
  if (!account) return;
  const { structure, ...theme } = readStyleControls();
  // 页首素材由正文模板提供，不写入账号结构配置。
  const { headerImageUrl: _headerImageUrl, ...savedStructure } = structure;
  const payload = {
    account: currentAccount,
    ...theme,
    syntaxPresets: { ...currentSyntaxPresets },
    customCss: inputCustomCss.value,
    structure: savedStructure,
  };

  try {
    const res = await fetch("/api/studio/save-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      account.theme = { ...theme, structure, syntaxPresets: payload.syntaxPresets };
      account.customCssContent = payload.customCss;
      showToast("✅ 配置已成功保存至本地 config.json！", "success");
    } else {
      showToast(`保存失败: ${data.error || "未知错误"}`, "error");
    }
  } catch (err) {
    showToast(`网络请求失败: ${String(err)}`, "error");
  }
});

/** 内嵌模板 CSS 与页首图片，部署时只需复制这一份 JSON。 */
document.getElementById("btn-export-config")?.addEventListener("click", () => {
  const account = accounts[currentAccount];
  if (!account) return;
  const config = {
    schemaVersion: 1,
    engineVersion: 1,
    id: "wechat-style",
    name: "WeChat Studio 排版配置",
    version: "1.0.0",
    ...readStyleControls(),
    syntaxPresets: { ...currentSyntaxPresets },
    css: [account.articleThemeCss, inputCustomCss.value].filter(Boolean).join("\n\n"),
  };
  const url = URL.createObjectURL(new Blob([`${JSON.stringify(config, null, 2)}\n`], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "wechat-style.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("已导出独立配置，CLI 使用 --article-theme 选择该文件", "success");
});

// Copy to WeChat
document.getElementById("btn-copy")?.addEventListener("click", async () => {
  if (!latestWechatHtml) {
    showToast("文章内容为空", "error");
    return;
  }

  try {
    const blobHtml = new Blob([latestWechatHtml], { type: "text/html" });
    const blobText = new Blob([latestWechatHtml], { type: "text/plain" });
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": blobHtml,
        "text/plain": blobText,
      }),
    ]);
    showToast("📋 已复制富文本！可在微信公众号后台直接粘贴 (Cmd+V)", "success");
  } catch (err) {
    console.error("Clipboard write error:", err);
    // Fallback: execCommand copy
    const listener = (e: ClipboardEvent) => {
      e.clipboardData?.setData("text/html", latestWechatHtml);
      e.clipboardData?.setData("text/plain", latestWechatHtml);
      e.preventDefault();
    };
    document.addEventListener("copy", listener);
    document.execCommand("copy");
    document.removeEventListener("copy", listener);
    showToast("📋 已复制富文本（后备通道）", "success");
  }
});

// Start
void initStudio();
