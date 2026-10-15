# Studio 排版与运行时配置

本文以 Pipeline 0.19.2、myno 0.3.1、Typeset Studio 0.2.7 为基线。工作台和执行器可以分别使用：myno 编辑正文、调样式并导出 JSON；Typeset Studio 设计封面和图片页面；Pipeline 负责读取配置、运行浏览器、生成文件和写入微信草稿。

## 选择工作台

| 场景 | 入口 | 配置来源 |
| --- | --- | --- |
| 只在浏览器调正文样式、复制到公众号 | 克隆 [myno](https://github.com/k7airos/myno)，执行 `bun install`、`bun run dev`，打开 `http://localhost:5173/src/studio/studio.html` | 内置本地默认；无接口也能工作 |
| 在 Pipeline 中调正文并保存账号样式 | 配置 myno 插件后执行 `zzp wechat-preview studio` | Pipeline 的 `/api/studio/config` |
| 设计封面、背景或多页内容图 | [Typeset Studio](https://github.com/k7airos/typeset-studio) 的独立工作台 | `TYPESET_DATA_DIR` 中的模板和素材 |

myno 的编辑器先使用本地默认初始化；Pipeline 接口成功后采用宿主账号配置。接口失败时保留编辑和导出，并提示正在使用本地模式。独立模式隐藏「保存至账号」和历史记录；配置通过导出 JSON 保存，不会自动写入浏览器外的配置文件。

## 在 Pipeline 中启用 myno

```json
{
  "plugins": {
    "markdownRenderer": {
      "module": "@akairos/myno/adapter",
      "options": {}
    }
  }
}
```

Pipeline 0.19.0 将 myno 0.3.0 作为可选依赖分发。省略可选依赖安装时，应自行提供 Pipeline 可解析的 myno 包。配置为 `null` 时使用内置 Markdown renderer 和工作台；不存在自动切换插件的逻辑。

```bash
zzp wechat-preview studio
# 不自动打开浏览器
zzp wechat-preview studio --no-open --port 18765
```

默认页面是 `http://127.0.0.1:18765/studio`。服务将插件资源挂在 `/studio-assets/`，账号配置、CSS 保存和预览记录由 Pipeline 提供。切换插件或升级资源后重启已运行的预览服务。

工作台支持字号、行距、配色、标题/引用/分割线/篇章卡片预设、自定义 CSS、Markdown 源码和可视化编辑。Callout 标题与 Emoji 写在正文中，例如 `> [!TIP] 实用技巧`；不要把不存在的表格、代码预设写入配置。

## 两种保存方式

### 保存当前账号

「保存至账号」写入本机 Pipeline 配置中的 `wx.accounts.<account>.theme`，自定义 CSS 写入该账号的 `customCss` 文件。相对路径基于配置文件目录。

```json
{
  "wx": {
    "accounts": {
      "default": {
        "customCss": "custom-css-default.css",
        "theme": {
          "editorVars": { "--brand": "#285349", "--text": "#292526" },
          "exportTheme": {
            "bodyFontSize": "16px",
            "bodyParagraphSpacing": "1.18em",
            "bodyLineHeight": "1.84",
            "primaryColor": "#285349"
          },
          "syntaxPresets": { "h2": "pillar", "divider": "short-center" },
          "structure": { "numberedHeadings": false, "headingLabel": "", "quoteLabel": "" }
        }
      }
    }
  }
}
```

这里只展示样式字段，导入时保留已有账号凭据。默认配置路径见 [README](../README.md#配置微信和外部服务)。拖动控件和复制富文本不保存配置；点击保存才会持久化。

### 导出独立 JSON

「导出配置」下载 `wechat-style.json`，包含 `schemaVersion` / `engineVersion`、`editorVars`、`exportTheme`、`syntaxPresets`、`structure` 和内嵌 `css`，不含账号凭据。页首图片可使用内嵌 Data URL。

```bash
zzp article-theme --path ./wechat-style.json
zzp wechat-export --markdown ./article.md --out ./article.html \
  --article-theme ./wechat-style.json --no-preview
zzp init --workspace ./workspace --task-kind publish --content-origin user \
  --content-form article --targets wechat --article-theme ./wechat-style.json
```

也可在账号配置中设置 `articleTheme: "styles/wechat-style.json"`。显式 `--article-theme` 路径相对当前目录；账号路径相对配置文件目录。

独立 JSON 使用自身样式，不叠加账号 `theme/customCss`；`wechat-export --custom-css` 仍可显式追加覆盖。目录模板继续沿用账号覆盖顺序。账号引用独立 JSON 后，「保存至账号」禁用，应导出调整后的 JSON 并替换来源文件。正文配置不改变 Typeset Studio 封面和固定素材。

文件、CSS、素材与语法限制见 [离线正文模板](../ARTICLE-THEMES.md)。内置 renderer 和 myno 浏览器型插件复用 Pipeline 的模板校验；其他 `render()` 插件需自行支持 `articleThemePath`。

## 同步到自托管 Worker

插件代码与运行时资产分开部署：

- npm 包/镜像提供固定版本的插件代码和浏览器资源；更换插件版本需更新安装或镜像。
- 样式 JSON、自定义 CSS、模板槽位和固定素材属于运行时资产；变更后需同步或挂载到 Worker 可读取的位置。
- `ZZHUB_PIPELINE_CONFIG` 选择本机整份配置；Worker 使用 `PIPELINE_CONFIG_FILE`。二者都不是单次文章样式选择参数。

可以通过现有运行时导出命令收集资产：

```bash
zzp typeset-assets-sync --dry-run --output ./pipeline-runtime
zzp typeset-assets-sync --output ./pipeline-runtime
# 云端账号键不同，显式映射；不会传递微信凭据
zzp typeset-assets-sync --output ./pipeline-runtime --account-map '{"default":"WORKER_ACCOUNT_KEY"}'
```

输出包含文件 SHA-256 清单、`pipeline.patch.json`、Typeset 模板/默认槽位和账号引用的 Markdown 样式。固定素材按既有 COS 流程转为 HTTPS 地址。未被账号引用的备用 JSON 不会自动收集。

Markdown 入口只接受内置 `null` 或 `{ "module": "@akairos/myno/adapter", "options": {} }`；本机插件路径不会进入部署包。模板和图片数据不包含在 myno / Typeset Studio npm 包中。

自托管部署按以下顺序接入：

1. 先安装或构建包含目标插件版本的 Worker；确认 npm 模块可解析。
2. 调用维护接口暂停新任务，等待队列为空且无运行任务，备份配置和数据。
3. 校验运行时包哈希，复制到挂载目录，仅合并插件与账号排版白名单，保留中转地址和凭据。
4. 原子替换单文件配置时，强制重建容器以重新建立绑定挂载；单纯 `restart` 不能保证读取新 inode。
5. 健康检查通过后恢复接单，提交测试文章，并从微信草稿箱回读确认。

公共部署契约见 [Cloud Worker README](../services/cloud-worker/README.md)。维护接口和业务鉴权都使用服务端令牌；不要将令牌下发给浏览器。各部署项目可自行实现上述流程，不要求取得任何私有仓库。

## 远程调样式

排版工作台的保存 API 可写宿主配置，没有业务用户鉴权。远程使用优先保持服务监听回环地址，再通过 SSH 转发：

```bash
# 远端运行
zzp wechat-preview studio --no-open --host 127.0.0.1 --port 18765
# 本机转发
ssh -L 18765:127.0.0.1:18765 your-server
```

本机打开 `http://127.0.0.1:18765/studio`。这与私有 Worker 是两个服务；Worker 不提供 Studio 页面，也不应公开到公网。实际剪贴板功能取决于浏览器权限与安全上下文。
