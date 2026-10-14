import articleCss from "@akairos/milkdown-article-style/article.css?raw";
import { Editor, defaultValueCtx, rootCtx } from "@milkdown/kit/core";
import { commonmark } from "@milkdown/kit/preset/commonmark";
import { gfm } from "@milkdown/kit/preset/gfm";
import { getHTML } from "@milkdown/kit/utils";
import { getCombinedMilkdownPlugins, getCombinedDefaultCss, type WechatPluginDoc } from "@akairos/milkdown-article-plugins";
import { MynoEditor } from "./myno-editor";
import { STYLE_PACKS, type StylePack } from "./style-packs";
import { SYNTAX_CATEGORIES, buildCombinedPresetsCss } from "./syntax-presets";
import { COLOR_PALETTES } from "./color-palettes";
import { parseStyleConfig, exportStyleConfigBlob, type StandaloneStyleConfig } from "./config-manager";
import { renderWechatHtml, buildWechatThemeCss, type ArticleStructure } from "../../wechat-renderer";
import type { WechatExportTheme } from "../../themes";

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
let renderRevision = 0;
let rendering = false;
let mynoEditor: MynoEditor | null = null;
let currentEditorMode: "visual" | "source" = "visual";
let standaloneThemeName = "";

// ── DOM Elements ────────────────────────────────────────────────────────
const accountSelect = document.getElementById("account-select") as HTMLSelectElement;
const configModeBadge = document.getElementById("config-mode-badge") as HTMLElement;
const editorMarkdown = document.getElementById("editor-markdown") as HTMLTextAreaElement;
const milkdownEditorRoot = document.getElementById("milkdown-editor-root") as HTMLElement;
const previewScreen = document.getElementById("preview-screen") as HTMLElement;
const editorStats = document.getElementById("editor-stats") as HTMLElement;
const htmlSourceContainer = document.getElementById("html-source-container") as HTMLElement;
const htmlSourceCode = document.getElementById("html-source-code") as HTMLTextAreaElement;
const toastContainer = document.getElementById("toast-container") as HTMLElement;

// Sliders & Text Inputs
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

const btnModeVisual = document.getElementById("btn-mode-visual") as HTMLButtonElement;
const btnModeSource = document.getElementById("btn-mode-source") as HTMLButtonElement;

const fileImportConfig = document.getElementById("file-import-config") as HTMLInputElement;
const btnImportConfig = document.getElementById("btn-import-config") as HTMLButtonElement;
const btnExportConfig = document.getElementById("btn-export-config") as HTMLButtonElement;
const btnSave = document.getElementById("btn-save") as HTMLButtonElement;
const btnReset = document.getElementById("btn-reset") as HTMLButtonElement;
const btnCopy = document.getElementById("btn-copy") as HTMLButtonElement;
const btnToggleView = document.getElementById("btn-toggle-view") as HTMLButtonElement;
const btnLoadSample = document.getElementById("btn-load-sample") as HTMLButtonElement;
const btnClearMd = document.getElementById("btn-clear-md") as HTMLButtonElement;

