---
name: zzhub-wechat-html-style
description: >
  修改 zzhub-pipeline 的 Markdown→微信 HTML 排版样式。当用户要改公众号文章
  导出外观、标题/段落/引用/代码样式、品牌色、页脚、custom CSS、wechat-export
  主题，或问 milkdown-article-style / Juice 内联 / 样式不生效时使用。
  触发：微信文章样式、md 转 html 样式、article.css、export 主题、wechat-export 样式。
---

# zzhub-wechat-html-style — Markdown → 微信 HTML 样式修改

本 skill 只覆盖 **文章 HTML 导出**（`wechat-export` / 微信草稿正文），不覆盖
imgx 封面/长图（那是另一套模板与主题）。

修改前先读懂渲染链路。错改位置是「样式改了不生效」的最常见原因。

---

## 0. 渲染链路（必读）

固定管线，**不是**「浏览器里挂个 stylesheet 看 Markdown」：

```
.md
  → Node: 去 frontmatter / 去掉文首 H1 / 相对图片路径绝对化
  → Chrome 加载 export-shell.html + 浏览器 bundle (editor-export.js)
  → Milkdown (commonmark + gfm) 解析为语义 HTML
  → prepare：打 data-wechat-node、包代码块、图片 figure、外链脚注、页脚
  → 拼接 CSS 并 Juice 内联（resolveCSSVariables）
  → finalize：部分标签改名（见下）
  → sanitize：白名单标签/属性/CSS，去掉 data-*（含 data-wechat-node）
  → 写出仅含 inline style 的 HTML（无外链 CSS）
```

关键实现文件：

| 环节 | 文件 |
| --- | --- |
| CLI | `src/commands/wechat-export.ts` |
| 导出编排（Chrome / bundle / payload） | `src/wechat-preview/index.ts` |
| 浏览器入口（Milkdown + 调 renderer） | `src/wechat-preview/browser/editor-export.ts` |
| 语义节点 + Juice + 清理 | `src/wechat-preview/wechat-renderer.ts` |
| 账号主题令牌 | `src/wechat-preview/themes.ts` |
| 共享排版 CSS（npm 包，**不在本仓库**） | `@zzclub/milkdown-article-style` |
| Vite 打包 | `vite.wechat-preview.config.ts` → `src/wechat-preview/assets/browser-dist/editor-export.js` |
| 发布路径 | `src/providers/index.ts`（与 `wechat-export` 同一 renderer） |

CSS 三层拼接顺序（后写覆盖前写，Juice 时生效）：

1. **baseCss** = 包内 `article.css`（构建时 `?raw` 打进 bundle）
2. **themeCss** = `buildWechatThemeCss(editorVars, exportTheme)`（运行时由 Node 注入 payload）
3. **customCss** = 账号配置或 `--custom-css` 文件内容（运行时注入）

Juice 选项（`wechat-renderer.ts`）会 **丢弃** 这些能力：

- `::before` / `::after` / 伪类样式（`preservePseudos: false`）
- `@media` / `@keyframes` / `@font-face`
- 未解析的 `var()`（sanitize 会删带 `var(` 的属性）
- `url(...)` 背景图等

finalize 之后 sanitize 会 **删除** `data-wechat-node`。选择器在 Juice 阶段有效，最终 HTML 只剩 inline style。

finalize 标签改写（样式已先内联，再改名）：

| prepare 时 | finalize 后 |
| --- | --- |
| `h1`–`h6` | `section` |
| 行内 `code` | `span` |
| `figure` / `figcaption` | `section` / `p` |
| 外链 `a` | `span`（脚注标记保留） |

因此：**写规则时用语义标签 / `data-wechat-node`，不要指望最终 HTML 里还有 `h2` 选择器可再匹配。**

---

## 1. 在哪里修改

按目标选 **唯一** 正确位置，禁止在错误层「补丁式」复制 CSS。

### 1.1 共享排版（段落、标题层级、列表、代码、表格、引用结构）

**位置**：独立包 `@zzclub/milkdown-article-style`  
本地 sibling 仓库（若存在）：`../milkdown-article-style/`（与 pipeline 同级 `core/` 下）

