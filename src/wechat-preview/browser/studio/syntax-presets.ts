export interface SyntaxPreset {
  id: string;
  name: string;
  css: string;
}

export interface SyntaxCategory {
  key: string;
  label: string;
  icon: string;
  defaultPresetId: string;
  presets: SyntaxPreset[];
}

/** 仅收录存在多个可选预设的语法节点；单一样式的节点直接由 article.css 提供。 */
export const SYNTAX_CATEGORIES: SyntaxCategory[] = [
  {
    key: "h2",
    label: "二级标题 (H2)",
    icon: "📌",
    defaultPresetId: "pillar",
    presets: [
      {
        id: "pillar",
        name: "左侧呼吸柱（推荐）",
        css: `.milkdown .editor h2 {
  margin: 2.8em 0 0.65em;
  padding-left: 9px;
  border-left: 4px solid var(--wx-brand-accent, #ca6093);
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
    key: "blockquote",
    label: "引用块 (Blockquote)",
    icon: "💬",
    defaultPresetId: "left-border",
    presets: [
      {
        id: "left-border",
        name: "经典左单线（默认）",
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
    key: "divider",
    label: "分割线 (Divider)",
    icon: "➖",
    defaultPresetId: "hairline",
    presets: [
      {
        id: "hairline",
        name: "极细实线（默认）",
        css: `.milkdown .editor hr,
.milkdown .editor [data-wechat-node="divider"] {
  margin: 2.4em 0;
  width: 100%;
  border: none;
  border-top: 1px solid var(--wx-divider-color, #e2dcdf);
}`,
      },
      {
        id: "dashed",
        name: "极简虚线",
        css: `.milkdown .editor hr,
.milkdown .editor [data-wechat-node="divider"] {
  margin: 2.4em 0;
  width: 100%;
  border: none;
  border-top: 1px dashed var(--wx-divider-color, #d4cecf);
}`,
      },
      {
        id: "short-center",
        name: "居中短呼吸线",
        css: `.milkdown .editor hr,
.milkdown .editor [data-wechat-node="divider"] {
  margin: 2.8em auto;
  width: 36%;
  border: none;
  border-top: 1px solid var(--wx-divider-color, #e2dcdf);
}`,
      },
    ],
  },
  {
    key: "article-card",
    label: "篇章结构卡片 (INTRO / CTA)",
    icon: "🎴",
    defaultPresetId: "magazine",
    presets: [
      {
        id: "magazine",
        name: "杂志编者按（推荐）",
        css: `.milkdown .editor section[data-wechat-node="article-card"],
.milkdown .editor .wechat-article-card {
  margin: 1.8em 0;
  padding: 16px 20px;
  border-radius: 10px;
  box-sizing: border-box;
}
.milkdown .editor .wechat-article-card-intro {
  background-color: var(--wx-soft-surface, #faf8f9);
  border: 1px solid var(--wx-divider, #eae4e7);
}
.milkdown .editor .wechat-article-card-cta {
  background-color: var(--brand-bg, rgba(202, 96, 147, 0.04));
  border: 1px dashed var(--wx-brand-accent, #ca6093);
  text-align: center;
}
.milkdown .editor span[data-wechat-node="card-eyebrow-badge"],
.milkdown .editor .wechat-card-eyebrow-badge {
  background-color: var(--brand-bg, rgba(202, 96, 147, 0.08));
}
.milkdown .editor .wechat-article-card p {
  margin: 0.4em 0;
  font-size: 13px;
  line-height: 1.72;
  color: var(--wx-text-soft, #555555);
}
.milkdown .editor .wechat-intro-meta {
  margin: 4px 0 10px 0 !important;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--wx-divider, #f0ebed);
  font-size: 12px !important;
  color: var(--wx-muted-color, #756b6e) !important;
}
.milkdown .editor .wechat-intro-meta strong {
  color: var(--wx-brand-accent, #ca6093);
}
.milkdown .editor .wechat-intro-guide {
  margin-top: 10px !important;
  padding-top: 8px;
  border-top: 1px dashed rgba(202, 96, 147, 0.25);
  font-size: 12px !important;
  color: var(--wx-brand-accent, #ca6093) !important;
}`,
      },
      {
        id: "top-line",
        name: "顶部色彩微线",
        css: `.milkdown .editor section[data-wechat-node="article-card"],
.milkdown .editor .wechat-article-card {
  margin: 1.8em 0;
  padding: 16px 20px;
  border-radius: 8px;
  box-sizing: border-box;
}
.milkdown .editor .wechat-article-card-intro {
  background-color: #ffffff;
  border: 1px solid var(--wx-divider, #eae4e7);
  border-top: 3px solid var(--wx-brand-accent, #ca6093);
}
.milkdown .editor .wechat-article-card-cta {
  background-color: var(--brand-bg, rgba(202, 96, 147, 0.04));
  border: 1px dashed var(--wx-brand-accent, #ca6093);
  text-align: center;
}
.milkdown .editor span[data-wechat-node="card-eyebrow-badge"],
.milkdown .editor .wechat-card-eyebrow-badge {
  background-color: var(--brand-bg, rgba(202, 96, 147, 0.08));
}
.milkdown .editor .wechat-article-card p {
  margin: 0.4em 0;
  font-size: 13px;
  line-height: 1.72;
  color: var(--wx-text-soft, #555555);
}
.milkdown .editor .wechat-intro-meta {
  margin: 4px 0 10px 0 !important;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--wx-divider, #f0ebed);
  font-size: 12px !important;
  color: var(--wx-muted-color, #756b6e) !important;
}
.milkdown .editor .wechat-intro-meta strong {
  color: var(--wx-brand-accent, #ca6093);
}
.milkdown .editor .wechat-intro-guide {
  margin-top: 10px !important;
  padding-top: 8px;
  border-top: 1px dashed rgba(202, 96, 147, 0.25);
  font-size: 12px !important;
  color: var(--wx-brand-accent, #ca6093) !important;
}`,
      },
      {
        id: "minimal",
        name: "极简纯白框",
        css: `.milkdown .editor section[data-wechat-node="article-card"],
.milkdown .editor .wechat-article-card {
  margin: 1.8em 0;
  padding: 16px 20px;
  border-radius: 6px;
  box-sizing: border-box;
}
.milkdown .editor .wechat-article-card-intro {
  background-color: #ffffff;
  border: 1px solid var(--wx-divider, #eae4e7);
}
.milkdown .editor .wechat-article-card-cta {
  background-color: #ffffff;
  border: 1px dashed var(--wx-divider, #dadce0);
  text-align: center;
}
.milkdown .editor .wechat-article-card p {
  margin: 0.4em 0;
  font-size: 13px;
  line-height: 1.72;
  color: var(--wx-text-soft, #555555);
}
.milkdown .editor .wechat-intro-meta {
  margin: 4px 0 10px 0 !important;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--wx-divider, #f0ebed);
  font-size: 12px !important;
  color: var(--wx-muted-color, #756b6e) !important;
}
.milkdown .editor .wechat-intro-meta strong {
  color: var(--wx-brand-accent, #ca6093);
}
.milkdown .editor .wechat-intro-guide {
  margin-top: 10px !important;
  padding-top: 8px;
  border-top: 1px dashed rgba(202, 96, 147, 0.25);
  font-size: 12px !important;
  color: var(--wx-brand-accent, #ca6093) !important;
}`,
      },
    ],
  },
];

export function buildCombinedPresetsCss(selected: Record<string, string>): string {
  const cssBlocks: string[] = [];
  for (const cat of SYNTAX_CATEGORIES) {
    const preset =
      cat.presets.find((p) => p.id === (selected[cat.key] || cat.defaultPresetId)) ||
      cat.presets[0];
    cssBlocks.push(`/* [${cat.label}] - ${preset.name} */\n${preset.css.trim()}`);
  }
  return cssBlocks.join("\n\n");
}