// ── Toast System ────────────────────────────────────────────────────────
function showToast(message: string, type: "info" | "success" | "error" = "info") {
  if (!toastContainer) return;
  const toast = document.createElement("div");
  toast.className = `toast ${type === "success" ? "toast-success" : type === "error" ? "toast-error" : ""}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("show"));
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ── Color Picker Pairing ────────────────────────────────────────────────
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
  const text = getActiveMarkdown();
  const chars = text.replace(/\s+/g, "").length;
  const minutes = Math.max(1, Math.round(chars / 400));
  if (editorStats) {
    editorStats.textContent = `字数: ${chars.toLocaleString()} 字 | 预计阅读: ${minutes} 分钟`;
  }
}

function getActiveMarkdown(): string {
  if (currentEditorMode === "visual" && mynoEditor) {
    return mynoEditor.getMarkdown();
  }
  return editorMarkdown.value;
}

function stripLeadingH1(markdown: string): string {
  return markdown.replace(/^#\s+[^\r\n]*(?:\r?\n|$)/, "");
}

function extractFrontmatter(markdown: string): { frontmatter: Record<string, unknown> | null; content: string } {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return { frontmatter: null, content: markdown };
  return { frontmatter: {}, content: markdown.slice(match[0].length) };
}

/** 品牌色衍生的卡片底色（--brand-bg 系），非 6 位 hex 时返回 null 以保留账号默认值。 */
function brandTint(hex: string, alpha: number): string | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

// ── Read Style Controls ─────────────────────────────────────────────────
function readStyleControls() {
  const account = accounts[currentAccount] || {
    theme: { exportTheme: {}, editorVars: {}, structure: {} },
  };

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

  const brandBg = brandTint(hexBrandColor.value, 0.08);
  const brandBgDeep = brandBg && brandTint(hexBrandColor.value, 0.12);
  const editorVars = {
    ...account.theme.editorVars,
    "--brand": hexBrandColor.value,
    ...(brandBg && brandBgDeep ? { "--brand-bg": brandBg, "--brand-bg-deep": brandBgDeep } : {}),
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

// ── Live Editor Style Synchronization ───────────────────────────────────
function applyLiveEditorStyles(
  style: ReturnType<typeof readStyleControls>,
  customCss: string,
) {
  let styleTag = document.getElementById("studio-live-editor-css") as HTMLStyleElement | null;
  if (!styleTag) {
    styleTag = document.createElement("style");
    styleTag.id = "studio-live-editor-css";
    document.head.appendChild(styleTag);
  }

  const themeCss = buildWechatThemeCss(style.editorVars, style.exportTheme);
  const pluginCss = getCombinedDefaultCss();

  // Structure decorations for editor (simulating heading labels / counters)
  let structureCss = "";
  if (style.structure.numberedHeadings) {
    const labelPrefix = style.structure.headingLabel ? `"${style.structure.headingLabel} " ` : "";
    structureCss += `
.milkdown .editor {
  counter-reset: wx-heading-counter;
}
.milkdown .editor h2::before {
  counter-increment: wx-heading-counter;
  content: ${labelPrefix}counter(wx-heading-counter, decimal-leading-zero) " ";
  margin-right: 0.3em;
  opacity: 0.7;
  font-weight: 600;
}
`;
  } else if (style.structure.headingLabel) {
    structureCss += `
.milkdown .editor h2::before {
  content: "${style.structure.headingLabel} ";
  margin-right: 0.3em;
  opacity: 0.7;
  font-weight: 600;
}
`;
  }

  if (style.structure.quoteLabel) {
    structureCss += `
.milkdown .editor blockquote::before {
  content: "${style.structure.quoteLabel}";
  display: block;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.05em;
  color: var(--wx-brand-ink, var(--wx-brand-accent, #ca6093));
  margin-bottom: 6px;
  text-transform: uppercase;
}
`;
  }

  styleTag.textContent = `
/* ── Crepe resets: 后置于运行时，同特异性即可覆盖 Crepe 主题；不可用 !important，否则压过下方预设 ── */
.milkdown .ProseMirror {
  padding: 0;
}
.milkdown .ProseMirror h1,
.milkdown .ProseMirror h2,
.milkdown .ProseMirror h3,
.milkdown .ProseMirror h4,
.milkdown .ProseMirror h5,
.milkdown .ProseMirror h6 {
  padding-top: 0;
  padding-bottom: 0;
}
.milkdown .ProseMirror p {
  padding: 0;
}
.milkdown .ProseMirror blockquote {
  position: static;
  box-sizing: border-box;
}
.milkdown .ProseMirror blockquote::before {
  display: none;
}

/* ── Dynamic WeChat Theme Variables & Container Styling ── */
${themeCss}

/* ── Structure Enhancements (Numbered Headings, Chapter / Quote Labels) ── */
${structureCss}

/* ── Article Plugins Styling (Callouts, Badges, Kbd, Article Cards, etc.) ── */
${pluginCss}

/* ── Active Syntax Presets & Custom CSS Overrides ── */
${customCss}
`;
}

function refreshLiveEditorStyles() {
  const style = readStyleControls();
  const account = accounts[currentAccount];
  const customCss = [
    buildCombinedPresetsCss(currentSyntaxPresets),
    account?.articleThemeCss,
    inputCustomCss.value,
  ].filter(Boolean).join("\n\n");
  applyLiveEditorStyles(style, customCss);
}

// ── Inlined WeChat Render Pass ──────────────────────────────────────────
async function doRender() {
  if (rendering) return;
  rendering = true;
  const revision = renderRevision;
  const rawMd = getActiveMarkdown();
  const markdown = stripLeadingH1(extractFrontmatter(rawMd).content).trimStart();
  const style = readStyleControls();
  const account = accounts[currentAccount];

  const customCss = [
    buildCombinedPresetsCss(currentSyntaxPresets),
    account?.articleThemeCss,
    inputCustomCss.value,
  ].filter(Boolean).join("\n\n");

  applyLiveEditorStyles(style, customCss);

  updateStats();

  try {
    let semanticHtml = "";
    if (currentEditorMode === "visual" && mynoEditor) {
      const crepe = mynoEditor.getCrepe();
      if (crepe) {
        try {
          semanticHtml = crepe.editor.action(getHTML());
        } catch {
          // ignore and fallback
        }
      }
    }

    if (!semanticHtml) {
      const hiddenHost = document.getElementById("studio-editor-host") || document.createElement("div");
      hiddenHost.innerHTML = "";
      const editor = Editor.make()
        .config((ctx) => {
          ctx.set(rootCtx, hiddenHost);
          ctx.set(defaultValueCtx, markdown);
        })
        .use(commonmark)
        .use(gfm)
        .use(getCombinedMilkdownPlugins());
      try {
        await editor.create();
        semanticHtml = editor.action(getHTML());
      } finally {
        await editor.destroy();
      }
    }

    const inlinedHtml = await renderWechatHtml({
      semanticHtml,
      baseCss: articleCss,
      customCss,
      structure: style.structure,
      editorVars: style.editorVars,
      theme: style.exportTheme,
      strictImageDecode: false,
    });

    if (revision !== renderRevision) return;
    latestWechatHtml = inlinedHtml;
    if (previewScreen) previewScreen.innerHTML = inlinedHtml;
    if (htmlSourceCode) htmlSourceCode.value = inlinedHtml;
  } catch (error) {
    if (revision !== renderRevision) return;
    console.error("myno render error:", error);
    const message = error instanceof Error ? error.message : String(error);
    if (previewScreen) previewScreen.textContent = `渲染错误: ${message}`;
    if (htmlSourceCode) htmlSourceCode.value = "";
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
  refreshLiveEditorStyles();
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    void doRender();
  }, delay);
}

// ── Style Packs (One-Click Application) ──────────────────────────────────
function renderStylePacks() {
  const container = document.getElementById("style-packs-grid");
  if (!container) return;
  container.innerHTML = "";

  for (const pack of STYLE_PACKS) {
    const card = document.createElement("div");
    card.className = "style-pack-card";
    card.dataset.packId = pack.id;

    const head = document.createElement("div");
    head.className = "style-pack-head";

    const titleWrap = document.createElement("div");
    const name = document.createElement("span");
    name.className = "style-pack-name";
    name.textContent = pack.name;
    const sub = document.createElement("span");
    sub.className = "style-pack-subtitle";
    sub.textContent = ` · ${pack.subtitle}`;
    titleWrap.appendChild(name);
    titleWrap.appendChild(sub);

    const swatches = document.createElement("div");
    swatches.className = "style-pack-swatches";
    for (const color of pack.swatch) {
      const dot = document.createElement("span");
      dot.className = "swatch-dot";
      dot.style.background = color;
      swatches.appendChild(dot);
    }

    head.appendChild(titleWrap);
    head.appendChild(swatches);
    card.appendChild(head);

    const desc = document.createElement("div");
    desc.className = "style-pack-desc";
    desc.textContent = pack.description;
    card.appendChild(desc);

    card.addEventListener("click", () => {
      applyStylePack(pack);
      document.querySelectorAll(".style-pack-card").forEach((c) => c.classList.remove("active"));
      card.classList.add("active");
      showToast(`已套用「${pack.name}」风格套系`, "info");
    });

    container.appendChild(card);
  }
}

function applyStylePack(pack: StylePack) {
  const t = pack.theme;
  // Font Size
  inputFontSize.value = t.fontSize;
  valFontSize.textContent = `${t.fontSize}px`;
  syncSegmentedState("seg-font-size", t.fontSize);

  // Line Height
  inputLineHeight.value = t.lineHeight;
  valLineHeight.textContent = t.lineHeight;
  syncSegmentedState("seg-line-height", t.lineHeight);

  // Colors
  pickerBrandColor.value = hexBrandColor.value = t.brandColor;
  pickerTextColor.value = hexTextColor.value = t.textColor;
  pickerH2Color.value = hexH2Color.value = t.h2Color;
  pickerH3Color.value = hexH3Color.value = t.h3Color;
  pickerQuoteColor.value = hexQuoteColor.value = t.quoteColor;
  pickerDividerColor.value = hexDividerColor.value = t.dividerColor;
  syncSwatchActiveState(t.brandColor);

  // H2 Preset
  currentSyntaxPresets.h2 = t.h2Preset;
  syncPillActiveState("seg-h2-preset", t.h2Preset);

  // H3 Preset
  if (t.h3Preset) currentSyntaxPresets.h3 = t.h3Preset;

  // Numbered Headings
  switchNumberedHeadings.checked = t.numberedHeadings;

  scheduleRender(20);
}

function syncSegmentedState(containerId: string, value: string) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll(".seg-btn").forEach((btn) => {
    const el = btn as HTMLElement;
    if (el.dataset.val === value) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });
}

function syncPillActiveState(containerId: string, presetId: string) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.querySelectorAll(".pill-btn").forEach((btn) => {
    const el = btn as HTMLElement;
    if (el.dataset.preset === presetId) {
      el.classList.add("active");
    } else {
      el.classList.remove("active");
    }
  });
}

function syncSwatchActiveState(hexColor: string) {
  document.querySelectorAll(".swatch-btn").forEach((btn) => {
    const el = btn as HTMLElement;
    if (el.dataset.color?.toLowerCase() === hexColor.toLowerCase()) {
      el.style.transform = "scale(1.2)";
      el.style.boxShadow = "0 0 0 2px var(--brand)";
    } else {
      el.style.transform = "";
      el.style.boxShadow = "0 0 0 1px var(--border)";
    }
  });
}

// ── Bind Segmented Controls ─────────────────────────────────────────────
function initSegmentedControls() {
  // Font Size
  const segFontSize = document.getElementById("seg-font-size");
  segFontSize?.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = (btn as HTMLElement).dataset.val || "16";
      inputFontSize.value = val;
      valFontSize.textContent = `${val}px`;
      syncSegmentedState("seg-font-size", val);
      scheduleRender(20);
    });
  });

  // Line Height
  const segLineHeight = document.getElementById("seg-line-height");
  segLineHeight?.querySelectorAll(".seg-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = (btn as HTMLElement).dataset.val || "1.84";
      inputLineHeight.value = val;
      valLineHeight.textContent = val;
      syncSegmentedState("seg-line-height", val);
      scheduleRender(20);
    });
  });

  // Quick Swatches
  document.querySelectorAll(".swatch-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const color = (btn as HTMLElement).dataset.color || "#ca6093";
      pickerBrandColor.value = hexBrandColor.value = color;
      syncSwatchActiveState(color);
      scheduleRender(20);
    });
  });

  // H2 Pills
  const segH2 = document.getElementById("seg-h2-preset");
  segH2?.querySelectorAll(".pill-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const preset = (btn as HTMLElement).dataset.preset || "pillar";
      currentSyntaxPresets.h2 = preset;
      syncPillActiveState("seg-h2-preset", preset);
      scheduleRender(20);
    });
  });
}

// ── Syntax Presets in Accordion ─────────────────────────────────────────
function renderSyntaxPresetControls() {
  const container = document.getElementById("syntax-preset-container");
  if (!container) return;
  container.innerHTML = "";

  for (const cat of SYNTAX_CATEGORIES) {
    if (cat.key === "h2") continue; // H2 has its own pills at top level
    const group = document.createElement("div");
    group.className = "control-group";

    const header = document.createElement("div");
    header.className = "control-label";
    const title = document.createElement("span");
    title.textContent = `${cat.icon} ${cat.label}`;
    header.appendChild(title);

    const hasMultiplePresets = Boolean(cat.presets && cat.presets.length > 1);
    if (hasMultiplePresets && cat.presets) {
      const select = document.createElement("select");
      select.className = "select-control full-width";
      for (const preset of cat.presets) {
        const opt = document.createElement("option");
        opt.value = preset.id;
        opt.textContent = preset.name;
        select.appendChild(opt);
      }
      const activePresetId = currentSyntaxPresets[cat.key] || cat.defaultPresetId || cat.presets[0].id;
      select.value = activePresetId;
      select.addEventListener("change", () => {
        currentSyntaxPresets[cat.key] = select.value;
        scheduleRender(20);
      });
      group.appendChild(header);
      group.appendChild(select);
    } else {
      group.appendChild(header);
    }

    container.appendChild(group);
  }
}

// ── Tab 2: Syntax Cards ─────────────────────────────────────────────────
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
    insertBtn.textContent = "+ 插入示例到当前文章";
    insertBtn.addEventListener("click", () => {
      insertTextAtCursor(doc.sampleMarkdown);
      showToast(`已插入「${doc.name}」示例`, "info");
    });
    card.appendChild(insertBtn);

    container.appendChild(card);
  }
}

function insertTextAtCursor(text: string) {
  if (currentEditorMode === "visual" && mynoEditor) {
    const current = mynoEditor.getMarkdown();
    const updated = `${current.trimEnd()}\n\n${text}\n\n`;
    mynoEditor.setMarkdown(updated);
    editorMarkdown.value = updated;
  } else {
    const start = editorMarkdown.selectionStart;
    const end = editorMarkdown.selectionEnd;
    const original = editorMarkdown.value;
    const insertText = `\n\n${text}\n\n`;
    editorMarkdown.value = original.slice(0, start) + insertText + original.slice(end);
    editorMarkdown.focus();
    editorMarkdown.selectionStart = editorMarkdown.selectionEnd = start + insertText.length;
  }
  scheduleRender(20);
}

// ── Account & Config Loading ────────────────────────────────────────────
function applyAccountConfig(accountKey: string) {
  const account = accounts[accountKey];
  if (!account) return;

  const standalone = Boolean(account.articleThemeStandalone);
  configModeBadge.textContent = standalone ? "独立排版文件" : "账号默认配置";
  configModeBadge.className = `badge ${standalone ? "badge-primary" : "badge-subtle"}`;

  btnSave.disabled = Boolean(account.articleThemeStandalone);
  btnSave.title = account.articleThemeStandalone
    ? "当前账号引用独立配置，请通过「导出配置」保存调整后替换原文件"
    : "保存当前调整至本地 config.json 的当前账号";

  const exportTheme = account.theme?.exportTheme || {};
  const editorVars = account.theme?.editorVars || {};

  // Font Size
  const fontSize = exportTheme.bodyFontSize?.replace(/px$/, "") || "16";
  inputFontSize.value = fontSize;
  valFontSize.textContent = `${fontSize}px`;
  syncSegmentedState("seg-font-size", fontSize);

  // Line Height
  const lineHeight = exportTheme.bodyLineHeight || "1.84";
  inputLineHeight.value = lineHeight;
  valLineHeight.textContent = lineHeight;
  syncSegmentedState("seg-line-height", lineHeight);

  // Letter & Paragraph Spacing
  inputLetterSpacing.value = String(parseFloat(exportTheme.bodyLetterSpacing || "0.012em"));
  valLetterSpacing.textContent = `${inputLetterSpacing.value}em`;
  inputParaSpacing.value = String(parseFloat(exportTheme.bodyParagraphSpacing || "1.18em"));
  valParaSpacing.textContent = `${inputParaSpacing.value}em`;

  // Colors
  const brand = editorVars["--brand"] || exportTheme.primaryColor || "#ca6093";
  pickerBrandColor.value = hexBrandColor.value = brand;
  syncSwatchActiveState(brand);

  const text = exportTheme.bodyColor || editorVars["--text"] || "#292526";
  pickerTextColor.value = hexTextColor.value = text;

  if (exportTheme.h2Color) pickerH2Color.value = hexH2Color.value = exportTheme.h2Color;
  if (exportTheme.h3Color) pickerH3Color.value = hexH3Color.value = exportTheme.h3Color;

  const quote = exportTheme.blockquoteBorderColor || brand;
  pickerQuoteColor.value = hexQuoteColor.value = quote;

  const divider = exportTheme.dividerColor || editorVars["--divider"] || "#e2dcdf";
  pickerDividerColor.value = hexDividerColor.value = divider;

  inputCustomCss.value = account.customCssContent || "";

  // Syntax Presets
  const savedPresets = account.theme?.syntaxPresets || {};
  currentSyntaxPresets = {};
  for (const cat of SYNTAX_CATEGORIES) {
    if (cat.defaultPresetId) {
      currentSyntaxPresets[cat.key] = savedPresets[cat.key] || cat.defaultPresetId;
    }
  }
  syncPillActiveState("seg-h2-preset", currentSyntaxPresets.h2 || "pillar");
  renderSyntaxPresetControls();

  // Structure
  const structure = account.theme?.structure || {};
  switchNumberedHeadings.checked = Boolean(structure.numberedHeadings);
  inputHeadingLabel.value = structure.headingLabel || "";
  inputQuoteLabel.value = structure.quoteLabel || "";

  scheduleRender(20);
}

// ── Initialize Color Palettes Dropdown ───────────────────────────────────
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
    syncSwatchActiveState(pal.colors.brand);
    if (paletteDesc) paletteDesc.textContent = pal.description;
    showToast(`已套用「${pal.name}」色盘`, "info");
    scheduleRender(20);
  });
}

// ── Studio Main Initialization ──────────────────────────────────────────
async function initStudio() {
  initColorPalettes();
  initSegmentedControls();
  renderStylePacks();

  // Bind Color Pairs
  bindColorPair(pickerBrandColor, hexBrandColor, () => {
    syncSwatchActiveState(pickerBrandColor.value);
    scheduleRender(20);
  });
  bindColorPair(pickerTextColor, hexTextColor, () => scheduleRender(20));
  bindColorPair(pickerH2Color, hexH2Color, () => scheduleRender(20));
  bindColorPair(pickerH3Color, hexH3Color, () => scheduleRender(20));
  bindColorPair(pickerQuoteColor, hexQuoteColor, () => scheduleRender(20));
  bindColorPair(pickerDividerColor, hexDividerColor, () => scheduleRender(20));

  try {
    const res = await fetch("/api/studio/config");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as StudioConfigResponse;

    accounts = data.accounts || {};
    currentAccount = data.defaultAccount || "default";
    pluginsList = data.plugins || [];

    // Account selector
    accountSelect.innerHTML = "";
    for (const [key, acc] of Object.entries(accounts)) {
      const opt = document.createElement("option");
      opt.value = key;
      opt.textContent = `${acc.name || key} (${key})`;
      if (key === currentAccount) opt.selected = true;
      accountSelect.appendChild(opt);
    }

    const initialMd = data.sampleMarkdown || "# 微信排版标题\n\n欢迎使用 myno 微信排版工作台！";
    editorMarkdown.value = initialMd;

    // Mount MynoEditor (Milkdown Crepe)
    if (milkdownEditorRoot) {
      mynoEditor = new MynoEditor({
        root: milkdownEditorRoot,
        defaultValue: initialMd,
        onMarkdownChange: (md) => {
          editorMarkdown.value = md;
          scheduleRender(40);
        },
      });
      await mynoEditor.create();
    }

    renderSyntaxCards(pluginsList);
    applyAccountConfig(currentAccount);
  } catch (err) {
    console.error("Failed to load studio config:", err);
    showToast("无法加载服务器配置，使用本地默认设置", "error");
    scheduleRender(20);
  }
}

// ── Event Handlers ──────────────────────────────────────────────────────
accountSelect.addEventListener("change", () => {
  currentAccount = accountSelect.value;
  applyAccountConfig(currentAccount);
});

editorMarkdown.addEventListener("input", () => {
  // 源码模式下 textarea 是编辑面；视觉模式下它隐藏，但仍可能被脚本/按钮更新，需回同步给 Crepe
  if (mynoEditor) {
    mynoEditor.setMarkdown(editorMarkdown.value);
  }
  scheduleRender(40);
});

// Dual Mode Switcher
btnModeVisual.addEventListener("click", () => {
  if (currentEditorMode === "visual") return;
  currentEditorMode = "visual";
  btnModeVisual.classList.add("active");
  btnModeSource.classList.remove("active");
  milkdownEditorRoot.style.display = "block";
  editorMarkdown.style.display = "none";
  if (mynoEditor) {
    mynoEditor.setMarkdown(editorMarkdown.value);
  }
  refreshLiveEditorStyles();
  showToast("已切换至所见即所得编辑模式", "info");
});

btnModeSource.addEventListener("click", () => {
  if (currentEditorMode === "source") return;
  currentEditorMode = "source";
  btnModeSource.classList.add("active");
  btnModeVisual.classList.remove("active");
  if (mynoEditor) {
    editorMarkdown.value = mynoEditor.getMarkdown();
  }
  milkdownEditorRoot.style.display = "none";
  editorMarkdown.style.display = "block";
  editorMarkdown.focus();
  showToast("已切换至 Markdown 源码模式", "info");
});

// Sliders and Text Inputs
inputFontSize.addEventListener("input", () => {
  valFontSize.textContent = `${inputFontSize.value}px`;
  syncSegmentedState("seg-font-size", inputFontSize.value);
  scheduleRender(20);
});
inputLineHeight.addEventListener("input", () => {
  valLineHeight.textContent = inputLineHeight.value;
  syncSegmentedState("seg-line-height", inputLineHeight.value);
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

switchNumberedHeadings.addEventListener("change", () => scheduleRender(20));
inputHeadingLabel.addEventListener("input", () => scheduleRender(40));
inputQuoteLabel.addEventListener("input", () => scheduleRender(40));
inputCustomCss.addEventListener("input", () => scheduleRender(60));

// Tabs
const tabBtnStyle = document.getElementById("tab-btn-style") as HTMLButtonElement;
const tabBtnSyntax = document.getElementById("tab-btn-syntax") as HTMLButtonElement;
const tabContentStyle = document.getElementById("tab-content-style") as HTMLElement;
const tabContentSyntax = document.getElementById("tab-content-syntax") as HTMLElement;

tabBtnStyle?.addEventListener("click", () => {
  tabBtnStyle.classList.add("active");
  tabBtnSyntax.classList.remove("active");
  tabContentStyle.style.display = "block";
  tabContentSyntax.style.display = "none";
});

tabBtnSyntax?.addEventListener("click", () => {
  tabBtnSyntax.classList.add("active");
  tabBtnStyle.classList.remove("active");
  tabContentStyle.style.display = "none";
  tabContentSyntax.style.display = "block";
});

// Load sample / clear
btnLoadSample?.addEventListener("click", async () => {
  const res = await fetch("/api/studio/config");
  const data = (await res.json()) as StudioConfigResponse;
  const sample = data.sampleMarkdown || "";
  editorMarkdown.value = sample;
  if (mynoEditor) mynoEditor.setMarkdown(sample);
  scheduleRender(20);
  showToast("已加载全语法官方测试稿", "info");
});

btnClearMd?.addEventListener("click", () => {
  editorMarkdown.value = "";
  if (mynoEditor) mynoEditor.setMarkdown("");
  scheduleRender(20);
});

// Toggle HTML view
btnToggleView?.addEventListener("click", () => {
  showingHtmlSource = !showingHtmlSource;
  if (showingHtmlSource) {
    htmlSourceContainer.style.display = "block";
    btnToggleView.textContent = "📱 返回视图";
  } else {
    htmlSourceContainer.style.display = "none";
    btnToggleView.textContent = "🔍 HTML 源码";
  }
});

// Reset
btnReset?.addEventListener("click", () => {
  applyAccountConfig(currentAccount);
  showToast("已重置为当前账号默认样式", "info");
});

// Save to config.json
btnSave?.addEventListener("click", async () => {
  const account = accounts[currentAccount];
  if (!account) return;
  const { structure, ...theme } = readStyleControls();
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

// Export Config (wechat-style.json)
btnExportConfig?.addEventListener("click", () => {
  const account = accounts[currentAccount];
  if (!account) return;
  const styleConfig: StandaloneStyleConfig = {
    schemaVersion: 1,
    engineVersion: 1,
    id: standaloneThemeName || "wechat-style",
    name: "myno WeChat 排版配置",
    version: "1.0.0",
    ...readStyleControls(),
    syntaxPresets: { ...currentSyntaxPresets },
    css: [account.articleThemeCss, inputCustomCss.value].filter(Boolean).join("\n\n"),
  };

  const { url, filename } = exportStyleConfigBlob(styleConfig);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("已导出独立排版文件，CLI 使用 --article-theme 引用该文件", "success");
});

// Import Config (wechat-style.json)
btnImportConfig?.addEventListener("click", () => {
  fileImportConfig.click();
});

fileImportConfig?.addEventListener("change", () => {
  const file = fileImportConfig.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const content = reader.result as string;
    const result = parseStyleConfig(content);
    if (!result.ok) {
      showToast(`导入失败: ${result.error}`, "error");
      return;
    }
    const cfg = result.config;
    standaloneThemeName = cfg.id || file.name.replace(/\.json$/i, "");

    // Apply values to UI
    if (cfg.exportTheme.bodyFontSize) {
      const fs = cfg.exportTheme.bodyFontSize.replace(/px$/, "");
      inputFontSize.value = fs;
      valFontSize.textContent = `${fs}px`;
      syncSegmentedState("seg-font-size", fs);
    }
    if (cfg.exportTheme.bodyLineHeight) {
      inputLineHeight.value = cfg.exportTheme.bodyLineHeight;
      valLineHeight.textContent = cfg.exportTheme.bodyLineHeight;
      syncSegmentedState("seg-line-height", cfg.exportTheme.bodyLineHeight);
    }
    if (cfg.exportTheme.primaryColor || cfg.editorVars["--brand"]) {
      const brand = cfg.exportTheme.primaryColor || cfg.editorVars["--brand"];
      pickerBrandColor.value = hexBrandColor.value = brand;
      syncSwatchActiveState(brand);
    }
    if (cfg.exportTheme.bodyColor || cfg.editorVars["--text"]) {
      pickerTextColor.value = hexTextColor.value = cfg.exportTheme.bodyColor || cfg.editorVars["--text"];
    }
    if (cfg.exportTheme.h2Color) pickerH2Color.value = hexH2Color.value = cfg.exportTheme.h2Color;
    if (cfg.exportTheme.h3Color) pickerH3Color.value = hexH3Color.value = cfg.exportTheme.h3Color;
    if (cfg.exportTheme.blockquoteBorderColor) pickerQuoteColor.value = hexQuoteColor.value = cfg.exportTheme.blockquoteBorderColor;
    if (cfg.exportTheme.dividerColor) pickerDividerColor.value = hexDividerColor.value = cfg.exportTheme.dividerColor;

    if (cfg.syntaxPresets) {
      currentSyntaxPresets = { ...cfg.syntaxPresets };
      if (currentSyntaxPresets.h2) syncPillActiveState("seg-h2-preset", currentSyntaxPresets.h2);
    }
    if (cfg.structure) {
      switchNumberedHeadings.checked = Boolean(cfg.structure.numberedHeadings);
      inputHeadingLabel.value = cfg.structure.headingLabel || "";
      inputQuoteLabel.value = cfg.structure.quoteLabel || "";
    }
    if (cfg.css) {
      inputCustomCss.value = cfg.css;
    }

    configModeBadge.textContent = `独立配置: ${file.name}`;
    configModeBadge.className = "badge badge-primary";
    showToast(`✅ 成功导入独立配置: ${file.name}`, "success");
    scheduleRender(20);
  };
  reader.readAsText(file);
});

// Copy to WeChat
btnCopy?.addEventListener("click", async () => {
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