| 文件 | 职责 |
| --- | --- |
| `article.css` | 正文排版规则；选择器挂在 `.milkdown .editor …` |
| `tokens-default.css` | 默认 `--wx-*`（给 Nezus 实时预览用） |

**硬性规则**：

- 设计源在 **该包**；pipeline 与 Nezus 共用，勿在本仓库 fork 一份 `article.css`。
- **不要**往 `src/wechat-preview/browser/editor-export.css` 写规则——它只是 re-export 桩，且 Vite 入口用 `article.css?raw`（`?raw` **不会**展开 `@import`），真正打进 bundle 的是包文件。
- 选择器保持 `.milkdown .editor …`，否则导出 DOM（`.milkdown` > `.editor.zzhub-wechat-article`）匹配不到。

当前 pipeline 依赖版本见根目录 `package.json` 的 `@zzclub/milkdown-article-style`。

### 1.2 账号主题色 / 页脚文案 / 行高字距（令牌，非结构）

**位置**：`src/wechat-preview/themes.ts`

内置账号：

- `default` → 样式名 `sage-journal`（早早集市）
- `ancientone` → 样式名 `rose-ledger`（古一软件）

改这里的 `exportTheme` / `editorVars` 会映射为 `--wx-*`（见 `buildWechatThemeCss`）：

| exportTheme / editorVars | CSS 变量 |
| --- | --- |
| `fontFamily` | `--wx-font-family` |
| `bodyColor` | `--wx-body-color` |
| `mutedColor` | `--wx-muted-color` |
| `h2Color` / `h3Color` | `--wx-h2-color` / `--wx-h3-color` |
| `primaryColor` | `--wx-brand-ink` |
| `editorVars["--brand"]` | `--wx-brand-accent` |
| `dividerColor` | `--wx-divider-color` |
| `blockquoteBorderColor` | `--wx-blockquote-border` |
| `bodyLineHeight` / `bodyLetterSpacing` | `--wx-body-line-height` / `--wx-body-letter-spacing` |
| `editorVars["--bg-warm"]` | `--wx-soft-surface` |
| `footerText` / `footerStyle` | 页脚文案与页脚 section 样式 |

`tokens-default.css` 与 default 账号令牌应对齐；改 default 时两边一起考虑，避免 Nezus 预览与导出漂移。

### 1.3 单账号配置覆盖（不改代码）

配置文件（macOS 默认）：`~/Library/Application Support/zzhub-pipeline/config.json`

```json
{
  "wx": {
    "accounts": {
      "default": {
        "customCss": "/abs/or/config-relative/path/custom.css",
        "theme": {
          "editorVars": { "--brand": "#ca6093" },
          "exportTheme": {
            "footerText": "公众号 · 早早集市",
            "bodyColor": "#292526",
            "primaryColor": "#a94473"
          }
        }
      }
    }
  }
}
```

- `customCss`：整文件 CSS，叠在 base+theme 之后。
- `theme`：浅合并进 `getWechatPreviewTheme`。
- 也可用 CLI：`wechat-export --custom-css ./my.css`（**覆盖**账号 `customCss`，不是追加）。

### 1.4 DOM 结构 / 节点行为（非纯样式）

**位置**：`src/wechat-preview/wechat-renderer.ts`

例如：脚注文案、代码块外壳、外链是否变脚注、页脚是否生成。  
这是导出行为变更，不是调色；改完必须重建浏览器 bundle（见 §3）。

### 1.5 不要改这些当「文章样式」

| 路径 | 原因 |
| --- | --- |
| `browser/editor-export.css` | 桩文件，不是打包源 |
| 本仓库内新建一份 article 排版 CSS | 与 Nezus 双份分叉 |
| imgx 主题 / `longform-3-4` | 封面与图文页，不是正文 HTML |
| 最终导出 HTML 里手改 style | 下次 export/publish 会覆盖 |
| 直接改 `assets/browser-dist/editor-export.js` | 下次 `build:wechat-preview` 会清空重写 |

### 决策速查

| 你想改… | 去哪 |
| --- | --- |
| 全局标题间距、正文字号、代码块结构 | `milkdown-article-style/article.css` |
| 某账号品牌色、页脚字 | `themes.ts` 或 config `theme` |
| 临时/单次导出试验 | `--custom-css` |
| 长期某账号小补丁 | config `customCss` |
| 链接脚注、节点包装逻辑 | `wechat-renderer.ts` |

