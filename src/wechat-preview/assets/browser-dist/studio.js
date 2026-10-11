import{E as ge,r as be,d as he,c as ve,g as xe,a as ye,b as Ce,e as Ee,f as ke}from"./assets/wechat-renderer-Cf1C61aM.js";(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))a(n);new MutationObserver(n=>{for(const r of n)if(r.type==="childList")for(const i of r.addedNodes)i.tagName==="LINK"&&i.rel==="modulepreload"&&a(i)}).observe(document,{childList:!0,subtree:!0});function t(n){const r={};return n.integrity&&(r.integrity=n.integrity),n.referrerPolicy&&(r.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?r.credentials="include":n.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function a(n){if(n.ep)return;n.ep=!0;const r=t(n);fetch(n.href,r)}})();const W=[{key:"h2",label:"二级标题 (H2)",icon:"📌",defaultPresetId:"pillar",presets:[{id:"pillar",name:"左侧呼吸柱（推荐）",description:"2.5px 品牌色垂直微线 + 9px 内边距 + 2.8em 非对称呼吸留白",css:`.milkdown .editor h2 {
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
}`}]},{key:"blockquote",label:"引用块 (Blockquote)",icon:"💬",defaultPresetId:"left-border",presets:[{id:"left-border",name:"经典左单线（默认）",description:"3px 品牌色微边框 + 浅灰底色 + 4px 右圆角",css:`.milkdown .editor blockquote {
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
}`}]},{key:"divider",label:"分割线 (Divider)",icon:"➖",defaultPresetId:"hairline",presets:[{id:"hairline",name:"极细实线（默认）",description:"1px 浅灰色水平实线",css:`.milkdown .editor hr {
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
}`}]}];function we(o){const e=[];for(const t of W){const a=o[t.key]||t.defaultPresetId,n=t.presets.find(r=>r.id===a)||t.presets[0];n&&n.css.trim()&&e.push(`/* [${t.label}] - ${n.name} */
${n.css.trim()}`)}return e.join(`

`)}const Z=[{id:"forest-sage",name:"🌿 森林墨绿 (Kinfolk / 少数派)",category:"生活方式与编辑部",description:"《Kinfolk》生活美学：沉稳深松绿强调色，搭配松针深黑与浅灰绿分割线",colors:{brand:"#1f6f4a",text:"#1f2320",h2:"#154c33",h3:"#2e7d58",quote:"#3d8e64",divider:"#e1ebe5"}},{id:"oatmeal-earth",name:"☕ 燕麦大地 (理想国 / 暖调成衣)",category:"时尚与书籍出版",description:"Loro Piana 暖调成衣美学：深焦糖陶土棕、浓咖啡黑与温润燕麦米灰",colors:{brand:"#945938",text:"#2b2623",h2:"#1f1b18",h3:"#6b3f27",quote:"#b37954",divider:"#eae4dd"}},{id:"slate-indigo",name:"🏛️ 石板深蓝 (纽约客 / Substack)",category:"深度专栏与智识",description:"经典严肃刊物：午夜深藏青做标识，石板灰文字与干净蓝灰分割",colors:{brand:"#2563eb",text:"#1e293b",h2:"#0f172a",h3:"#334155",quote:"#3b82f6",divider:"#e2e8f0"}},{id:"burgundy-velvet",name:"🍷 勃艮第红 (Vogue / 先锋艺术)",category:"高级时尚与设计",description:"复古先锋美学：丝绒绛红做点睛，黑绒字色与淡玫瑰粉灰底线",colors:{brand:"#881337",text:"#231f20",h2:"#1a1617",h3:"#4c1d2e",quote:"#9f1239",divider:"#f2e5ea"}},{id:"matcha-bamboo",name:"🍵 极简煎茶 (无印良品 / 东方和风)",category:"极简器物与禅意",description:"日系器物美学：深橄榄煎茶色、竹炭色正文与和纸灰底线",colors:{brand:"#556b2f",text:"#262923",h2:"#1c211a",h3:"#435528",quote:"#708846",divider:"#e7eae1"}},{id:"titanium-cyan",name:"🌌 极客钛灰 (Linear / Arc 现代界面)",category:"现代数字与 App",description:"当代高端数字界面：极光冷青点缀、深空曜黑文字与钛金属浅灰",colors:{brand:"#0284c7",text:"#18181b",h2:"#09090b",h3:"#27272a",quote:"#0ea5e9",divider:"#e4e4e7"}},{id:"rose-ledger",name:"🌸 晚樱柔粉 (古一软件经典标配)",category:"人文与故事叙述",description:"经典温润配色：干枯玫瑰粉与深铅黑文字，温柔克制",colors:{brand:"#ca6093",text:"#292526",h2:"#1f1b1c",h3:"#5c5658",quote:"#ca6093",divider:"#dadce0"}}];let x={},f="default",ee=[],C="",V=null,A=!1,y={};const q=document.getElementById("account-select"),p=document.getElementById("editor-markdown"),te=document.getElementById("preview-screen"),Le=document.getElementById("editor-stats"),oe=document.getElementById("html-source-container"),Be=document.getElementById("html-source-code"),Se=document.getElementById("toast-container"),ne=document.getElementById("studio-editor-host"),w=document.getElementById("input-font-size"),ae=document.getElementById("val-font-size"),L=document.getElementById("input-line-height"),ie=document.getElementById("val-line-height"),B=document.getElementById("input-letter-spacing"),ce=document.getElementById("val-letter-spacing"),j=document.getElementById("input-para-spacing"),Ie=document.getElementById("val-para-spacing"),k=document.getElementById("palette-select"),re=document.getElementById("palette-desc"),G=document.getElementById("picker-brand-color"),S=document.getElementById("hex-brand-color"),K=document.getElementById("picker-text-color"),I=document.getElementById("hex-text-color"),Q=document.getElementById("picker-h2-color"),H=document.getElementById("hex-h2-color"),Y=document.getElementById("picker-h3-color"),$=document.getElementById("hex-h3-color"),_=document.getElementById("picker-quote-color"),T=document.getElementById("hex-quote-color"),J=document.getElementById("picker-divider-color"),P=document.getElementById("hex-divider-color"),N=document.getElementById("switch-numbered-headings"),M=document.getElementById("input-heading-label"),z=document.getElementById("input-quote-label"),b=document.getElementById("input-custom-css");function g(o,e="info"){const t=document.createElement("div");t.className=`toast ${e==="success"?"toast-success":""}`,t.textContent=o,Se.appendChild(t),requestAnimationFrame(()=>t.classList.add("show")),setTimeout(()=>{t.classList.remove("show"),setTimeout(()=>t.remove(),300)},3e3)}function E(o,e,t){o.addEventListener("input",()=>{e.value=o.value,t()}),e.addEventListener("input",()=>{/^#[0-9a-f]{6}$/i.test(e.value)&&(o.value=e.value,t())})}function He(){const e=p.value.replace(/\s+/g,"").length,t=Math.max(1,Math.round(e/400));Le.textContent=`字数: ${e.toLocaleString()} 字 | 预计阅读: ${t} 分钟`}async function $e(){const o=p.value;He();try{ne.innerHTML="";const e=ge.make().config(U=>{U.set(be,ne),U.set(he,o)}).use(ve).use(xe).use(ye());await e.create();const t=e.action(Ce());await e.destroy();const a=Number(w.value)||16,n=L.value||"1.84",r=`${B.value}em`,i=`${j.value}em`,d=S.value||"#ca6093",l=I.value||"#292526",m=H.value||"#1f1b1c",c=$.value||"#5c5658",u=T.value||"#ca6093",h=P.value||"#dadce0",v=x[f]?.theme?.exportTheme||{},F=x[f]?.theme?.editorVars||{},le=["max-width: 100%","margin: 0","padding: 10px 4px 30px","background: #ffffff","box-sizing: border-box","font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",`font-size: ${a}px`,`color: ${l}`,"overflow-wrap: break-word","word-break: break-word",`line-height: ${n}`,`letter-spacing: ${r}`,"-webkit-text-size-adjust: 100%"].join("; "),me={...v,containerStyle:le,footerText:v.footerText??"",footerStyle:v.footerStyle??"margin-top: 32px; text-align: center; font-size: 12px; color: #6f696b;",fontFamily:v.fontFamily||"-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",bodyColor:l,mutedColor:v.mutedColor||"#5f6368",h2Color:m,h3Color:c,primaryColor:d,dividerColor:h,blockquoteBorderColor:u,bodyLineHeight:n,bodyLetterSpacing:r},ue={...F,"--primary":d,"--brand":d,"--brand-soft":F["--brand-soft"]||d,"--brand-bg":F["--brand-bg"]||"rgba(202, 96, 147, 0.08)","--text":l,"--divider":h},pe={numberedHeadings:N.checked,headingLabel:M.value.trim()||void 0,quoteLabel:z.value.trim()||void 0},fe=[we(y),b.value,`.milkdown .editor p { margin: 0 0 ${i}; }`].filter(Boolean).join(`

`),O=await Ee({semanticHtml:t,baseCss:ke,customCss:fe,structure:pe,editorVars:ue,theme:me});C=O,te.innerHTML=O,Be.value=O}catch(e){console.error("Studio render error:",e);const t=e instanceof Error?e.message:String(e);te.innerHTML=`<div style="color:#b91c1c;padding:16px;background:#fef2f2;border-radius:8px;">渲染错误: ${t}</div>`}}function s(o=60){V&&clearTimeout(V),V=setTimeout(()=>{$e()},o)}function Te(o){const e=document.getElementById("syntax-card-list");if(e){e.innerHTML="";for(const t of o){const a=document.createElement("div");a.className="syntax-card";const n=document.createElement("div");n.className="syntax-card-header";const r=document.createElement("span");r.className="syntax-card-title",r.textContent=t.name;const i=document.createElement("span");i.className="syntax-card-badge",i.textContent=t.category==="inline"?"行内扩展":"块级组件",n.appendChild(r),n.appendChild(i),a.appendChild(n);const d=document.createElement("p");d.className="syntax-card-desc",d.textContent=t.description,a.appendChild(d);const l=document.createElement("pre");l.className="syntax-code-snippet",l.textContent=t.sampleMarkdown,a.appendChild(l);const m=document.createElement("button");m.className="syntax-btn-insert",m.textContent="+ 插入示例到文章中",m.addEventListener("click",()=>{Pe(t.sampleMarkdown),g(`已插入「${t.name}」示例`,"info")}),a.appendChild(m),e.appendChild(a)}}}function Pe(o){const e=p.selectionStart,t=p.selectionEnd,a=p.value,n=`

${o}

`;p.value=a.slice(0,e)+n+a.slice(t),p.focus(),p.selectionStart=p.selectionEnd=e+n.length,s(20)}function qe(){const o=document.getElementById("syntax-preset-container");if(o){o.innerHTML="";for(const e of W){const t=document.createElement("div");t.className="preset-group";const a=document.createElement("div");a.className="preset-header";const n=document.createElement("span");n.className="preset-title",n.textContent=`${e.icon} ${e.label}`,a.appendChild(n);const r=document.createElement("button");r.type="button",r.className="btn-extract-css",r.textContent="📋 提取 CSS",r.title="将此语法的当前预设 CSS 追加到底部自定义编辑器，方便微调",r.addEventListener("click",()=>{const c=y[e.key]||e.defaultPresetId,u=e.presets.find(v=>v.id===c)||e.presets[0];if(!u)return;const h=`/* [${e.label}] - ${u.name} */
${u.css.trim()}
`;b.value=b.value?`${b.value.trim()}

${h}`:h,b.focus(),b.scrollTop=b.scrollHeight,g(`已将「${u.name}」CSS 追加到底部编辑框！`,"info"),s(20)}),a.appendChild(r),t.appendChild(a);const i=document.createElement("select");i.className="preset-select",i.dataset.category=e.key;for(const c of e.presets){const u=document.createElement("option");u.value=c.id,u.textContent=c.name,i.appendChild(u)}const d=y[e.key]||e.defaultPresetId;i.value=d,t.appendChild(i);const l=document.createElement("div");l.className="preset-desc";const m=e.presets.find(c=>c.id===d)||e.presets[0];l.textContent=m?.description||"",t.appendChild(l),i.addEventListener("change",()=>{y[e.key]=i.value;const c=e.presets.find(u=>u.id===i.value);l.textContent=c?.description||"",s(20)}),o.appendChild(t)}}}function X(o){const e=x[o];if(!e)return;const t=e.theme?.exportTheme||{},a=e.theme?.editorVars||{};if(t.containerStyle){const c=t.containerStyle.match(/font-size:\s*(\d+)px/);c&&(w.value=c[1],ae.textContent=`${c[1]}px`)}if(t.bodyLineHeight&&(L.value=t.bodyLineHeight,ie.textContent=t.bodyLineHeight),t.bodyLetterSpacing){const c=parseFloat(t.bodyLetterSpacing);isNaN(c)||(B.value=String(c),ce.textContent=`${c}em`)}const n=a["--brand"]||t.primaryColor;n&&(G.value=n,S.value=n);const r=t.bodyColor||a["--text"];r&&(K.value=r,I.value=r),t.h2Color&&(Q.value=t.h2Color,H.value=t.h2Color),t.h3Color&&(Y.value=t.h3Color,$.value=t.h3Color);const i=t.blockquoteBorderColor||n;i&&(_.value=i,T.value=i);const d=t.dividerColor||a["--divider"];d&&(J.value=d,P.value=d),e.customCssContent?b.value=e.customCssContent:b.value="";const l=e.theme?.syntaxPresets||{};y={};for(const c of W)y[c.key]=l[c.key]||c.defaultPresetId;qe();const m=e.theme?.structure||{};N.checked=!!m.numberedHeadings,M.value=m.headingLabel||"",z.value=m.quoteLabel||"",s(20)}function Ne(){if(k){k.innerHTML='<option value="">-- 选择推荐调色盘 (一键应用) --</option>';for(const o of Z){const e=document.createElement("option");e.value=o.id,e.textContent=`${o.name} · ${o.category}`,k.appendChild(e)}k.addEventListener("change",()=>{const o=Z.find(e=>e.id===k.value);o&&(G.value=S.value=o.colors.brand,K.value=I.value=o.colors.text,Q.value=H.value=o.colors.h2,Y.value=$.value=o.colors.h3,_.value=T.value=o.colors.quote,J.value=P.value=o.colors.divider,re&&(re.textContent=o.description),g(`已应用「${o.name}」高级配色方案！`,"info"),s(20))})}}async function Me(){Ne();try{const o=await fetch("/api/studio/config");if(!o.ok)throw new Error(`HTTP ${o.status}`);const e=await o.json();x=e.accounts||{},f=e.defaultAccount||"default",ee=e.plugins||[],q.innerHTML="";for(const[t,a]of Object.entries(x)){const n=document.createElement("option");n.value=t,n.textContent=`${a.name||t} (${t})`,t===f&&(n.selected=!0),q.appendChild(n)}p.value=e.sampleMarkdown||`# 微信排版标题

欢迎使用 WeChat Visual Studio！`,Te(ee),X(f)}catch(o){console.error("Failed to load studio config:",o),g("无法加载配置，使用默认设置","error"),s(20)}}q.addEventListener("change",()=>{f=q.value,X(f)});p.addEventListener("input",()=>s(40));w.addEventListener("input",()=>{ae.textContent=`${w.value}px`,s(20)});L.addEventListener("input",()=>{ie.textContent=L.value,s(20)});B.addEventListener("input",()=>{ce.textContent=`${B.value}em`,s(20)});j.addEventListener("input",()=>{Ie.textContent=`${j.value}em`,s(20)});E(G,S,()=>s(20));E(K,I,()=>s(20));E(Q,H,()=>s(20));E(Y,$,()=>s(20));E(_,T,()=>s(20));E(J,P,()=>s(20));N.addEventListener("change",()=>s(20));M.addEventListener("input",()=>s(40));z.addEventListener("input",()=>s(40));b.addEventListener("input",()=>s(60));const D=document.getElementById("tab-btn-style"),R=document.getElementById("tab-btn-syntax"),se=document.getElementById("tab-content-style"),de=document.getElementById("tab-content-syntax");D.addEventListener("click",()=>{D.classList.add("active"),R.classList.remove("active"),se.style.display="block",de.style.display="none"});R.addEventListener("click",()=>{R.classList.add("active"),D.classList.remove("active"),se.style.display="none",de.style.display="block"});document.getElementById("btn-load-sample")?.addEventListener("click",async()=>{const e=await(await fetch("/api/studio/config")).json();p.value=e.sampleMarkdown||"",s(20),g("已加载官方全语法测试稿","info")});document.getElementById("btn-clear-md")?.addEventListener("click",()=>{p.value="",s(20)});document.getElementById("btn-toggle-view")?.addEventListener("click",o=>{const e=o.currentTarget;A=!A,A?(oe.style.display="block",e.textContent="📱 返回视图"):(oe.style.display="none",e.textContent="🔍 查看 HTML 源码")});document.getElementById("btn-reset")?.addEventListener("click",()=>{X(f),g("已重置为当前账号默认样式","info")});document.getElementById("btn-save")?.addEventListener("click",async()=>{const o=Number(w.value)||16,e=L.value||"1.84",t=`${B.value}em`,a=S.value,n=I.value,r=H.value,i=$.value,d=T.value,l=P.value,m=x[f]?.theme?.editorVars||{},c=x[f]?.theme?.exportTheme||{},u={account:f,editorVars:{...m,"--primary":a,"--brand":a,"--text":n,"--divider":l},exportTheme:{...c,fontSize:`${o}px`,bodyColor:n,h2Color:r,h3Color:i,primaryColor:a,dividerColor:l,blockquoteBorderColor:d,bodyLineHeight:e,bodyLetterSpacing:t},syntaxPresets:y,customCss:b.value,structure:{numberedHeadings:N.checked,headingLabel:M.value.trim()||void 0,quoteLabel:z.value.trim()||void 0}};try{const h=await fetch("/api/studio/save-config",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(u)}),v=await h.json();h.ok&&v.ok?(x[f]?.theme&&(x[f].theme.syntaxPresets={...y}),g("✅ 配置已成功保存至本地 config.json！","success")):g(`保存失败: ${v.error||"未知错误"}`,"error")}catch(h){g(`网络请求失败: ${String(h)}`,"error")}});document.getElementById("btn-copy")?.addEventListener("click",async()=>{if(!C){g("文章内容为空","error");return}try{const o=new Blob([C],{type:"text/html"}),e=new Blob([C],{type:"text/plain"});await navigator.clipboard.write([new ClipboardItem({"text/html":o,"text/plain":e})]),g("📋 已复制富文本！可在微信公众号后台直接粘贴 (Cmd+V)","success")}catch(o){console.error("Clipboard write error:",o);const e=t=>{t.clipboardData?.setData("text/html",C),t.clipboardData?.setData("text/plain",C),t.preventDefault()};document.addEventListener("copy",e),document.execCommand("copy"),document.removeEventListener("copy",e),g("📋 已复制富文本（后备通道）","success")}});Me();
