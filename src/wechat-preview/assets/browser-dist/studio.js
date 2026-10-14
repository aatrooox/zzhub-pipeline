import{E as pe,r as ue,d as ge,c as xe,g as be,a as fe,b as he,e as we,f as ve}from"./assets/wechat-renderer-GgNrlSLi.js";(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))r(n);new MutationObserver(n=>{for(const i of n)if(i.type==="childList")for(const d of i.addedNodes)d.tagName==="LINK"&&d.rel==="modulepreload"&&r(d)}).observe(document,{childList:!0,subtree:!0});function t(n){const i={};return n.integrity&&(i.integrity=n.integrity),n.referrerPolicy&&(i.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?i.credentials="include":n.crossOrigin==="anonymous"?i.credentials="omit":i.credentials="same-origin",i}function r(n){if(n.ep)return;n.ep=!0;const i=t(n);fetch(n.href,i)}})();const R=[{key:"h1",label:"一级标题 (H1)",icon:"👑",description:"文章大标题：26px，加粗，紧贴后续正文，无边框背景修饰",css:`.milkdown .editor h1 {
  margin: 2.45em 0 0.85em;
  color: var(--wx-h2-color, #1f1b1c);
  font-size: 26px;
  font-weight: 700;
  line-height: 1.38;
  letter-spacing: -0.01em;
}`},{key:"h2",label:"二级标题 (H2)",icon:"📌",defaultPresetId:"pillar",presets:[{id:"pillar",name:"左侧呼吸柱（推荐）",description:"2.5px 品牌色垂直微线 + 9px 内边距 + 2.8em 非对称呼吸留白",css:`.milkdown .editor h2 {
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
}`},{id:"bottom-line",name:"极浅底部分割",description:"1px 细底线 + 紧凑下边距 + 3.0em 开阔章节上留白",css:`.milkdown .editor h2 {
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
}`},{id:"gradient-pill",name:"渐变微衬底（背景色块）",description:"水平柔和渐变微底色 + 左侧 3px 标柱 + 4px 圆角",css:`.milkdown .editor h2 {
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
}`},{id:"contrast-green",name:"反差色绿底（白字反色块）",description:"高级生态绿底色 + 纯白文字 + 4px 圆角 + 8px 14px 饱满内边距",css:`.milkdown .editor h2 {
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
}`},{id:"card-tag",name:"温润小卡片",description:"包裹式浅色暖底 + 居左微内边距 + 紧实字号",css:`.milkdown .editor h2 {
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
}`},{id:"plain",name:"经典纯文字",description:"纯字号与字重，无边框与背景修饰",css:`.milkdown .editor h2 {
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
}`}]},{key:"h3",label:"三级标题 (H3)",icon:"🔹",defaultPresetId:"plain",presets:[{id:"plain",name:"经典纯文字（默认）",description:"16px，深灰次级字色，font-weight 700",css:`.milkdown .editor h3 {
  margin: 1.55em 0 0.4em;
  padding-left: 0;
  border-left: none;
  background: none;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.48;
  letter-spacing: 0.02em;
  color: var(--wx-h3-color, #5c5658);
}`},{id:"left-bar",name:"左侧微短线",description:"2px 细色柱 + 7px 内边距",css:`.milkdown .editor h3 {
  margin: 1.6em 0 0.45em;
  padding-left: 7px;
  border-left: 2px solid var(--wx-brand-accent, #ca6093);
  background: none;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.45;
  letter-spacing: 0.015em;
  color: var(--wx-h3-color, #5c5658);
}`},{id:"badge",name:"胶囊小微标",description:"行内微底色衬托，紧凑突出",css:`.milkdown .editor h3 {
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
}`}]},{key:"h4",label:"四级/次级标题 (H4-H6)",icon:"🔸",description:"更低层级小标题：16px 次深灰，1.55 行高，紧贴段落",css:`.milkdown .editor h4,
.milkdown .editor h5,
.milkdown .editor h6 {
  margin: 1.45em 0 0.45em;
  color: var(--wx-h3-color, #5c5658);
  font-size: 16px;
  font-weight: 700;
  line-height: 1.55;
  letter-spacing: 0.02em;
}`},{key:"p",label:"正文段落 (Paragraph)",icon:"📄",description:"标准段落：两端对齐，排版行高 1.84，下边距 1.2em",css:`.milkdown .editor p {
  margin: 0 0 1.2em;
  color: var(--wx-body-color, #292526);
  font-size: 16px;
  line-height: 1.84;
  letter-spacing: 0.012em;
  text-align: justify;
}`},{key:"strong",label:"加粗与斜体 (Bold / Italic)",icon:"🖋️",description:"重点强调：深沉字重 700 与斜体字色跟随",css:`.milkdown .editor strong,
.milkdown .editor b {
  color: var(--wx-body-color, #292526);
  font-weight: 700;
}
.milkdown .editor em,
.milkdown .editor i {
  color: var(--wx-body-color, #292526);
  font-style: italic;
}`},{key:"del",label:"删除线 (Strikethrough)",icon:"✂️",description:"废弃内容：静音深灰与中线划除",css:`.milkdown .editor s,
.milkdown .editor del {
  color: var(--wx-muted-color, #6f696b);
  text-decoration: line-through;
  text-decoration-color: var(--wx-muted-color, #6f696b);
}`},{key:"mark",label:"文本高亮 (Mark ==...==)",icon:"🖍️",description:"马克笔荧光衬底：柔和品牌色淡背景 + 1.5px 下划强调线",css:`.milkdown .editor mark {
  margin: 0 2px;
  padding: 2px 5px;
  background-color: rgba(202, 96, 147, 0.16);
  color: var(--wx-body-color, #292526);
  border-radius: 3px;
  border-bottom: 1.5px solid var(--wx-brand-accent, #ca6093);
}`},{key:"inline-code",label:"行内代码 (Inline Code)",icon:"💻",description:"行内等宽代码：14px，等宽字体，浅色微边框衬底",css:`.milkdown .editor code:not(pre code),
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
}`},{key:"code-block",label:"代码块 (Code Block)",icon:"📟",description:"多行代码框：浅灰底色，6px 圆角，深色等宽字符与水平横滚",css:`.milkdown .editor pre {
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
}`},{key:"blockquote",label:"引用块 (Blockquote)",icon:"💬",defaultPresetId:"left-border",presets:[{id:"left-border",name:"经典左单线（默认）",description:"3px 品牌色微边框 + 浅灰底色 + 4px 右圆角",css:`.milkdown .editor blockquote {
  margin: 1.6em 0;
  padding: 10px 16px;
  border: none;
  border-left: 3px solid var(--wx-blockquote-border, #ca6093);
  border-radius: 0 4px 4px 0;
  background-color: var(--wx-soft-surface, #fbfafb);
}`},{id:"tint-card",name:"全包裹微卡片",description:"四边 1px 极细边框 + 6px 圆角，整体成盒",css:`.milkdown .editor blockquote {
  margin: 1.6em 0;
  padding: 12px 18px;
  border: 1px solid var(--wx-divider-color, #ebe6e8);
  border-radius: 6px;
  background-color: var(--wx-soft-surface, #fbfafb);
}`},{id:"minimal-indent",name:"极简纯缩进",description:"无底色，仅左侧细灰线与自然缩进",css:`.milkdown .editor blockquote {
  margin: 1.5em 0;
  padding: 6px 0 6px 16px;
  border: none;
  border-left: 2px solid rgba(0, 0, 0, 0.15);
  border-radius: 0;
  background: none;
}`}]},{key:"list",label:"列表 (Unordered & Ordered)",icon:"📋",description:"标准列表：自然外缩进，1.78 行高，小圆点与阿拉伯数字序号",css:`.milkdown .editor ul,
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
}`},{key:"task-list",label:"任务清单 (Task List)",icon:"☑️",description:"待办复选框：品牌色勾选标记，紧凑缩进",css:`.milkdown .editor [data-wechat-node="task-list-item"] {
  list-style: none;
}
.milkdown .editor [data-wechat-node="task-marker"] {
  display: inline-block;
  min-width: 1.35em;
  color: var(--wx-brand-accent, #ca6093);
  font-weight: 700;
}`},{key:"divider",label:"分割线 (Divider)",icon:"➖",defaultPresetId:"hairline",presets:[{id:"hairline",name:"极细实线（默认）",description:"1px 浅灰色水平实线",css:`.milkdown .editor hr,
.milkdown .editor [data-wechat-node="divider"] {
  margin: 2.4em 0;
  width: 100%;
  border: none;
  border-top: 1px solid var(--wx-divider-color, #e2dcdf);
}`},{id:"dashed",name:"极简虚线",description:"1px 虚线划分节奏",css:`.milkdown .editor hr,
.milkdown .editor [data-wechat-node="divider"] {
  margin: 2.4em 0;
  width: 100%;
  border: none;
  border-top: 1px dashed var(--wx-divider-color, #d4cecf);
}`},{id:"short-center",name:"居中短呼吸线",description:"宽度 36%，居中呼吸线",css:`.milkdown .editor hr,
.milkdown .editor [data-wechat-node="divider"] {
  margin: 2.8em auto;
  width: 36%;
  border: none;
  border-top: 1px solid var(--wx-divider-color, #e2dcdf);
}`}]},{key:"link",label:"超链接与附注 (Links & Ref)",icon:"🔗",description:"文章链接与文末尾注：品牌色下划细线与上标数字角标",css:`.milkdown .editor a,
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
}`},{key:"image",label:"图片与图注 (Image & Caption)",icon:"🖼️",description:"文章插图与下方图注：居中包裹，4px 微圆角与 13px 浅灰居中说明",css:`.milkdown .editor figure,
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
}`},{key:"table",label:"数据表格 (Table)",icon:"📊",description:"数据对比表格：折叠边框，浅暖色表头背景，紧凑对齐内边距",css:`.milkdown .editor table {
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
}`},{key:"callout",label:"扩展：提示卡片 (Callout Alert)",icon:"💡",description:"高亮提示盒：标准 GFM 语义色彩（Note 蓝 / Tip 绿 / Warning 橙 / Caution 红 / Important 紫）",css:`.milkdown .editor [data-wechat-node="callout"],
.milkdown .editor .wechat-callout {
  margin: 1.4em 0;
  padding: 12px 16px;
  border-left-width: 4px;
  border-left-style: solid;
  border-radius: 6px;
  box-sizing: border-box;
}
.milkdown .editor [data-callout-type="note"],
.milkdown .editor .wechat-callout-note {
  border-left-color: #3b82f6 !important;
  background-color: rgba(59, 130, 246, 0.08) !important;
}
.milkdown .editor [data-callout-type="tip"],
.milkdown .editor .wechat-callout-tip {
  border-left-color: #10b981 !important;
  background-color: rgba(16, 185, 129, 0.08) !important;
}
.milkdown .editor [data-callout-type="important"],
.milkdown .editor .wechat-callout-important {
  border-left-color: #8b5cf6 !important;
  background-color: rgba(139, 92, 246, 0.08) !important;
}
.milkdown .editor [data-callout-type="warning"],
.milkdown .editor .wechat-callout-warning {
  border-left-color: #f59e0b !important;
  background-color: rgba(245, 158, 11, 0.08) !important;
}
.milkdown .editor [data-callout-type="caution"],
.milkdown .editor .wechat-callout-caution {
  border-left-color: #ef4444 !important;
  background-color: rgba(239, 68, 68, 0.08) !important;
}
.milkdown .editor [data-wechat-node="callout-header"],
.milkdown .editor .wechat-callout-header {
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 6px;
}`},{key:"kbd",label:"扩展：键盘键帽 (Kbd Key)",icon:"⌨️",description:"按键徽章：立体立体阴影边框，12px 等宽字体",css:`.milkdown .editor kbd,
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
}`},{key:"badge",label:"扩展：彩色徽章 (Badge Pill)",icon:"🏷️",description:"胶囊微标签：全圆角胶囊底色，紧凑居中",css:`.milkdown .editor [data-wechat-node="badge"] {
  display: inline-block;
  margin: 0 2px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 9999px;
  line-height: 1.3;
  background-color: rgba(202, 96, 147, 0.12);
  color: var(--wx-brand-accent, #ca6093);
}`},{key:"article-card",label:"扩展：篇章结构卡片",icon:"🎴",description:"文章开头导读 (> [!INTRO]) 与结尾互动号召 (> [!CTA])",defaultPresetId:"magazine",presets:[{id:"magazine",name:"杂志编者按（推荐）",description:"柔和浅底卡 + 1px 细微框线 + 胶囊标 + 13px 精致小字 + 悬挂元信息与引导条",css:`.milkdown .editor section[data-wechat-node="article-card"],
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
  background-color: rgba(202, 96, 147, 0.04);
  border: 1px dashed var(--wx-brand-accent, #ca6093);
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
}`},{id:"top-line",name:"顶部色彩微线",description:"顶部 3px 品牌色微边线 + 纯白底色 + 浅微边框 + 13px 精致小字",css:`.milkdown .editor section[data-wechat-node="article-card"],
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
  background-color: rgba(202, 96, 147, 0.04);
  border: 1px dashed var(--wx-brand-accent, #ca6093);
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
}`},{id:"minimal",name:"极简纯白框",description:"纯白背景 + 1px 细微框线 + 13px 精致小字",css:`.milkdown .editor section[data-wechat-node="article-card"],
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
}`}]}];function ke(o){const e=[];for(const t of R)if(t.presets&&t.presets.length>1){const r=o[t.key]||t.defaultPresetId||t.presets[0].id,n=t.presets.find(i=>i.id===r)||t.presets[0];n&&n.css.trim()&&e.push(`/* [${t.label}] - ${n.name} */
${n.css.trim()}`)}return e.join(`

`)}const Z=[{id:"forest-sage",name:"🌿 森林墨绿 (Kinfolk / 少数派)",category:"生活方式与编辑部",description:"《Kinfolk》生活美学：沉稳深松绿强调色，搭配松针深黑与浅灰绿分割线",colors:{brand:"#1f6f4a",text:"#1f2320",h2:"#154c33",h3:"#2e7d58",quote:"#3d8e64",divider:"#e1ebe5"}},{id:"oatmeal-earth",name:"☕ 燕麦大地 (理想国 / 暖调成衣)",category:"时尚与书籍出版",description:"Loro Piana 暖调成衣美学：深焦糖陶土棕、浓咖啡黑与温润燕麦米灰",colors:{brand:"#945938",text:"#2b2623",h2:"#1f1b18",h3:"#6b3f27",quote:"#b37954",divider:"#eae4dd"}},{id:"slate-indigo",name:"🏛️ 石板深蓝 (纽约客 / Substack)",category:"深度专栏与智识",description:"经典严肃刊物：午夜深藏青做标识，石板灰文字与干净蓝灰分割",colors:{brand:"#2563eb",text:"#1e293b",h2:"#0f172a",h3:"#334155",quote:"#3b82f6",divider:"#e2e8f0"}},{id:"burgundy-velvet",name:"🍷 勃艮第红 (Vogue / 先锋艺术)",category:"高级时尚与设计",description:"复古先锋美学：丝绒绛红做点睛，黑绒字色与淡玫瑰粉灰底线",colors:{brand:"#881337",text:"#231f20",h2:"#1a1617",h3:"#4c1d2e",quote:"#9f1239",divider:"#f2e5ea"}},{id:"matcha-bamboo",name:"🍵 极简煎茶 (无印良品 / 东方和风)",category:"极简器物与禅意",description:"日系器物美学：深橄榄煎茶色、竹炭色正文与和纸灰底线",colors:{brand:"#556b2f",text:"#262923",h2:"#1c211a",h3:"#435528",quote:"#708846",divider:"#e7eae1"}},{id:"titanium-cyan",name:"🌌 极客钛灰 (Linear / Arc 现代界面)",category:"现代数字与 App",description:"当代高端数字界面：极光冷青点缀、深空曜黑文字与钛金属浅灰",colors:{brand:"#0284c7",text:"#18181b",h2:"#09090b",h3:"#27272a",quote:"#0ea5e9",divider:"#e4e4e7"}},{id:"rose-ledger",name:"🌸 晚樱柔粉 (古一软件经典标配)",category:"人文与故事叙述",description:"经典温润配色：干枯玫瑰粉与深铅黑文字，温柔克制",colors:{brand:"#ca6093",text:"#292526",h2:"#1f1b1c",h3:"#5c5658",quote:"#ca6093",divider:"#dadce0"}}];function ye(o){const e=/^(?:\uFEFF)?(?:---|[*]{3})\r?\n([\s\S]*?)\r?\n(?:---|[*]{3})\r?\n/,t=o.match(e);return t?{frontmatter:t[1],content:o.slice(t[0].length)}:{frontmatter:"",content:o}}function Ce(o){const e=o.includes(`\r
`)?`\r
`:`
`,t=o.split(/\r?\n/);let r=-1;for(let i=0;i<t.length;i+=1)if(t[i].trim()){r=i;break}if(r===-1||!/^# (?!#)/.test(t[r].trim()))return o;let n=r+1;for(;n<t.length&&!t[n].trim();)n+=1;return[...t.slice(0,r),...t.slice(n)].join(e)}let f={},g="default",ee=[],w="",E=null,N=!1,b={},C=0,O=!1;const $=document.getElementById("account-select"),m=document.getElementById("editor-markdown"),te=document.getElementById("preview-screen"),Ee=document.getElementById("editor-stats"),oe=document.getElementById("html-source-container"),ne=document.getElementById("html-source-code"),Ie=document.getElementById("toast-container"),re=document.getElementById("studio-editor-host"),I=document.getElementById("input-font-size"),ie=document.getElementById("val-font-size"),L=document.getElementById("input-line-height"),ae=document.getElementById("val-line-height"),B=document.getElementById("input-letter-spacing"),de=document.getElementById("val-letter-spacing"),S=document.getElementById("input-para-spacing"),ce=document.getElementById("val-para-spacing"),v=document.getElementById("palette-select"),j=document.getElementById("palette-desc"),V=document.getElementById("picker-brand-color"),T=document.getElementById("hex-brand-color"),D=document.getElementById("picker-text-color"),z=document.getElementById("hex-text-color"),U=document.getElementById("picker-h2-color"),H=document.getElementById("hex-h2-color"),K=document.getElementById("picker-h3-color"),M=document.getElementById("hex-h3-color"),W=document.getElementById("picker-quote-color"),q=document.getElementById("hex-quote-color"),Q=document.getElementById("picker-divider-color"),P=document.getElementById("hex-divider-color"),_=document.getElementById("switch-numbered-headings"),G=document.getElementById("input-heading-label"),J=document.getElementById("input-quote-label"),u=document.getElementById("input-custom-css");function p(o,e="info"){const t=document.createElement("div");t.className=`toast ${e==="success"?"toast-success":""}`,t.textContent=o,Ie.appendChild(t),requestAnimationFrame(()=>t.classList.add("show")),setTimeout(()=>{t.classList.remove("show"),setTimeout(()=>t.remove(),300)},3e3)}function k(o,e,t){o.addEventListener("input",()=>{e.value=o.value,t()}),e.addEventListener("input",()=>{/^#[0-9a-f]{6}$/i.test(e.value)&&(o.value=e.value,t())})}function Le(){const e=m.value.replace(/\s+/g,"").length,t=Math.max(1,Math.round(e/400));Ee.textContent=`字数: ${e.toLocaleString()} 字 | 预计阅读: ${t} 分钟`}function X(){const o=f[g],e={...o.theme.exportTheme,bodyFontSize:`${I.value}px`,bodyParagraphSpacing:`${S.value}em`,bodyColor:z.value,h2Color:H.value,h3Color:M.value,primaryColor:T.value,dividerColor:P.value,blockquoteBorderColor:q.value,bodyLineHeight:L.value,bodyLetterSpacing:`${B.value}em`},t={...o.theme.editorVars,"--brand":T.value,"--text":z.value,"--divider":P.value},r={...o.theme.structure,numberedHeadings:_.checked,headingLabel:G.value.trim(),quoteLabel:J.value.trim()};return{editorVars:t,exportTheme:e,structure:r}}async function le(){if(O||!f[g])return;O=!0;const o=C,e=Ce(ye(m.value).content).trimStart(),t=X(),r=[ke(b),f[g].articleThemeCss,u.value].filter(Boolean).join(`

`);Le();try{re.innerHTML="";const n=pe.make().config(a=>{a.set(ue,re),a.set(ge,e)}).use(xe).use(be).use(fe());let i;try{await n.create(),i=n.action(he())}finally{await n.destroy()}const d=await we({semanticHtml:i,baseCss:ve,customCss:r,structure:t.structure,editorVars:t.editorVars,theme:t.exportTheme});if(o!==C)return;w=d,te.innerHTML=d,ne.value=d}catch(n){if(o!==C)return;console.error("Studio render error:",n);const i=n instanceof Error?n.message:String(n);te.textContent=`渲染错误: ${i}`,ne.value=""}finally{O=!1,o!==C&&(E&&clearTimeout(E),le())}}function c(o=60){C+=1,w="",E&&clearTimeout(E),E=setTimeout(()=>{le()},o)}function Be(o){const e=document.getElementById("syntax-card-list");if(e){e.innerHTML="";for(const t of o){const r=document.createElement("div");r.className="syntax-card";const n=document.createElement("div");n.className="syntax-card-header";const i=document.createElement("span");i.className="syntax-card-title",i.textContent=t.name;const d=document.createElement("span");d.className="syntax-card-badge",d.textContent=t.category==="inline"?"行内扩展":"块级组件",n.appendChild(i),n.appendChild(d),r.appendChild(n);const a=document.createElement("p");a.className="syntax-card-desc",a.textContent=t.description,r.appendChild(a);const l=document.createElement("pre");l.className="syntax-code-snippet",l.textContent=t.sampleMarkdown,r.appendChild(l);const s=document.createElement("button");s.className="syntax-btn-insert",s.textContent="+ 插入示例到文章中",s.addEventListener("click",()=>{Se(t.sampleMarkdown),p(`已插入「${t.name}」示例`,"info")}),r.appendChild(s),e.appendChild(r)}}}function Se(o){const e=m.selectionStart,t=m.selectionEnd,r=m.value,n=`

${o}

`;m.value=r.slice(0,e)+n+r.slice(t),m.focus(),m.selectionStart=m.selectionEnd=e+n.length,c(20)}function Te(){const o=document.getElementById("syntax-preset-container");if(o){o.innerHTML="";for(const e of R){const t=document.createElement("div");t.className="preset-group";const r=document.createElement("div");r.className="preset-header";const n=document.createElement("span");n.className="preset-title",n.textContent=`${e.icon} ${e.label}`,r.appendChild(n);const i=!!(e.presets&&e.presets.length>1),d=document.createElement("button");if(d.type="button",d.className="btn-extract-css",d.textContent="📋 提取 CSS",d.title="将此语法的 CSS 追加到底部自定义编辑器，方便微调覆盖",d.addEventListener("click",()=>{let a="";if(i&&e.presets){const l=b[e.key]||e.defaultPresetId||e.presets[0].id,s=e.presets.find(h=>h.id===l)||e.presets[0];a=`/* [${e.label}] - ${s.name} */
${s.css.trim()}
`}else{const l=e.css||e.presets&&e.presets[0]?.css||"";a=`/* [${e.label}] 基础样式 */
${l.trim()}
`}a&&(u.value=u.value?`${u.value.trim()}

${a}`:a,u.focus(),u.scrollTop=u.scrollHeight,p(`已将「${e.label}」CSS 追加到底部编辑框！`,"info"),c(20))}),r.appendChild(d),t.appendChild(r),i&&e.presets){const a=document.createElement("select");a.className="preset-select",a.dataset.category=e.key;for(const x of e.presets){const y=document.createElement("option");y.value=x.id,y.textContent=x.name,a.appendChild(y)}const l=b[e.key]||e.defaultPresetId||e.presets[0].id;a.value=l,t.appendChild(a);const s=document.createElement("div");s.className="preset-desc";const h=e.presets.find(x=>x.id===l)||e.presets[0];s.textContent=h?.description||"",t.appendChild(s),a.addEventListener("change",()=>{b[e.key]=a.value;const x=e.presets.find(y=>y.id===a.value);s.textContent=x?.description||"",c(20)})}else if(e.description){const a=document.createElement("div");a.className="preset-desc",a.textContent=e.description,t.appendChild(a)}o.appendChild(t)}}}function Y(o){const e=f[o];if(!e)return;const t=document.getElementById("btn-save");t.disabled=!!e.articleThemeStandalone,t.title=e.articleThemeStandalone?"当前账号引用独立配置，请通过导出配置保存调整后替换原文件":"保存当前调整至本地 config.json 的当前账号";const r=e.theme?.exportTheme||{},n=e.theme?.editorVars||{};I.value=r.bodyFontSize?.replace(/px$/,"")||r.containerStyle?.match(/font-size:\s*(\d+(?:\.\d+)?)px/)?.[1]||"16",ie.textContent=`${I.value}px`,L.value=r.bodyLineHeight||"1.84",ae.textContent=L.value,B.value=String(parseFloat(r.bodyLetterSpacing||"0.012em")),de.textContent=`${B.value}em`,S.value=String(parseFloat(r.bodyParagraphSpacing||"1.18em")),ce.textContent=`${S.value}em`,v.value="",j.textContent="";const i=n["--brand"]||r.primaryColor;i&&(V.value=i,T.value=i);const d=r.bodyColor||n["--text"];d&&(D.value=d,z.value=d),r.h2Color&&(U.value=r.h2Color,H.value=r.h2Color),r.h3Color&&(K.value=r.h3Color,M.value=r.h3Color);const a=r.blockquoteBorderColor||i;a&&(W.value=a,q.value=a);const l=r.dividerColor||n["--divider"];l&&(Q.value=l,P.value=l),e.customCssContent?u.value=e.customCssContent:u.value="";const s=e.theme?.syntaxPresets||{};b={};for(const x of R)x.defaultPresetId&&(b[x.key]=s[x.key]||x.defaultPresetId);Te();const h=e.theme?.structure||{};_.checked=!!h.numberedHeadings,G.value=h.headingLabel||"",J.value=h.quoteLabel||"",c(20)}function ze(){if(v){v.innerHTML='<option value="">-- 选择推荐调色盘 (一键应用) --</option>';for(const o of Z){const e=document.createElement("option");e.value=o.id,e.textContent=`${o.name} · ${o.category}`,v.appendChild(e)}v.addEventListener("change",()=>{const o=Z.find(e=>e.id===v.value);o&&(V.value=T.value=o.colors.brand,D.value=z.value=o.colors.text,U.value=H.value=o.colors.h2,K.value=M.value=o.colors.h3,W.value=q.value=o.colors.quote,Q.value=P.value=o.colors.divider,j&&(j.textContent=o.description),p(`已应用「${o.name}」高级配色方案！`,"info"),c(20))})}}async function Pe(){ze();try{const o=await fetch("/api/studio/config");if(!o.ok)throw new Error(`HTTP ${o.status}`);const e=await o.json();f=e.accounts||{},g=e.defaultAccount||"default",ee=e.plugins||[],$.innerHTML="";for(const[t,r]of Object.entries(f)){const n=document.createElement("option");n.value=t,n.textContent=`${r.name||t} (${t})`,t===g&&(n.selected=!0),$.appendChild(n)}m.value=e.sampleMarkdown||`# 微信排版标题

欢迎使用 WeChat Visual Studio！`,Be(ee),Y(g)}catch(o){console.error("Failed to load studio config:",o),p("无法加载配置，使用默认设置","error"),c(20)}}$.addEventListener("change",()=>{g=$.value,Y(g)});m.addEventListener("input",()=>c(40));I.addEventListener("input",()=>{ie.textContent=`${I.value}px`,c(20)});L.addEventListener("input",()=>{ae.textContent=L.value,c(20)});B.addEventListener("input",()=>{de.textContent=`${B.value}em`,c(20)});S.addEventListener("input",()=>{ce.textContent=`${S.value}em`,c(20)});k(V,T,()=>c(20));k(D,z,()=>c(20));k(U,H,()=>c(20));k(K,M,()=>c(20));k(W,q,()=>c(20));k(Q,P,()=>c(20));_.addEventListener("change",()=>c(20));G.addEventListener("input",()=>c(40));J.addEventListener("input",()=>c(40));u.addEventListener("input",()=>c(60));const F=document.getElementById("tab-btn-style"),A=document.getElementById("tab-btn-syntax"),se=document.getElementById("tab-content-style"),me=document.getElementById("tab-content-syntax");F.addEventListener("click",()=>{F.classList.add("active"),A.classList.remove("active"),se.style.display="block",me.style.display="none"});A.addEventListener("click",()=>{A.classList.add("active"),F.classList.remove("active"),se.style.display="none",me.style.display="block"});document.getElementById("btn-load-sample")?.addEventListener("click",async()=>{const e=await(await fetch("/api/studio/config")).json();m.value=e.sampleMarkdown||"",c(20),p("已加载官方全语法测试稿","info")});document.getElementById("btn-clear-md")?.addEventListener("click",()=>{m.value="",c(20)});document.getElementById("btn-toggle-view")?.addEventListener("click",o=>{const e=o.currentTarget;N=!N,N?(oe.style.display="block",e.textContent="📱 返回视图"):(oe.style.display="none",e.textContent="🔍 查看 HTML 源码")});document.getElementById("btn-reset")?.addEventListener("click",()=>{Y(g),p("已重置为当前账号默认样式","info")});document.getElementById("btn-save")?.addEventListener("click",async()=>{const o=f[g];if(!o)return;const{structure:e,...t}=X(),{headerImageUrl:r,...n}=e,i={account:g,...t,syntaxPresets:{...b},customCss:u.value,structure:n};try{const d=await fetch("/api/studio/save-config",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(i)}),a=await d.json();d.ok&&a.ok?(o.theme={...t,structure:e,syntaxPresets:i.syntaxPresets},o.customCssContent=i.customCss,p("✅ 配置已成功保存至本地 config.json！","success")):p(`保存失败: ${a.error||"未知错误"}`,"error")}catch(d){p(`网络请求失败: ${String(d)}`,"error")}});document.getElementById("btn-export-config")?.addEventListener("click",()=>{const o=f[g];if(!o)return;const e={schemaVersion:1,engineVersion:1,id:"wechat-style",name:"WeChat Studio 排版配置",version:"1.0.0",...X(),syntaxPresets:{...b},css:[o.articleThemeCss,u.value].filter(Boolean).join(`

`)},t=URL.createObjectURL(new Blob([`${JSON.stringify(e,null,2)}
`],{type:"application/json"})),r=document.createElement("a");r.href=t,r.download="wechat-style.json",r.click(),setTimeout(()=>URL.revokeObjectURL(t),1e3),p("已导出独立配置，CLI 使用 --article-theme 选择该文件","success")});document.getElementById("btn-copy")?.addEventListener("click",async()=>{if(!w){p("文章内容为空","error");return}try{const o=new Blob([w],{type:"text/html"}),e=new Blob([w],{type:"text/plain"});await navigator.clipboard.write([new ClipboardItem({"text/html":o,"text/plain":e})]),p("📋 已复制富文本！可在微信公众号后台直接粘贴 (Cmd+V)","success")}catch(o){console.error("Clipboard write error:",o);const e=t=>{t.clipboardData?.setData("text/html",w),t.clipboardData?.setData("text/plain",w),t.preventDefault()};document.addEventListener("copy",e),document.execCommand("copy"),document.removeEventListener("copy",e),p("📋 已复制富文本（后备通道）","success")}});Pe();
