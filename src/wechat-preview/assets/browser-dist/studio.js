import{E as ue,r as pe,d as ge,c as fe,g as be,a as he,b as xe,e as ve,f as ye}from"./assets/wechat-renderer-Cf1C61aM.js";(function(){const e=document.createElement("link").relList;if(e&&e.supports&&e.supports("modulepreload"))return;for(const n of document.querySelectorAll('link[rel="modulepreload"]'))i(n);new MutationObserver(n=>{for(const r of n)if(r.type==="childList")for(const d of r.addedNodes)d.tagName==="LINK"&&d.rel==="modulepreload"&&i(d)}).observe(document,{childList:!0,subtree:!0});function t(n){const r={};return n.integrity&&(r.integrity=n.integrity),n.referrerPolicy&&(r.referrerPolicy=n.referrerPolicy),n.crossOrigin==="use-credentials"?r.credentials="include":n.crossOrigin==="anonymous"?r.credentials="omit":r.credentials="same-origin",r}function i(n){if(n.ep)return;n.ep=!0;const r=t(n);fetch(n.href,r)}})();const O=[{key:"h2",label:"二级标题 (H2)",icon:"📌",defaultPresetId:"pillar",presets:[{id:"pillar",name:"左侧呼吸柱（推荐）",description:"2.5px 品牌色垂直微线 + 9px 内边距 + 2.8em 非对称呼吸留白",css:`.milkdown .editor h2 {
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
}`}]}];function Ce(o){const e=[];for(const t of O){const i=o[t.key]||t.defaultPresetId,n=t.presets.find(r=>r.id===i)||t.presets[0];n&&n.css.trim()&&e.push(`/* [${t.label}] - ${n.name} */
${n.css.trim()}`)}return e.join(`

`)}let f={},u="default",R=[],v="",z=null,q=!1,x={};const L=document.getElementById("account-select"),m=document.getElementById("editor-markdown"),Y=document.getElementById("preview-screen"),Ee=document.getElementById("editor-stats"),J=document.getElementById("html-source-container"),we=document.getElementById("html-source-code"),ke=document.getElementById("toast-container"),K=document.getElementById("studio-editor-host"),C=document.getElementById("input-font-size"),X=document.getElementById("val-font-size"),E=document.getElementById("input-line-height"),_=document.getElementById("val-line-height"),w=document.getElementById("input-letter-spacing"),U=document.getElementById("val-letter-spacing"),F=document.getElementById("input-para-spacing"),Le=document.getElementById("val-para-spacing"),Z=document.getElementById("picker-brand-color"),B=document.getElementById("hex-brand-color"),ee=document.getElementById("picker-text-color"),I=document.getElementById("hex-text-color"),te=document.getElementById("picker-h2-color"),S=document.getElementById("hex-h2-color"),ne=document.getElementById("picker-h3-color"),H=document.getElementById("hex-h3-color"),oe=document.getElementById("picker-quote-color"),T=document.getElementById("hex-quote-color"),re=document.getElementById("picker-divider-color"),P=document.getElementById("hex-divider-color"),A=document.getElementById("switch-numbered-headings"),D=document.getElementById("input-heading-label"),W=document.getElementById("input-quote-label"),k=document.getElementById("input-custom-css");function p(o,e="info"){const t=document.createElement("div");t.className=`toast ${e==="success"?"toast-success":""}`,t.textContent=o,ke.appendChild(t),requestAnimationFrame(()=>t.classList.add("show")),setTimeout(()=>{t.classList.remove("show"),setTimeout(()=>t.remove(),300)},3e3)}function y(o,e,t){o.addEventListener("input",()=>{e.value=o.value,t()}),e.addEventListener("input",()=>{/^#[0-9a-f]{6}$/i.test(e.value)&&(o.value=e.value,t())})}function Be(){const e=m.value.replace(/\s+/g,"").length,t=Math.max(1,Math.round(e/400));Ee.textContent=`字数: ${e.toLocaleString()} 字 | 预计阅读: ${t} 分钟`}async function Ie(){const o=m.value;Be();try{K.innerHTML="";const e=ue.make().config(Q=>{Q.set(pe,K),Q.set(ge,o)}).use(fe).use(be).use(he());await e.create();const t=e.action(xe());await e.destroy();const i=Number(C.value)||16,n=E.value||"1.84",r=`${w.value}em`,d=`${F.value}em`,c=B.value||"#ca6093",l=I.value||"#292526",a=S.value||"#1f1b1c",g=H.value||"#5c5658",$=T.value||"#ca6093",h=P.value||"#dadce0",b=f[u]?.theme?.exportTheme||{},N=f[u]?.theme?.editorVars||{},se=["max-width: 100%","margin: 0","padding: 10px 4px 30px","background: #ffffff","box-sizing: border-box","font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",`font-size: ${i}px`,`color: ${l}`,"overflow-wrap: break-word","word-break: break-word",`line-height: ${n}`,`letter-spacing: ${r}`,"-webkit-text-size-adjust: 100%"].join("; "),ce={...b,containerStyle:se,footerText:b.footerText??"",footerStyle:b.footerStyle??"margin-top: 32px; text-align: center; font-size: 12px; color: #6f696b;",fontFamily:b.fontFamily||"-apple-system, BlinkMacSystemFont, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif",bodyColor:l,mutedColor:b.mutedColor||"#5f6368",h2Color:a,h3Color:g,primaryColor:c,dividerColor:h,blockquoteBorderColor:$,bodyLineHeight:n,bodyLetterSpacing:r},de={...N,"--primary":c,"--brand":c,"--brand-soft":N["--brand-soft"]||c,"--brand-bg":N["--brand-bg"]||"rgba(202, 96, 147, 0.08)","--text":l,"--divider":h},le={numberedHeadings:A.checked,headingLabel:D.value.trim()||void 0,quoteLabel:W.value.trim()||void 0},me=[Ce(x),k.value,`.milkdown .editor p { margin: 0 0 ${d}; }`].filter(Boolean).join(`

`),M=await ve({semanticHtml:t,baseCss:ye,customCss:me,structure:le,editorVars:de,theme:ce});v=M,Y.innerHTML=M,we.value=M}catch(e){console.error("Studio render error:",e);const t=e instanceof Error?e.message:String(e);Y.innerHTML=`<div style="color:#b91c1c;padding:16px;background:#fef2f2;border-radius:8px;">渲染错误: ${t}</div>`}}function s(o=60){z&&clearTimeout(z),z=setTimeout(()=>{Ie()},o)}function Se(o){const e=document.getElementById("syntax-card-list");if(e){e.innerHTML="";for(const t of o){const i=document.createElement("div");i.className="syntax-card";const n=document.createElement("div");n.className="syntax-card-header";const r=document.createElement("span");r.className="syntax-card-title",r.textContent=t.name;const d=document.createElement("span");d.className="syntax-card-badge",d.textContent=t.category==="inline"?"行内扩展":"块级组件",n.appendChild(r),n.appendChild(d),i.appendChild(n);const c=document.createElement("p");c.className="syntax-card-desc",c.textContent=t.description,i.appendChild(c);const l=document.createElement("pre");l.className="syntax-code-snippet",l.textContent=t.sampleMarkdown,i.appendChild(l);const a=document.createElement("button");a.className="syntax-btn-insert",a.textContent="+ 插入示例到文章中",a.addEventListener("click",()=>{He(t.sampleMarkdown),p(`已插入「${t.name}」示例`,"info")}),i.appendChild(a),e.appendChild(i)}}}function He(o){const e=m.selectionStart,t=m.selectionEnd,i=m.value,n=`

${o}

`;m.value=i.slice(0,e)+n+i.slice(t),m.focus(),m.selectionStart=m.selectionEnd=e+n.length,s(20)}function Te(){const o=document.getElementById("syntax-preset-container");if(o){o.innerHTML="";for(const e of O){const t=document.createElement("div");t.className="preset-group";const i=document.createElement("div");i.className="preset-header";const n=document.createElement("span");n.className="preset-title",n.textContent=`${e.icon} ${e.label}`,i.appendChild(n),t.appendChild(i);const r=document.createElement("select");r.className="preset-select",r.dataset.category=e.key;for(const a of e.presets){const g=document.createElement("option");g.value=a.id,g.textContent=a.name,r.appendChild(g)}const d=x[e.key]||e.defaultPresetId;r.value=d,t.appendChild(r);const c=document.createElement("div");c.className="preset-desc";const l=e.presets.find(a=>a.id===d)||e.presets[0];c.textContent=l?.description||"",t.appendChild(c),r.addEventListener("change",()=>{x[e.key]=r.value;const a=e.presets.find(g=>g.id===r.value);c.textContent=a?.description||"",s(20)}),o.appendChild(t)}}}function G(o){const e=f[o];if(!e)return;const t=e.theme?.exportTheme||{},i=e.theme?.editorVars||{};if(t.containerStyle){const a=t.containerStyle.match(/font-size:\s*(\d+)px/);a&&(C.value=a[1],X.textContent=`${a[1]}px`)}if(t.bodyLineHeight&&(E.value=t.bodyLineHeight,_.textContent=t.bodyLineHeight),t.bodyLetterSpacing){const a=parseFloat(t.bodyLetterSpacing);isNaN(a)||(w.value=String(a),U.textContent=`${a}em`)}const n=i["--brand"]||t.primaryColor;n&&(Z.value=n,B.value=n);const r=t.bodyColor||i["--text"];r&&(ee.value=r,I.value=r),t.h2Color&&(te.value=t.h2Color,S.value=t.h2Color),t.h3Color&&(ne.value=t.h3Color,H.value=t.h3Color);const d=t.blockquoteBorderColor||n;d&&(oe.value=d,T.value=d);const c=t.dividerColor||i["--divider"];c&&(re.value=c,P.value=c),e.customCssContent?k.value=e.customCssContent:k.value="";const l=e.theme?.syntaxPresets||{};x={};for(const a of O)x[a.key]=l[a.key]||a.defaultPresetId;Te(),s(20)}async function Pe(){try{const o=await fetch("/api/studio/config");if(!o.ok)throw new Error(`HTTP ${o.status}`);const e=await o.json();f=e.accounts||{},u=e.defaultAccount||"default",R=e.plugins||[],L.innerHTML="";for(const[t,i]of Object.entries(f)){const n=document.createElement("option");n.value=t,n.textContent=`${i.name||t} (${t})`,t===u&&(n.selected=!0),L.appendChild(n)}m.value=e.sampleMarkdown||`# 微信排版标题

欢迎使用 WeChat Visual Studio！`,Se(R),G(u)}catch(o){console.error("Failed to load studio config:",o),p("无法加载配置，使用默认设置","error"),s(20)}}L.addEventListener("change",()=>{u=L.value,G(u)});m.addEventListener("input",()=>s(40));C.addEventListener("input",()=>{X.textContent=`${C.value}px`,s(20)});E.addEventListener("input",()=>{_.textContent=E.value,s(20)});w.addEventListener("input",()=>{U.textContent=`${w.value}em`,s(20)});F.addEventListener("input",()=>{Le.textContent=`${F.value}em`,s(20)});y(Z,B,()=>s(20));y(ee,I,()=>s(20));y(te,S,()=>s(20));y(ne,H,()=>s(20));y(oe,T,()=>s(20));y(re,P,()=>s(20));A.addEventListener("change",()=>s(20));D.addEventListener("input",()=>s(40));W.addEventListener("input",()=>s(40));k.addEventListener("input",()=>s(60));const V=document.getElementById("tab-btn-style"),j=document.getElementById("tab-btn-syntax"),ie=document.getElementById("tab-content-style"),ae=document.getElementById("tab-content-syntax");V.addEventListener("click",()=>{V.classList.add("active"),j.classList.remove("active"),ie.style.display="block",ae.style.display="none"});j.addEventListener("click",()=>{j.classList.add("active"),V.classList.remove("active"),ie.style.display="none",ae.style.display="block"});document.getElementById("btn-load-sample")?.addEventListener("click",async()=>{const e=await(await fetch("/api/studio/config")).json();m.value=e.sampleMarkdown||"",s(20),p("已加载官方全语法测试稿","info")});document.getElementById("btn-clear-md")?.addEventListener("click",()=>{m.value="",s(20)});document.getElementById("btn-toggle-view")?.addEventListener("click",o=>{const e=o.currentTarget;q=!q,q?(J.style.display="block",e.textContent="📱 返回视图"):(J.style.display="none",e.textContent="🔍 查看 HTML 源码")});document.getElementById("btn-reset")?.addEventListener("click",()=>{G(u),p("已重置为当前账号默认样式","info")});document.getElementById("btn-save")?.addEventListener("click",async()=>{const o=Number(C.value)||16,e=E.value||"1.84",t=`${w.value}em`,i=B.value,n=I.value,r=S.value,d=H.value,c=T.value,l=P.value,a=f[u]?.theme?.editorVars||{},g=f[u]?.theme?.exportTheme||{},$={account:u,editorVars:{...a,"--primary":i,"--brand":i,"--text":n,"--divider":l},exportTheme:{...g,fontSize:`${o}px`,bodyColor:n,h2Color:r,h3Color:d,primaryColor:i,dividerColor:l,blockquoteBorderColor:c,bodyLineHeight:e,bodyLetterSpacing:t},syntaxPresets:x,customCss:k.value,structure:{numberedHeadings:A.checked,headingLabel:D.value.trim()||void 0,quoteLabel:W.value.trim()||void 0}};try{const h=await fetch("/api/studio/save-config",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify($)}),b=await h.json();h.ok&&b.ok?(f[u]?.theme&&(f[u].theme.syntaxPresets={...x}),p("✅ 配置已成功保存至本地 config.json！","success")):p(`保存失败: ${b.error||"未知错误"}`,"error")}catch(h){p(`网络请求失败: ${String(h)}`,"error")}});document.getElementById("btn-copy")?.addEventListener("click",async()=>{if(!v){p("文章内容为空","error");return}try{const o=new Blob([v],{type:"text/html"}),e=new Blob([v],{type:"text/plain"});await navigator.clipboard.write([new ClipboardItem({"text/html":o,"text/plain":e})]),p("📋 已复制富文本！可在微信公众号后台直接粘贴 (Cmd+V)","success")}catch(o){console.error("Clipboard write error:",o);const e=t=>{t.clipboardData?.setData("text/html",v),t.clipboardData?.setData("text/plain",v),t.preventDefault()};document.addEventListener("copy",e),document.execCommand("copy"),document.removeEventListener("copy",e),p("📋 已复制富文本（后备通道）","success")}});Pe();