---

## 2. 如何修改

### 2.1 改共享 `article.css`

1. 在 `milkdown-article-style` 仓库编辑 `article.css`（或临时改 `node_modules/@zzclub/milkdown-article-style/article.css` 做验证——**不能**当最终交付）。
2. 选择器一律：`.milkdown .editor h2`、`.milkdown .editor [data-wechat-node="code-block"]` 等。
3. 可用 token：`--wx-body-color`、`--wx-h2-color`、`--wx-brand-ink` 等（导出时 Juice 会 resolve）。
4. 微信/CJK 注意：
   - `font-weight: 600` 在多数安卓微信上会变成 700；标题权重优先用 **700**，层级用 **颜色 + 间距** 区分。
   - 相邻选择器（如 `h2 + p`）会在导出时被 Juice 烘焙进 inline style，微信运行时 **不会** 再跑选择器——这是预期行为。
5. 包版本 bump 后：pipeline 升依赖 → 再走 §3 生效步骤。本地联调可用：

```json
"@zzclub/milkdown-article-style": "file:../milkdown-article-style"
```

### 2.2 改 `themes.ts`

只改令牌与 `containerStyle` / `footerText`，不要把整站排版 thrash 进这里。  
未知 `account` 回落到 `THEMES.default`。

### 2.3 写 custom CSS

示例（选择器在 **prepare DOM** 上匹配）：

```css
/* 语义标签：Juice 前仍是 h2/p/blockquote */
.milkdown .editor h2 {
  color: #1a1a2e;
  font-size: 20px;
}

.milkdown .editor p {
  margin: 0 0 1.2em;
  line-height: 1.9;
}

.milkdown .editor blockquote {
  border-left: 3px solid #b35d85;
  background: #fdf6f9;
  padding: 8px 14px;
}

/* 导出专用节点（Juice 时存在） */
.milkdown .editor [data-wechat-node="footer-text"] {
  letter-spacing: 0.12em;
}
```

**允许进入最终 HTML 的 CSS 属性**以 `wechat-renderer.ts` 的 `ALLOWED_STYLE_PROPERTIES` 为准（font/color/margin/padding/border/background-color/line-height 等）。  
不要依赖：`position`、`flex`、`grid`、`transform`、`box-shadow`、`filter`、伪元素、媒体查询——会被丢掉或根本不 inline。

### 2.4 验证改动（必须）

```bash
# 优先用源码 CLI，避免全局二进制缓存误解
bun run src/cli.ts wechat-export \
  --markdown /path/to/sample.md \
  --out /tmp/wx-export.html \
  --account default \
  --open

# 可选：看中间产物
bun run src/cli.ts wechat-export \
  --markdown /path/to/sample.md \
  --out /tmp/wx-export.html \
  --debug-dir /tmp/wx-export-debug
```

检查：

- 输出里 `bundleRebuilt` / `bundleStale`：改了 baseCss 后应重建成功；`bundle_stale: true` 表示仍在用旧 bundle。
- `/tmp/wx-export.html` 中样式是否为 **inline** 且颜色/间距符合预期。
- 预览服务：`wechat-preview serve`（export 默认会登记条目）。

相关测试：

```bash
bun test src/wechat-preview/
bun test src/wechat-preview.test.ts
```

---

## 3. 修改后如何生效

| 改动类型 | 是否要 `build:wechat-preview` | 是否要 `bun install --global .` | 说明 |
| --- | --- | --- | --- |
| `milkdown-article-style` 的 `article.css` | **是** | **是**（若用全局 `zzp`） | CSS 以 `?raw` 打进 `editor-export.js` |
| `wechat-renderer.ts` / `browser/editor-export.ts` | **是** | **是** | 同在浏览器 bundle 内 |
| `themes.ts` / `commands/wechat-export.ts` / Node 侧 | **否** | **是** | 主题经 payload 注入，不进 Vite 产物 |
| config `theme` / `customCss` | **否** | **否** | 下次 export/publish 即读配置 |
| `--custom-css` | **否** | **否** | 单次命令 |

### 标准生效流程（改了包 CSS 或 renderer）

在 **pipeline 仓库根目录**：

