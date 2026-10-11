export interface SyntaxPreset {
  id: string;
  name: string;
  description: string;
  css: string;
}

export interface SyntaxCategory {
  key: string;
  label: string;
  icon: string;
  defaultPresetId?: string;
  presets?: SyntaxPreset[];
  css?: string;
  description?: string;
}

export const SYNTAX_CATEGORIES: SyntaxCategory[] = [
  // ── 标题体系 ──────────────────────────────────────────────
  {
    key: "h1",
    label: "一级标题 (H1)",
    icon: "👑",
    description: "文章大标题：26px，加粗，紧贴后续正文，无边框背景修饰",
    css: `.milkdown .editor h1 {
  margin: 2.45em 0 0.85em;
  color: var(--wx-h2-color, #1f1b1c);
  font-size: 26px;
  font-weight: 700;
  line-height: 1.38;
  letter-spacing: -0.01em;
}`,
  },
  {
    key: "h2",
    label: "二级标题 (H2)",
    icon: "📌",
    defaultPresetId: "pillar",
    presets: [
      {
        id: "pillar",
        name: "左侧呼吸柱（推荐）",
        description: "2.5px 品牌色垂直微线 + 9px 内边距 + 2.8em 非对称呼吸留白",
        css: `.milkdown .editor h2 {
  margin: 2.8em 0 0.65em;
  padding-left: 9px;
  border-left: 2.5px solid var(--wx-brand-accent, #ca6093);
  border-bottom: none;
  background: none;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.36;
  letter-spacing: 0.01em;
  color: var(--wx-h2-color, #1f1b1c);
}`,
      },
      {
        id: "bottom-line",
        name: "极浅底部分割",
        description: "1px 细底线 + 紧凑下边距 + 3.0em 开阔章节上留白",
        css: `.milkdown .editor h2 {
  margin: 3.0em 0 0.8em;
  padding-bottom: 0.45em;
  padding-left: 0;
  border-left: none;
  border-bottom: 1px solid var(--wx-divider-color, #ebe6e8);
  background: none;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: 0.015em;
  color: var(--wx-h2-color, #1f1b1c);
}`,
      },
      {
        id: "gradient-pill",
        name: "渐变微衬底（背景色块）",
        description: "水平柔和渐变微底色 + 左侧 3px 标柱 + 4px 圆角",
        css: `.milkdown .editor h2 {
  margin: 2.8em 0 0.7em;
  padding: 7px 14px;
  border-left: 3px solid var(--wx-brand-accent, #ca6093);
  border-bottom: none;
  background: linear-gradient(90deg, rgba(202, 96, 147, 0.09) 0%, rgba(202, 96, 147, 0.01) 100%);
  border-radius: 4px;
  font-size: 19px;
  font-weight: 700;
  line-height: 1.38;
  letter-spacing: 0.01em;
  color: var(--wx-h2-color, #1f1b1c);
}`,
      },
      {
        id: "contrast-green",
        name: "反差色绿底（白字反色块）",
        description: "高级生态绿底色 + 纯白文字 + 4px 圆角 + 8px 14px 饱满内边距",
        css: `.milkdown .editor h2 {
  margin: 2.8em 0 0.8em;
  padding: 8px 14px;
  background-color: #1f7a4d;
  border-left: none;
  border-bottom: none;
  border-radius: 4px;
  color: #ffffff;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.36;
  letter-spacing: 0.02em;
}
.milkdown .editor h2 span {
  color: #ffffff;
}`,
      },
      {
        id: "card-tag",
        name: "温润小卡片",
        description: "包裹式浅色暖底 + 居左微内边距 + 紧实字号",
        css: `.milkdown .editor h2 {
  margin: 2.7em 0 0.75em;
  padding: 6px 12px;
  border-left: none;
  border-bottom: none;
  background-color: var(--wx-soft-surface, #faf8f9);
  border-radius: 4px;
  font-size: 18px;
  font-weight: 700;
  line-height: 1.4;
  letter-spacing: 0.01em;
  color: var(--wx-h2-color, #1f1b1c);
}`,
      },
      {
        id: "plain",
        name: "经典纯文字",
        description: "纯字号与字重，无边框与背景修饰",
        css: `.milkdown .editor h2 {
  margin: 2.7em 0 0.7em;
  padding: 0;
  border-left: none;
  border-bottom: none;
  background: none;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.38;
  letter-spacing: 0.005em;
  color: var(--wx-h2-color, #1f1b1c);
}`,
      },
    ],
  },
  {
    key: "h3",
    label: "三级标题 (H3)",
    icon: "🔹",
    defaultPresetId: "plain",
    presets: [
      {
        id: "plain",
        name: "经典纯文字（默认）",
        description: "16px，深灰次级字色，font-weight 700",
        css: `.milkdown .editor h3 {
  margin: 1.55em 0 0.4em;
  padding-left: 0;
  border-left: none;
  background: none;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.48;
  letter-spacing: 0.02em;
  color: var(--wx-h3-color, #5c5658);
}`,
      },
      {
        id: "left-bar",
        name: "左侧微短线",
        description: "2px 细色柱 + 7px 内边距",
        css: `.milkdown .editor h3 {
  margin: 1.6em 0 0.45em;
  padding-left: 7px;
  border-left: 2px solid var(--wx-brand-accent, #ca6093);
  background: none;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.45;
  letter-spacing: 0.015em;
  color: var(--wx-h3-color, #5c5658);
}`,
      },
      {
        id: "badge",
        name: "胶囊小微标",
        description: "行内微底色衬托，紧凑突出",
        css: `.milkdown .editor h3 {
  display: inline-block;
  margin: 1.6em 0 0.45em;
  padding: 3px 8px;
  border-left: none;
  background-color: var(--wx-soft-surface, #faf8f9);
  border-radius: 3px;
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
  color: var(--wx-brand-ink, #ca6093);
}`,
      },
    ],
  },
  {
    key: "h4",
    label: "四级/次级标题 (H4-H6)",
    icon: "🔸",
    description: "更低层级小标题：16px 次深灰，1.55 行高，紧贴段落",
    css: `.milkdown .editor h4,
.milkdown .editor h5,
.milkdown .editor h6 {
  margin: 1.45em 0 0.45em;
  color: var(--wx-h3-color, #5c5658);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.55;
  letter-spacing: 0.02em;
}`,
  },

  // ── 正文与行内样式 ─────────────────────────────────────────
  {
    key: "p",
    label: "正文段落 (Paragraph)",
    icon: "📄",
    description: "标准段落：两端对齐，排版行高 1.84，下边距 1.2em",
    css: `.milkdown .editor p {
  margin: 0 0 1.2em;
  color: var(--wx-body-color, #292526);
  font-size: 16px;
  line-height: 1.84;
  letter-spacing: 0.012em;
  text-align: justify;
}`,
  },
  {
    key: "strong",
    label: "加粗与斜体 (Bold / Italic)",
    icon: "🖋️",
    description: "重点强调：深沉字重 700 与斜体字色跟随",
    css: `.milkdown .editor strong,
.milkdown .editor b {
  color: var(--wx-body-color, #292526);
  font-weight: 700;
}
.milkdown .editor em,
.milkdown .editor i {
  color: var(--wx-body-color, #292526);
  font-style: italic;
}`,
  },
  {
    key: "del",
    label: "删除线 (Strikethrough)",
    icon: "✂️",
    description: "废弃内容：静音深灰与中线划除",
    css: `.milkdown .editor s,
.milkdown .editor del {
  color: var(--wx-muted-color, #6f696b);
  text-decoration: line-through;
  text-decoration-color: var(--wx-muted-color, #6f696b);
}`,
  },
  {
    key: "mark",
    label: "文本高亮 (Mark ==...==)",
    icon: "🖍️",
    description: "马克笔荧光衬底：柔和品牌色淡背景 + 1.5px 下划强调线",
    css: `.milkdown .editor mark {
  margin: 0 2px;
  padding: 2px 5px;
  background-color: rgba(202, 96, 147, 0.16);
  color: var(--wx-body-color, #292526);
  border-radius: 3px;
  border-bottom: 1.5px solid var(--wx-brand-accent, #ca6093);
}`,
  },
  {
    key: "inline-code",
    label: "行内代码 (Inline Code)",
    icon: "💻",
    description: "行内等宽代码：14px，等宽字体，浅色微边框衬底",
    css: `.milkdown .editor code:not(pre code),
.milkdown .editor [data-wechat-node="inline-code"] {
  margin: 0 2px;
  padding: 2px 6px;
  border: 1px solid var(--wx-divider-color, #ded9db);
  border-radius: 4px;
  background-color: var(--wx-soft-surface, #f7f5f6);
  color: #4d484a;
  font-family: Menlo, Monaco, Consolas, monospace;
  font-size: 14px;
  line-height: 1.55;
}`,
  },

  // ── 容器与代码块 ─────────────────────────────────────────
  {
    key: "code-block",
    label: "代码块 (Code Block)",
    icon: "📟",
    description: "多行代码框：浅灰底色，6px 圆角，深色等宽字符与水平横滚",
    css: `.milkdown .editor pre {
  margin: 1.55em 0;
  padding: 14px 16px;
  border: 1px solid var(--wx-divider-color, #e2dcdf);
  border-radius: 6px;
  background-color: var(--wx-soft-surface, #f8fafc);
  color: var(--wx-body-color, #292526);
  font-family: Menlo, Monaco, Consolas, monospace;
  font-size: 13px;
  line-height: 1.72;
  overflow-x: auto;
}
.milkdown .editor pre code {
  font-family: inherit;
  font-size: inherit;
}`,
  },
  {
    key: "blockquote",
    label: "引用块 (Blockquote)",
    icon: "💬",
    defaultPresetId: "left-border",
    presets: [
      {
        id: "left-border",
        name: "经典左单线（默认）",
        description: "3px 品牌色微边框 + 浅灰底色 + 4px 右圆角",
        css: `.milkdown .editor blockquote {
  margin: 1.6em 0;
  padding: 10px 16px;
  border: none;
  border-left: 3px solid var(--wx-blockquote-border, #ca6093);
  border-radius: 0 4px 4px 0;
  background-color: var(--wx-soft-surface, #fbfafb);
}`,
      },
      {
        id: "tint-card",
        name: "全包裹微卡片",
        description: "四边 1px 极细边框 + 6px 圆角，整体成盒",
        css: `.milkdown .editor blockquote {
  margin: 1.6em 0;
  padding: 12px 18px;
  border: 1px solid var(--wx-divider-color, #ebe6e8);
  border-radius: 6px;
  background-color: var(--wx-soft-surface, #fbfafb);
}`,
      },
      {
        id: "minimal-indent",
        name: "极简纯缩进",
        description: "无底色，仅左侧细灰线与自然缩进",
        css: `.milkdown .editor blockquote {
  margin: 1.5em 0;
  padding: 6px 0 6px 16px;
  border: none;
  border-left: 2px solid rgba(0, 0, 0, 0.15);
  border-radius: 0;
  background: none;
}`,
      },
    ],
  },
  {
    key: "list",
    label: "列表 (Unordered & Ordered)",
    icon: "📋",
    description: "标准列表：自然外缩进，1.78 行高，小圆点与阿拉伯数字序号",
    css: `.milkdown .editor ul,
.milkdown .editor ol {
  margin: 1.05em 0 1.3em;
  padding-left: 1.6em;
  color: var(--wx-body-color, #292526);
}
.milkdown .editor li {
  margin: 0.4em 0;
  line-height: 1.78;
}
.milkdown .editor li p {
  margin: 0.15em 0;
}`,
  },
  {
    key: "task-list",
    label: "任务清单 (Task List)",
    icon: "☑️",
    description: "待办复选框：品牌色勾选标记，紧凑缩进",
    css: `.milkdown .editor [data-wechat-node="task-list-item"] {
  list-style: none;
}
.milkdown .editor [data-wechat-node="task-marker"] {
  display: inline-block;
  min-width: 1.35em;
  color: var(--wx-brand-accent, #ca6093);
  font-weight: 700;
}`,
  },
  {
    key: "divider",
    label: "分割线 (Divider)",
    icon: "➖",
    defaultPresetId: "hairline",
    presets: [
      {
        id: "hairline",
        name: "极细实线（默认）",
        description: "1px 浅灰色水平实线",
        css: `.milkdown .editor hr {
  margin: 2.4em 0;
  width: 100%;
  border: none;
  border-top: 1px solid var(--wx-divider-color, #e2dcdf);
}`,
      },
      {
        id: "dashed",
        name: "极简虚线",
        description: "1px 虚线划分节奏",
        css: `.milkdown .editor hr {
  margin: 2.4em 0;
  width: 100%;
  border: none;
  border-top: 1px dashed var(--wx-divider-color, #d4cecf);
}`,
      },
      {
        id: "short-center",
        name: "居中短呼吸线",
        description: "宽度 36%，居中呼吸线",
        css: `.milkdown .editor hr {
  margin: 2.8em auto;
  width: 36%;
  border: none;
  border-top: 1px solid var(--wx-divider-color, #e2dcdf);
}`,
      },
    ],
  },

  // ── 媒体、链接与表格 ─────────────────────────────────────────
  {
    key: "link",
    label: "超链接与附注 (Links & Ref)",
    icon: "🔗",
    description: "文章链接与文末尾注：品牌色下划细线与上标数字角标",
    css: `.milkdown .editor a,
.milkdown .editor [data-wechat-node="external-link"] {
  border-bottom: 1px solid var(--wx-brand-accent, #ca6093);
  color: var(--wx-brand-accent, #ca6093);
  text-decoration: none;
}
.milkdown .editor [data-wechat-node="link-marker"] {
  margin-left: 2px;
  color: var(--wx-brand-accent, #ca6093);
  font-size: 11px;
  vertical-align: super;
}`,
  },
  {
    key: "image",
    label: "图片与图注 (Image & Caption)",
    icon: "🖼️",
    description: "文章插图与下方图注：居中包裹，4px 微圆角与 13px 浅灰居中说明",
    css: `.milkdown .editor figure,
.milkdown .editor [data-wechat-node="image-block"] {
  margin: 1.65em 0 1.8em;
  text-align: center;
}
.milkdown .editor img {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
  border-radius: 4px;
}
.milkdown .editor figcaption,
.milkdown .editor [data-wechat-node="image-caption"] {
  margin-top: 8px;
  color: var(--wx-muted-color, #6f696b);
  font-size: 13px;
  line-height: 1.62;
  text-align: center;
}`,
  },
  {
    key: "table",
    label: "数据表格 (Table)",
    icon: "📊",
    description: "数据对比表格：折叠边框，浅暖色表头背景，紧凑对齐内边距",
    css: `.milkdown .editor table {
  width: 100%;
  margin: 1.5em 0;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 14px;
  line-height: 1.62;
}
.milkdown .editor th,
.milkdown .editor td {
  padding: 8px 10px;
  border: 1px solid var(--wx-divider-color, #e2dcdf);
  text-align: left;
}
.milkdown .editor th {
  background-color: var(--wx-soft-surface, #faf8f9);
  color: var(--wx-h2-color, #1f1b1c);
  font-weight: 700;
}`,
  },

  // ── 扩展组件 ───────────────────────────────────────────────
  {
    key: "callout",
    label: "扩展：提示卡片 (Callout Alert)",
    icon: "💡",
    description: "高亮提示盒：左侧品牌色标线，浅底色包裹与加粗小标",
    css: `.milkdown .editor [data-wechat-node="callout"] {
  margin: 1.4em 0;
  padding: 12px 16px;
  border-left: 3px solid var(--wx-brand-accent, #ca6093);
  border-radius: 0 6px 6px 0;
  background-color: var(--wx-soft-surface, #fbfafb);
}
.milkdown .editor [data-wechat-node="callout-header"],
.milkdown .editor .wechat-callout-header {
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 6px;
  color: var(--wx-h2-color, #1f1b1c);
}`,
  },
  {
    key: "kbd",
    label: "扩展：键盘键帽 (Kbd Key)",
    icon: "⌨️",
    description: "按键徽章：立体立体阴影边框，12px 等宽字体",
    css: `.milkdown .editor kbd,
.milkdown .editor [data-wechat-node="kbd"] {
  display: inline-block;
  margin: 0 3px;
  padding: 2px 6px;
  font-family: Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
  color: #374151;
  background-color: #f3f4f6;
  border: 1px solid #d1d5db;
  border-bottom: 2px solid #9ca3af;
  border-radius: 4px;
  line-height: 1.3;
}`,
  },
  {
    key: "badge",
    label: "扩展：彩色徽章 (Badge Pill)",
    icon: "🏷️",
    description: "胶囊微标签：全圆角胶囊底色，紧凑居中",
    css: `.milkdown .editor [data-wechat-node="badge"] {
  display: inline-block;
  margin: 0 2px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 9999px;
  line-height: 1.3;
  background-color: rgba(202, 96, 147, 0.12);
  color: var(--wx-brand-accent, #ca6093);
}`,
  },
];

export function buildCombinedPresetsCss(selected: Record<string, string>): string {
  const cssBlocks: string[] = [];
  for (const cat of SYNTAX_CATEGORIES) {
    if (cat.presets && cat.presets.length > 1) {
      const selectedId = selected[cat.key] || cat.defaultPresetId || cat.presets[0].id;
      const preset = cat.presets.find((p) => p.id === selectedId) || cat.presets[0];
      if (preset && preset.css.trim()) {
        cssBlocks.push(`/* [${cat.label}] - ${preset.name} */\n${preset.css.trim()}`);
      }
    }
  }
  return cssBlocks.join("\n\n");
}
