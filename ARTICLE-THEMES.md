# 离线正文模板

> 本文描述当前源码的 `article-theme` 与 `--article-theme` 能力，npm `0.14.0` 尚不包含。请使用包含该实现的源码 revision 或后续发布版本；以 `zzp --help` 和 `zzp wechat-export --help` 核对已安装命令。

Pipeline 保持 MIT 开源。正文排版、本地模板包、customCss 和渲染插件不要求登录或会员。付费模板由各作者单独交付、单独授权，不包含在此仓库或 npm 包中。

## 使用

```sh
# 校验，或复制到内容寻址的本地模板库
zzp article-theme --path ./my-template
zzp article-theme --path ./my-template --install ./article-themes

# 仅排版预览，不访问公众号服务器
zzp wechat-export --markdown ./article.md --out ./article.html \
  --article-theme ./my-template --preview-shell-out ./preview.html --no-preview

# 本次文章，独立于 --cover-theme
zzp init --workspace ./workspace --task-kind publish --content-origin user \
  --content-form article --targets wechat --article-theme ./my-template
# 或在已有任务发布时指定
zzp publish --state ./workflow-state.json --article-theme ./my-template
```

账号默认使用 `wx.accounts.<account>.articleTheme`，相对路径以配置文件所在目录为基准。显式 `--article-theme` 优先，路径相对当前目录；handoff 支持同义的可选 `article_theme` 字段。没有选择正文模板时保持既有配置。封面仍使用 `--cover-theme`。

模板样式叠加在现有基础样式上，既有账号 `theme` 覆盖和 `customCss` 最后生效。新版正文模板默认不附带内置账号署名，用户自己配置的 footerText 仍保留。旧 Markdown 插件接收可选 `articleThemePath`，可以继续忽略该字段；要支持付费模板预览，应使用内置渲染器或实现该可选参数。桌面端预览同样调用当前已配置的渲染插件。

发布前冻结模板版本、CSS 和资源到工作区 `.zzhub-media/article-themes`；渲染结果记录 `article_theme_hash`。同一篇文章更改模板、版本或声明素材后会重新导出。旧状态不含该字段时仍可使用。

## 包格式

`manifest.json`（schemaVersion=1、engineVersion=1）：

```json
{
  "schemaVersion": 1,
  "engineVersion": 1,
  "id": "my-template",
  "name": "我的正文模板",
  "version": "1.0.0",
  "description": "正文排版",
  "stylesheet": "article.css",
  "sample": "example.md",
  "preview": "preview.html",
  "license": "LICENSE.txt",
  "assets": ["assets/divider.png", "README.md"],
  "editorVars": { "--brand": "#285349" },
  "exportTheme": { "footerText": "" },
  "structure": {
    "numberedHeadings": true,
    "headingLabel": "CHAPTER",
    "quoteLabel": "摘录",
    "headerImage": null
  }
}
```

所列文件必须实际存在。导入拒绝脚本入口、符号链接、目录越界、不兼容版本；每文件最多 5 MiB，总资源最多 20 MiB，CSS 最多 256k 字符。CSS/变量不支持 `url()`、`@import`、CSS 转义或表达式。需要页首素材时使用 `structure.headerImage` 指定包内 PNG/JPEG/GIF/WebP，并在发布时正常上传到用户公众号。

样式继续使用 `.milkdown .editor` 和已有元素节点。可选结构插入真实文本节点，微信公众号不需要 CSS 伪元素或计数器：

- `heading-label`、`heading-number`、`heading-text`：二级标题结构。
- `quote-label`：引用标签。
- `image-block`、`image-caption`：图片与图注。
- `code-block`、`code-language`、`inline-code`：代码。

对应选择器如 `.milkdown .editor [data-wechat-node="heading-number"]`。最终导出将样式内联，清除临时属性和不支持的布局，正文仍可选择复制。模板应使用微信支持的 block/inline/table 布局，不依赖 flex/grid、脚本、伪元素或联网字体。

## 语法验收

共享验收稿：[all-nodes.md](./src/wechat-preview/fixtures/all-nodes.md)。覆盖 CommonMark、GFM、`==高亮==`、转义、代码里的 `==`、嵌套列表、表格、任务和引用式图片。保留 Crepe 图片比例 `![0.50](image.png "图注")`。原生 HTML 安全转义；不承诺数学公式、Mermaid、脚注、Obsidian 提示块。

导出以浏览器实际解析的图片节点解析相对路径，代码中的 `![示例](path)` 不被改写。Nezus 本地资料库负责已有 Obsidian 图片嵌入转换；纯 CLI 使用标准 Markdown 图片。

`--summary-only` 可省略 stdout 中的 HTML，文件仍写入完整结果，适合桌面桥接处理大图片文章。

## 发布与错误恢复

所有原 CLI 命令、baseUrl、账号 PAT 及 `/api/v1/wx/*` 契约保留。当前实现向草稿写接口提供 `Idempotency-Key`；中转服务需实现该 Header 的去重语义，忽略它的旧服务不具备服务端幂等保证。会员、配额和 PAT 权限由所使用的中转服务管理，Pipeline 不实现这些托管服务策略。

Cloud Worker 当前没有单次任务 `articleTheme` 字段。使用云端默认正文模板时，通过挂载配置中的 `wx.accounts.<account>.articleTheme` 指定，模板路径与资源必须在 Worker 容器内可读取；客户端本地安装模板不会自动同步到服务器。

`WX_RESULT_UNKNOWN` 表示服务可能已经创建草稿。先核对草稿箱；确认需要重试时，执行 `zzp reset --state <路径> --mode publish`，再发布。明确重置会增加尝试编号，生成新幂等身份；普通重复发布仍复用同一身份。存在草稿时优先关联旧 ID 更新，避免新建重复文章。

测试：`bun test src/article-theme.test.ts src/wechat-preview/wechat-export.integration.test.ts src/providers/wechat.test.ts`。导出测试需要本机 Chrome。
