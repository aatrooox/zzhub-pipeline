import { Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getHTML } from "@milkdown/kit/utils";
import articleCss from "@zzclub/milkdown-article-style/article.css?raw";
import { getCombinedMilkdownPlugins } from "../../plugins/registry";
import { renderWechatHtml } from "../../wechat-renderer";
import type { WechatPluginDoc } from "../../plugins/types";
import type { ArticleStructure } from "../../wechat-renderer";
import type { WechatExportTheme } from "../../themes";
import { SYNTAX_CATEGORIES, buildCombinedPresetsCss } from "./syntax-presets";

interface AccountData {
  name: string;
  customCssPath: string | null;
  customCssContent: string;
  theme: {
    editorVars: Record<string, string>;
    exportTheme: Partial<WechatExportTheme>;
    syntaxPresets?: Record<string, string>;
  };
  articleTheme?: string | null;
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

async function doRender() {
  const markdown = editorMarkdown.value;
  updateStats();

  try {
    // 1. Run Milkdown in hidden host to obtain semantic HTML
    hiddenHost.innerHTML = "";
    const editor = Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, hiddenHost);
        ctx.set(defaultValueCtx, markdown);
      })
      .use(commonmark)
      .use(gfm)
      .use(getCombinedMilkdownPlugins());

    await editor.create();
    const rawSemanticHtml = editor.action(getHTML());
    await editor.destroy();

    // 2. Build parameters from controls
    const fontSize = Number(inputFontSize.value) || 16;
    const lineHeight = inputLineHeight.value || "1.84";
    const letterSpacing = `${inputLetterSpacing.value}em`;
    const paraSpacing = `${inputParaSpacing.value}em`;

    const brandColor = hexBrandColor.value || "#ca6093";
    const textColor = hexTextColor.value || "#292526";
    const h2Color = hexH2Color.value || "#1f1b1c";
    const h3Color = hexH3Color.value || "#5c5658";
    const quoteColor = hexQuoteColor.value || "#ca6093";
    const dividerColor = hexDividerColor.value || "#dadce0";

    const baseExportTheme = accounts[currentAccount]?.theme?.exportTheme || {};
    const baseEditorVars = accounts[currentAccount]?.theme?.editorVars || {};

    const containerStyle = [
      "max-width: 100%",
      "margin: 0",
      "padding: 10px 4px 30px",
      "background: #ffffff",
      "box-sizing: border-box",
      "font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
      `font-size: ${fontSize}px`,
      `color: ${textColor}`,
      "overflow-wrap: break-word",
      "word-break: break-word",
      `line-height: ${lineHeight}`,
      `letter-spacing: ${letterSpacing}`,
      "-webkit-text-size-adjust: 100%",
    ].join("; ");

    const exportTheme: WechatExportTheme = {
      ...baseExportTheme,
      containerStyle,
      footerText: baseExportTheme.footerText ?? "",
      footerStyle: baseExportTheme.footerStyle ?? "margin-top: 32px; text-align: center; font-size: 12px; color: #6f696b;",
      fontFamily: baseExportTheme.fontFamily || "-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",
      bodyColor: textColor,
      mutedColor: baseExportTheme.mutedColor || "#5f6368",
      h2Color,
      h3Color,
      primaryColor: brandColor,
      dividerColor,
      blockquoteBorderColor: quoteColor,
      bodyLineHeight: lineHeight,
      bodyLetterSpacing: letterSpacing,
    };

    const editorVars: Record<string, string> = {
      ...baseEditorVars,
      "--primary": brandColor,
      "--brand": brandColor,
      "--brand-soft": baseEditorVars["--brand-soft"] || brandColor,
      "--brand-bg": baseEditorVars["--brand-bg"] || "rgba(202, 96, 147, 0.08)",
      "--text": textColor,
      "--divider": dividerColor,
    };

    const structure: ArticleStructure = {
      numberedHeadings: switchNumberedHeadings.checked,
      headingLabel: inputHeadingLabel.value.trim() || undefined,
      quoteLabel: inputQuoteLabel.value.trim() || undefined,
    };

    const combinedPresetsCss = buildCombinedPresetsCss(currentSyntaxPresets);

    const customCssWithPara = [
      combinedPresetsCss,
      inputCustomCss.value,
      `.milkdown .editor p { margin: 0 0 ${paraSpacing}; }`,
    ].filter(Boolean).join("\n\n");

    // 3. Render inlined WeChat HTML
    const inlinedHtml = await renderWechatHtml({
      semanticHtml: rawSemanticHtml,
      baseCss: articleCss,
      customCss: customCssWithPara,
      structure,
      editorVars,
      theme: exportTheme,
    });

    latestWechatHtml = inlinedHtml;
    previewScreen.innerHTML = inlinedHtml;
    htmlSourceCode.value = inlinedHtml;
  } catch (error) {
    console.error("Studio render error:", error);
    const msg = error instanceof Error ? error.message : String(error);
    previewScreen.innerHTML = `<div style="color:#b91c1c;padding:16px;background:#fef2f2;border-radius:8px;">渲染错误: ${msg}</div>`;
  }
}