```bash
# 1) 依赖已指向新样式包（file: 或已 publish 的版本）
bun install

# 2) 重建浏览器 bundle（写入 src/wechat-preview/assets/browser-dist/）
bun run build:wechat-preview

# 3) 更新全局命令（见 §4）
bun install --global .

# 4) 用源码再验一次
bun run src/cli.ts wechat-export --markdown … --out … --open
```

### 自动脏检测

`ensureBundle()`（`index.ts`）会比较以下源的 mtime 与 `browser-dist/.vite/manifest.json`：

- `browser/editor-export.ts`
- `@zzclub/milkdown-article-style/article.css`
- `wechat-renderer.ts`

源更新且能跑 Vite 时，export 会自动 rebuild。若 Vite/devDependency 不可用，会 **回退旧 dist** 并标 `bundle_stale`——**不能**当成功。  
`themes.ts` **不在** 脏检测列表中（正确：主题不进 bundle）。

**不要**只改 `node_modules` 里的 CSS 却不 rebuild：全局安装与已提交的 `browser-dist` 仍是旧内联结果。

### 发布链路

`publish`（微信文章）与 `wechat-export` 走同一 markdown renderer。  
改样式后无需改 publish 命令；需保证全局/当前进程用的是新 bundle + 新主题代码。

---

## 4. 更新全局命令

本仓库约定：

- 开发调试：`bun run src/cli.ts <cmd>` → **始终**当前工作区源码 + 当前 `browser-dist`。
- 全局：`zzp` / `zzhub-pipeline` → `bun install --global .` 安装到的包副本（bin 指向该副本内的 `src/cli.ts` 及其中的 `assets/browser-dist`）。

**任何**影响运行时的代码或已构建 bundle 变更后，在 pipeline 根目录执行：

```bash
bun install --global .
```

硬性要求（与 AGENTS.md 一致）：

- 改一行 TS、升一个样式包版本、重建一次 `browser-dist`，只要希望 `zzp`/`zzhub-pipeline` 立刻用上，就必须执行。
- 仅改 skill / `.md` 文档可跳过。
- 只跑 `bun run build:wechat-preview` **而不** `bun install --global .`：本地 `bun run src/cli.ts` 已是新样式，但全局 `zzp wechat-export` / 发布任务仍可能用旧 bundle。

推荐顺序：

```bash
bun run build:wechat-preview   # 若触及 article.css 或 browser bundle 源
bun install --global .
zzp doctor                     # 可选：检查路径与依赖
```

确认全局已更新：对同一 markdown 分别跑 `bun run src/cli.ts wechat-export …` 与 `zzp wechat-export …`，对比输出 HTML 或 `bundleRebuilt`/`preview_style`。

---

## 5. 常见失败模式

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 改了 CSS 导出不变 | 只改了包文件没 rebuild；或只改了 `editor-export.css` 桩 | `bun run build:wechat-preview` + 全局安装 |
| `zzp` 与 `bun run src/cli.ts` 结果不同 | 全局包未更新 | `bun install --global .` |
| `bundle_stale: true` | 自动 rebuild 失败，回退旧 dist | 看 Vite 报错；装齐 devDependencies 后手动 build |
| custom CSS 完全没了 | 用了 flex/伪元素/未 resolve 的 var/不在白名单的属性 | 改用 Juice+sanitize 友好属性 |
| 标题选择器无效 | 对着 **导出后** HTML 写 `h2` 二次处理 | 规则必须在 export 前 CSS 层生效 |
| Nezus 预览与导出不一致 | 只改了 pipeline `themes.ts` 或只改了包一半 | 包 `article.css` + `tokens-default.css` + 对应账号主题一起对齐 |
| Chrome 相关失败 | 导出依赖本机 Chrome/Chromium | `doctor`；装 Chrome 或设 `CHROME_PATH` |

---

## 6. Agent 执行清单

接到「改微信文章 HTML 样式」时：

1. 用 §1 决策表锁定 **一层** 修改面，不跨层复制。
2. 实施修改；共享排版只动 `milkdown-article-style`。
3. 需要时：`bun run build:wechat-preview`。
4. **`bun install --global .`**（文档除外）。
5. `wechat-export` 实机验证（`--open` 或读输出 HTML），确认非 `bundle_stale`。
6. 向用户说明：改了哪一层、为何、如何验证。
