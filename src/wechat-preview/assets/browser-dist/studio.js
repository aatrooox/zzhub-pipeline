import{E as ge,r as be,d as xe,c as he,g as ve,a as ye,b as ke,e as we,f as Ce}from"./assets/wechat-renderer-Cf1C61aM.js";(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))i(n);new MutationObserver(n=>{for(const a of n)if(a.type==="childList")for(const c of a.addedNodes)c.tagName==="LINK"&&c.rel==="modulepreload"&&i(c)}).observe(document,{childList:!0,subtree:!0});function t(n){const a={};return n.integrity&&(a.integrity=n.integrity),n.referrerPolicy&&(a.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?a.credentials="include":n.crossOrigin==="anonymous"?a.credentials="omit":a.credentials="same-origin",a}function i(n){if(n.ep)return;n.ep=!0;const a=t(n);fetch(n.href,a)}})();const R=[{key:"h1",label:"一级标题 (H1)",icon:"👑",description:"文章大标题：26px，加粗，紧贴后续正文，无边框背景修饰",css:`.milkdown .editor h1 {
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
}`},{key:"divider",label:"分割线 (Divider)",icon:"➖",defaultPresetId:"hairline",presets:[{id:"hairline",name:"极细实线（默认）",description:"1px 浅灰色水平实线",css:`.milkdown .editor hr {
  margin: 2.4em 0;
  width: 100%;
  border: none;
  border-top: 1px solid var(--wx-divider-color, #e2dcdf);
}`},{id:"dashed",name:"极简虚线",description:"1px 虚线划分节奏",css:`.milkdown .editor hr {
  margin: 2.4em 0;
  width: 100%;
  border: none;
  border-top: 1px dashed var(--wx-divider-color, #d4cecf);
}`},{id:"short-center",name:"居中短呼吸线",description:"宽度 36%，居中呼吸线",css:`.milkdown .editor hr {
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
}`},{key:"callout",label:"扩展：提示卡片 (Callout Alert)",icon:"💡",description:"高亮提示盒：左侧品牌色标线，浅底色包裹与加粗小标",css:`.milkdown .editor [data-wechat-node="callout"] {
  margin: 1.4em 0;
  padding: 12px 16px;
  border-left: 3px solid var(--wx-brand-accent, #ca6093);
  border-radius: 0 6px 6px 0;
  background-color: var(--wx-soft-surface, #fbfafb);
}
.milkdown .editor [data-wechat-node="callout-title"] {
  font-weight: 700;
  font-size: 14px;
  margin-bottom: 6px;
  color: var(--wx-h2-color, #1f1b1c);
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
}`}];function Ee(o){const e=[];for(const t of R)if(t.presets&&t.presets.length>1){const i=o[t.key]||t.defaultPresetId||t.presets[0].id,n=t.presets.find(a=>a.id===i)||t.presets[0];n&&n.css.trim()&&e.push(`/* [${t.label}] - ${n.name} */
${n.css.trim()}`)}return e.join(`

`)}const Z=[{id:"forest-sage",name:"🌿 森林墨绿 (Kinfolk / 少数派)",category:"生活方式与编辑部",description:"《Kinfolk》生活美学：沉稳深松绿强调色，搭配松针深黑与浅灰绿分割线",colors:{brand:"#1f6f4a",text:"#1f2320",h2:"#154c33",h3:"#2e7d58",quote:"#3d8e64",divider:"#e1ebe5"}},{id:"oatmeal-earth",name:"☕ 燕麦大地 (理想国 / 暖调成衣)",category:"时尚与书籍出版",description:"Loro Piana 暖调成衣美学：深焦糖陶土棕、浓咖啡黑与温润燕麦米灰",colors:{brand:"#945938",text:"#2b2623",h2:"#1f1b18",h3:"#6b3f27",quote:"#b37954",divider:"#eae4dd"}},{id:"slate-indigo",name:"🏛️ 石板深蓝 (纽约客 / Substack)",category:"深度专栏与智识",description:"经典严肃刊物：午夜深藏青做标识，石板灰文字与干净蓝灰分割",colors:{brand:"#2563eb",text:"#1e293b",h2:"#0f172a",h3:"#334155",quote:"#3b82f6",divider:"#e2e8f0"}},{id:"burgundy-velvet",name:"🍷 勃艮第红 (Vogue / 先锋艺术)",category:"高级时尚与设计",description:"复古先锋美学：丝绒绛红做点睛，黑绒字色与淡玫瑰粉灰底线",colors:{brand:"#881337",text:"#231f20",h2:"#1a1617",h3:"#4c1d2e",quote:"#9f1239",divider:"#f2e5ea"}},{id:"matcha-bamboo",name:"🍵 极简煎茶 (无印良品 / 东方和风)",category:"极简器物与禅意",description:"日系器物美学：深橄榄煎茶色、竹炭色正文与和纸灰底线",colors:{brand:"#556b2f",text:"#262923",h2:"#1c211a",h3:"#435528",quote:"#708846",divider:"#e7eae1"}},{id:"titanium-cyan",name:"🌌 极客钛灰 (Linear / Arc 现代界面)",category:"现代数字与 App",description:"当代高端数字界面：极光冷青点缀、深空曜黑文字与钛金属浅灰",colors:{brand:"#0284c7",text:"#18181b",h2:"#09090b",h3:"#27272a",quote:"#0ea5e9",divider:"#e4e4e7"}},{id:"rose-ledger",name:"🌸 晚樱柔粉 (古一软件经典标配)",category:"人文与故事叙述",description:"经典温润配色：干枯玫瑰粉与深铅黑文字，温柔克制",colors:{brand:"#ca6093",text:"#292526",h2:"#1f1b1c",h3:"#5c5658",quote:"#ca6093",divider:"#dadce0"}}];let h={},f="default",ee=[],k="",F=null,V=!1,y={};const z=document.getElementById("account-select"),u=document.getElementById("editor-markdown"),te=document.getElementById("preview-screen"),Le=document.getElementById("editor-stats"),oe=document.getElementById("html-source-container"),Be=document.getElementById("html-source-code"),Se=document.getElementById("toast-container"),ne=document.getElementById("studio-editor-host"),E=document.getElementById("input-font-size"),ie=document.getElementById("val-font-size"),L=document.getElementById("input-line-height"),ae=document.getElementById("val-line-height"),B=document.getElementById("input-letter-spacing"),de=document.getElementById("val-letter-spacing"),j=document.getElementById("input-para-spacing"),Ie=document.getElementById("val-para-spacing"),C=document.getElementById("palette-select"),re=document.getElementById("palette-desc"),W=document.getElementById("picker-brand-color"),S=document.getElementById("hex-brand-color"),G=document.getElementById("picker-text-color"),I=document.getElementById("hex-text-color"),Q=document.getElementById("picker-h2-color"),H=document.getElementById("hex-h2-color"),Y=document.getElementById("picker-h3-color"),$=document.getElementById("hex-h3-color"),_=document.getElementById("picker-quote-color"),T=document.getElementById("hex-quote-color"),J=document.getElementById("picker-divider-color"),P=document.getElementById("hex-divider-color"),M=document.getElementById("switch-numbered-headings"),q=document.getElementById("input-heading-label"),N=document.getElementById("input-quote-label"),b=document.getElementById("input-custom-css");function g(o,e="info"){const t=document.createElement("div");t.className=`toast ${e==="success"?"toast-success":""}`,t.textContent=o,Se.appendChild(t),requestAnimationFrame(()=>t.classList.add("show")),setTimeout(()=>{t.classList.remove("show"),setTimeout(()=>t.remove(),300)},3e3)}function w(o,e,t){o.addEventListener("input",()=>{e.value=o.value,t()}),e.addEventListener("input",()=>{/^#[0-9a-f]{6}$/i.test(e.value)&&(o.value=e.value,t())})}function He(){const e=u.value.replace(/\s+/g,"").length,t=Math.max(1,Math.round(e/400));Le.textContent=`字数: ${e.toLocaleString()} 字 | 预计阅读: ${t} 分钟`}async function $e(){const o=u.value;He();try{ne.innerHTML="";const e=ge.make().config(X=>{X.set(be,ne),X.set(xe,o)}).use(he).use(ve).use(ye());await e.create();const t=e.action(ke());await e.destroy();const i=Number(E.value)||16,n=L.value||"1.84",a=`${B.value}em`,c=`${j.value}em`,r=S.value||"#ca6093",m=I.value||"#292526",s=H.value||"#1f1b1c",l=$.value||"#5c5658",x=T.value||"#ca6093",p=P.value||"#dadce0",v=h[f]?.theme?.exportTheme||{},O=h[f]?.theme?.editorVars||{},le=["max-width: 100%","margin: 0","padding: 10px 4px 30px","background: #ffffff","box-sizing: border-box","font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",`font-size: ${i}px`,`color: ${m}`,"overflow-wrap: break-word","word-break: break-word",`line-height: ${n}`,`letter-spacing: ${a}`,"-webkit-text-size-adjust: 100%"].join("; "),me={...v,containerStyle:le,footerText:v.footerText??"",footerStyle:v.footerStyle??"margin-top: 32px; text-align: center; font-size: 12px; color: #6f696b;",fontFamily:v.fontFamily||"-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",bodyColor:m,mutedColor:v.mutedColor||"#5f6368",h2Color:s,h3Color:l,primaryColor:r,dividerColor:p,blockquoteBorderColor:x,bodyLineHeight:n,bodyLetterSpacing:a},pe={...O,"--primary":r,"--brand":r,"--brand-soft":O["--brand-soft"]||r,"--brand-bg":O["--brand-bg"]||"rgba(202, 96, 147, 0.08)","--text":m,"--divider":p},ue={numberedHeadings:M.checked,headingLabel:q.value.trim()||void 0,quoteLabel:N.value.trim()||void 0},fe=[Ee(y),b.value,`.milkdown .editor p { margin: 0 0 ${c}; }`].filter(Boolean).join(`

`),A=await we({semanticHtml:t,baseCss:Ce,customCss:fe,structure:ue,editorVars:pe,theme:me});k=A,te.innerHTML=A,Be.value=A}catch(e){console.error("Studio render error:",e);const t=e instanceof Error?e.message:String(e);te.innerHTML=`<div style="color:#b91c1c;padding:16px;background:#fef2f2;border-radius:8px;">渲染错误: ${t}</div>`}}function d(o=60){F&&clearTimeout(F),F=setTimeout(()=>{$e()},o)}function Te(o){const e=document.getElementById("syntax-card-list");if(e){e.innerHTML="";for(const t of o){const i=document.createElement("div");i.className="syntax-card";const n=document.createElement("div");n.className="syntax-card-header";const a=document.createElement("span");a.className="syntax-card-title",a.textContent=t.name;const c=document.createElement("span");c.className="syntax-card-badge",c.textContent=t.category==="inline"?"行内扩展":"块级组件",n.appendChild(a),n.appendChild(c),i.appendChild(n);const r=document.createElement("p");r.className="syntax-card-desc",r.textContent=t.description,i.appendChild(r);const m=document.createElement("pre");m.className="syntax-code-snippet",m.textContent=t.sampleMarkdown,i.appendChild(m);const s=document.createElement("button");s.className="syntax-btn-insert",s.textContent="+ 插入示例到文章中",s.addEventListener("click",()=>{Pe(t.sampleMarkdown),g(`已插入「${t.name}」示例`,"info")}),i.appendChild(s),e.appendChild(i)}}}function Pe(o){const e=u.selectionStart,t=u.selectionEnd,i=u.value,n=`

${o}

`;u.value=i.slice(0,e)+n+i.slice(t),u.focus(),u.selectionStart=u.selectionEnd=e+n.length,d(20)}function ze(){const o=document.getElementById("syntax-preset-container");if(o){o.innerHTML="";for(const e of R){const t=document.createElement("div");t.className="preset-group";const i=document.createElement("div");i.className="preset-header";const n=document.createElement("span");n.className="preset-title",n.textContent=`${e.icon} ${e.label}`,i.appendChild(n);const a=!!(e.presets&&e.presets.length>1),c=document.createElement("button");if(c.type="button",c.className="btn-extract-css",c.textContent="📋 提取 CSS",c.title="将此语法的 CSS 追加到底部自定义编辑器，方便微调覆盖",c.addEventListener("click",()=>{let r="";if(a&&e.presets){const m=y[e.key]||e.defaultPresetId||e.presets[0].id,s=e.presets.find(l=>l.id===m)||e.presets[0];r=`/* [${e.label}] - ${s.name} */
${s.css.trim()}
`}else{const m=e.css||e.presets&&e.presets[0]?.css||"";r=`/* [${e.label}] 基础样式 */
${m.trim()}
`}r&&(b.value=b.value?`${b.value.trim()}

${r}`:r,b.focus(),b.scrollTop=b.scrollHeight,g(`已将「${e.label}」CSS 追加到底部编辑框！`,"info"),d(20))}),i.appendChild(c),t.appendChild(i),a&&e.presets){const r=document.createElement("select");r.className="preset-select",r.dataset.category=e.key;for(const x of e.presets){const p=document.createElement("option");p.value=x.id,p.textContent=x.name,r.appendChild(p)}const m=y[e.key]||e.defaultPresetId||e.presets[0].id;r.value=m,t.appendChild(r);const s=document.createElement("div");s.className="preset-desc";const l=e.presets.find(x=>x.id===m)||e.presets[0];s.textContent=l?.description||"",t.appendChild(s),r.addEventListener("change",()=>{y[e.key]=r.value;const x=e.presets.find(p=>p.id===r.value);s.textContent=x?.description||"",d(20)})}else if(e.description){const r=document.createElement("div");r.className="preset-desc",r.textContent=e.description,t.appendChild(r)}o.appendChild(t)}}}function U(o){const e=h[o];if(!e)return;const t=e.theme?.exportTheme||{},i=e.theme?.editorVars||{};if(t.containerStyle){const l=t.containerStyle.match(/font-size:\s*(\d+)px/);l&&(E.value=l[1],ie.textContent=`${l[1]}px`)}if(t.bodyLineHeight&&(L.value=t.bodyLineHeight,ae.textContent=t.bodyLineHeight),t.bodyLetterSpacing){const l=parseFloat(t.bodyLetterSpacing);isNaN(l)||(B.value=String(l),de.textContent=`${l}em`)}const n=i["--brand"]||t.primaryColor;n&&(W.value=n,S.value=n);const a=t.bodyColor||i["--text"];a&&(G.value=a,I.value=a),t.h2Color&&(Q.value=t.h2Color,H.value=t.h2Color),t.h3Color&&(Y.value=t.h3Color,$.value=t.h3Color);const c=t.blockquoteBorderColor||n;c&&(_.value=c,T.value=c);const r=t.dividerColor||i["--divider"];r&&(J.value=r,P.value=r),e.customCssContent?b.value=e.customCssContent:b.value="";const m=e.theme?.syntaxPresets||{};y={};for(const l of R)l.defaultPresetId&&(y[l.key]=m[l.key]||l.defaultPresetId);ze();const s=e.theme?.structure||{};M.checked=!!s.numberedHeadings,q.value=s.headingLabel||"",N.value=s.quoteLabel||"",d(20)}function Me(){if(C){C.innerHTML='<option value="">-- 选择推荐调色盘 (一键应用) --</option>';for(const o of Z){const e=document.createElement("option");e.value=o.id,e.textContent=`${o.name} · ${o.category}`,C.appendChild(e)}C.addEventListener("change",()=>{const o=Z.find(e=>e.id===C.value);o&&(W.value=S.value=o.colors.brand,G.value=I.value=o.colors.text,Q.value=H.value=o.colors.h2,Y.value=$.value=o.colors.h3,_.value=T.value=o.colors.quote,J.value=P.value=o.colors.divider,re&&(re.textContent=o.description),g(`已应用「${o.name}」高级配色方案！`,"info"),d(20))})}}async function qe(){Me();try{const o=await fetch("/api/studio/config");if(!o.ok)throw new Error(`HTTP ${o.status}`);const e=await o.json();h=e.accounts||{},f=e.defaultAccount||"default",ee=e.plugins||[],z.innerHTML="";for(const[t,i]of Object.entries(h)){const n=document.createElement("option");n.value=t,n.textContent=`${i.name||t} (${t})`,t===f&&(n.selected=!0),z.appendChild(n)}u.value=e.sampleMarkdown||`# 微信排版标题

欢迎使用 WeChat Visual Studio！`,Te(ee),U(f)}catch(o){console.error("Failed to load studio config:",o),g("无法加载配置，使用默认设置","error"),d(20)}}z.addEventListener("change",()=>{f=z.value,U(f)});u.addEventListener("input",()=>d(40));E.addEventListener("input",()=>{ie.textContent=`${E.value}px`,d(20)});L.addEventListener("input",()=>{ae.textContent=L.value,d(20)});B.addEventListener("input",()=>{de.textContent=`${B.value}em`,d(20)});j.addEventListener("input",()=>{Ie.textContent=`${j.value}em`,d(20)});w(W,S,()=>d(20));w(G,I,()=>d(20));w(Q,H,()=>d(20));w(Y,$,()=>d(20));w(_,T,()=>d(20));w(J,P,()=>d(20));M.addEventListener("change",()=>d(20));q.addEventListener("input",()=>d(40));N.addEventListener("input",()=>d(40));b.addEventListener("input",()=>d(60));const D=document.getElementById("tab-btn-style"),K=document.getElementById("tab-btn-syntax"),ce=document.getElementById("tab-content-style"),se=document.getElementById("tab-content-syntax");D.addEventListener("click",()=>{D.classList.add("active"),K.classList.remove("active"),ce.style.display="block",se.style.display="none"});K.addEventListener("click",()=>{K.classList.add("active"),D.classList.remove("active"),ce.style.display="none",se.style.display="block"});document.getElementById("btn-load-sample")?.addEventListener("click",async()=>{const e=await(await fetch("/api/studio/config")).json();u.value=e.sampleMarkdown||"",d(20),g("已加载官方全语法测试稿","info")});document.getElementById("btn-clear-md")?.addEventListener("click",()=>{u.value="",d(20)});document.getElementById("btn-toggle-view")?.addEventListener("click",o=>{const e=o.currentTarget;V=!V,V?(oe.style.display="block",e.textContent="📱 返回视图"):(oe.style.display="none",e.textContent="🔍 查看 HTML 源码")});document.getElementById("btn-reset")?.addEventListener("click",()=>{U(f),g("已重置为当前账号默认样式","info")});document.getElementById("btn-save")?.addEventListener("click",async()=>{const o=Number(E.value)||16,e=L.value||"1.84",t=`${B.value}em`,i=S.value,n=I.value,a=H.value,c=$.value,r=T.value,m=P.value,s=h[f]?.theme?.editorVars||{},l=h[f]?.theme?.exportTheme||{},x={account:f,editorVars:{...s,"--primary":i,"--brand":i,"--text":n,"--divider":m},exportTheme:{...l,fontSize:`${o}px`,bodyColor:n,h2Color:a,h3Color:c,primaryColor:i,dividerColor:m,blockquoteBorderColor:r,bodyLineHeight:e,bodyLetterSpacing:t},syntaxPresets:y,customCss:b.value,structure:{numberedHeadings:M.checked,headingLabel:q.value.trim()||void 0,quoteLabel:N.value.trim()||void 0}};try{const p=await fetch("/api/studio/save-config",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(x)}),v=await p.json();p.ok&&v.ok?(h[f]?.theme&&(h[f].theme.syntaxPresets={...y}),g("✅ 配置已成功保存至本地 config.json！","success")):g(`保存失败: ${v.error||"未知错误"}`,"error")}catch(p){g(`网络请求失败: ${String(p)}`,"error")}});document.getElementById("btn-copy")?.addEventListener("click",async()=>{if(!k){g("文章内容为空","error");return}try{const o=new Blob([k],{type:"text/html"}),e=new Blob([k],{type:"text/plain"});await navigator.clipboard.write([new ClipboardItem({"text/html":o,"text/plain":e})]),g("📋 已复制富文本！可在微信公众号后台直接粘贴 (Cmd+V)","success")}catch(o){console.error("Clipboard write error:",o);const e=t=>{t.clipboardData?.setData("text/html",k),t.clipboardData?.setData("text/plain",k),t.preventDefault()};document.addEventListener("copy",e),document.execCommand("copy"),document.removeEventListener("copy",e),g("📋 已复制富文本（后备通道）","success")}});qe();