function scheduleRender(delay = 60) {
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
    group.appendChild(header);

    const select = document.createElement("select");
    select.className = "preset-select";
    select.dataset.category = cat.key;

    for (const preset of cat.presets) {
      const opt = document.createElement("option");
      opt.value = preset.id;
      opt.textContent = preset.name;
      select.appendChild(opt);
    }

    const activePresetId = currentSyntaxPresets[cat.key] || cat.defaultPresetId;
    select.value = activePresetId;
    group.appendChild(select);

    const desc = document.createElement("div");
    desc.className = "preset-desc";
    const activePreset = cat.presets.find((p) => p.id === activePresetId) || cat.presets[0];
    desc.textContent = activePreset?.description || "";
    group.appendChild(desc);

    select.addEventListener("change", () => {
      currentSyntaxPresets[cat.key] = select.value;
      const p = cat.presets.find((preset) => preset.id === select.value);
      desc.textContent = p?.description || "";
      scheduleRender(20);
    });

    container.appendChild(group);
  }
}

function applyAccountConfig(accountKey: string) {
  const account = accounts[accountKey];
  if (!account) return;

  const exportTheme = account.theme?.exportTheme || {};
  const editorVars = account.theme?.editorVars || {};

  // 1. Font size
  if (exportTheme.containerStyle) {
    const match = exportTheme.containerStyle.match(/font-size:\s*(\d+)px/);
    if (match) {
      inputFontSize.value = match[1];
      valFontSize.textContent = `${match[1]}px`;
    }
  }

  // 2. Line height
  if (exportTheme.bodyLineHeight) {
    inputLineHeight.value = exportTheme.bodyLineHeight;
    valLineHeight.textContent = exportTheme.bodyLineHeight;
  }

  // 3. Letter spacing (e.g. "0.03em")
  if (exportTheme.bodyLetterSpacing) {
    const spacingNum = parseFloat(exportTheme.bodyLetterSpacing);
    if (!isNaN(spacingNum)) {
      inputLetterSpacing.value = String(spacingNum);
      valLetterSpacing.textContent = `${spacingNum}em`;
    }
  }

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
    currentSyntaxPresets[cat.key] = savedPresets[cat.key] || cat.defaultPresetId;
  }
  renderSyntaxPresetControls();

  scheduleRender(20);
}

async function initStudio() {
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
  const fontSize = Number(inputFontSize.value) || 16;
  const lineHeight = inputLineHeight.value || "1.84";
  const letterSpacing = `${inputLetterSpacing.value}em`;

  const brandColor = hexBrandColor.value;
  const textColor = hexTextColor.value;
  const h2Color = hexH2Color.value;
  const h3Color = hexH3Color.value;
  const quoteColor = hexQuoteColor.value;
  const dividerColor = hexDividerColor.value;

  const baseEditorVars = accounts[currentAccount]?.theme?.editorVars || {};
  const baseExportTheme = accounts[currentAccount]?.theme?.exportTheme || {};

  const payload = {
    account: currentAccount,
    editorVars: {
      ...baseEditorVars,
      "--primary": brandColor,
      "--brand": brandColor,
      "--text": textColor,
      "--divider": dividerColor,
    },
    exportTheme: {
      ...baseExportTheme,
      fontSize: `${fontSize}px`,
      bodyColor: textColor,
      h2Color,
      h3Color,
      primaryColor: brandColor,
      dividerColor,
      blockquoteBorderColor: quoteColor,
      bodyLineHeight: lineHeight,
      bodyLetterSpacing: letterSpacing,
    },
    syntaxPresets: currentSyntaxPresets,
    customCss: inputCustomCss.value,
    structure: {
      numberedHeadings: switchNumberedHeadings.checked,
      headingLabel: inputHeadingLabel.value.trim() || undefined,
      quoteLabel: inputQuoteLabel.value.trim() || undefined,
    },
  };

  try {
    const res = await fetch("/api/studio/save-config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (res.ok && data.ok) {
      if (accounts[currentAccount]?.theme) {
        accounts[currentAccount].theme.syntaxPresets = { ...currentSyntaxPresets };
      }
      showToast("✅ 配置已成功保存至本地 config.json！", "success");
    } else {
      showToast(`保存失败: ${data.error || "未知错误"}`, "error");
    }
  } catch (err) {
    showToast(`网络请求失败: ${String(err)}`, "error");
  }
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
