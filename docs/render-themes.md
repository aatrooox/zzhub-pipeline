# 封面主题与图片排版

主题保存在 Pipeline 的 `render.cover` 配置中。Nezus 等 App 可以通过 CLI 读写 JSON，不需要维护另一份主题默认值。正文图片使用独立的阅读主题；封面主题不改变公众号正文 HTML。

## 配置与预览

```bash
bun run src/cli.ts config --key render.cover --json
bun run src/cli.ts config --schema --key render.cover
bun run src/cli.ts config --import examples/cover-themes.json
bun run src/cli.ts config --key render.cover.themes.business.colors.accent --value '#2457A7'
bun run src/cli.ts imgx render-card --template poster-3-4 --cover-theme business --text '把复杂留给工具：让写作回到内容本身' --out /tmp/cover.png --json
```

全局安装后可将 `bun run src/cli.ts` 替换为 `zzp`。预览无需创建任务，不调用发布接口。`--json` 的 stdout 为 JSON，进度写入 stderr：

```json
{ "path": "/tmp/cover.png", "width": 900, "height": 1200, "themeId": "business" }
```

主题结构版本为 `1`。`defaultTheme` 是全局默认，`accountThemes` 保存账号默认，`themes` 是以稳定 ID 为键的主题集合。ID 使用小写字母、数字、下划线或连字符。内置 ID：`business`、`technology`、`minimal`、`solid`、`cute`、`serious`、`abstract`、`entertainment`、`fresh-sage`、`soft-rose`。

旧配置缺少 `render.cover` 时自动获得十套默认主题。读取不写文件；保存时写入有效配置，后续升级不替换已经保存的主题。`--import` 对主题逐字段合并，数组整体替换、`null` 清除图片；`--key ... --value` 可以替换完整主题或集合。删除主题前应先修改引用它的默认选项。

## 字段约定

| 字段 | 说明 |
|---|---|
| `typography.title/subtitle/footer` | `fontFamily`、`fontSize`、`minFontSize`、`fontWeight`、`lineHeight`、`letterSpacing` |
| `colors` | `text` 正文颜色、`accent` 强调色、`muted` 署名颜色 |
| `background.fill` | `type: solid` + `color`；`type: linear` + `angle/stops`；`type: radial` + `position/stops` |
| `background.image` | 可选背景图片 |
| `background.overlay` | 可选 `{ color, opacity }` 遮罩 |
| `decoration` | `pattern`、`color`、`opacity`、`size` 和独立的 `image` |
| `layout` | `textAlign: left/center/right`、`verticalAlign: top/center/bottom`、`safeArea` |
| `formats` | 按模板覆盖上述字段，未填写的字段继承主题 |

字号、字距和安全区单位为画布像素；行高为字号倍数，透明度为 `0–1`。字体使用已附带的 `AlimamaShuHeiTi`、`LXGWNeoZhiSongPlus`、`LXGWWenKai`。颜色使用十六进制或 `transparent`；渐变节点为 `{color, offset}`，offset 为 `0–100`。

这三个字体文件位于 `src/imgx/assets/fonts/`；编译分发时位于 `assets/imgx/assets/fonts/`。封面只加载当前主题实际使用的字体，正文只注册两种正文字体。`fontFamily` 也可填写 `system-ui`、`PingFang SC`、`Microsoft YaHei` 等本机字体名称；本机字体由浏览器选择，未安装时按系统回退字体绘制。生成图片时不下载字体，缺少需要的内置字体时明确报错。

封面和正文通过资源就绪事件截图：等待 `document.fonts.ready`、图片解码及排版 Promise，完成后立即截图。没有固定 sleep 或 Chrome 虚拟时间预算；30 秒仅为异常卡死保护，不是正常等待时长。封面在同一浏览器页面完成测量和截图。

`fontSize` 是期望字号，封面会在 `minFontSize` 与它之间适配；署名字号保持配置值。完整标题在下限仍放不下时命令报错，不生成截字的成功结果。主副标题按原换行或冒号划分，保留文字；URL 和时间中的冒号不用于分组。

装饰模式支持 `none/lines/grid/dots/rings/burst`；`size` 控制网格、圆点和圆环间距。所有预设都由参数组合，不按主题 ID 分支。

`poster-3-4` 为 900×1200。`wechat-cover-split` 为 1340×400，左侧 940×400 放文字，右侧 400×400 放 Logo。`safeArea: {top,right,bottom,left}` 相对模板文字区域，署名和间距也参与可用高度计算。横幅有自己的默认字号、安全区；修改通用参数不会覆盖显式的尺寸参数。

## 背景图与透明边框

两层图片都使用以下结构；边框默认 `contain`，背景默认 `cover`：

```json
{
  "src": "cover-assets/frame.svg",
  "fit": "contain",
  "position": { "x": 50, "y": 50 },
  "opacity": 1
}
```

`src` 支持绝对路径、相对路径或 HTTP(S) URL。相对路径基于实际配置文件目录，不是当前目录或导入文件目录；可用 `ZZHUB_PIPELINE_CONFIG` 指定配置文件。支持 PNG、JPEG、WebP、SVG，单张不超过 20 MiB / 8000 万像素。远程请求超时为 15 秒，下载到本次临时目录后再渲染，结束后清理；不依赖浏览器访问远程素材。

背景图片填入 `background.image`，透明边框填入 `decoration.image`。图层从下到上为底色、背景、遮罩、装饰、文字与署名。花边不会自动识别避让范围，应通过对应尺寸的安全区预留空间。

## Logo 与署名

`render.branding` 统一控制封面与正文图片的 Logo 和公众号文案。支持全局设置及账号覆盖；Logo 支持本机绝对路径、相对配置文件目录的路径和 HTTP(S) URL，复用背景素材的下载校验。`null` 沿用默认，空字符串隐藏对应项。

```json
{
  "render": {
    "branding": {
      "logo": "brand/logo.png",
      "footerText": "公众号：我的公众号",
      "accounts": {
        "ancientone": { "logo": "https://example.com/logo.png", "footerText": "公众号：另一个账号" }
      }
    },
    "cover": { "defaultTheme": "business", "accountThemes": { "ancientone": "soft-rose" } }
  }
}
```

优先级为：本次 `--icon/--footer` → `render.branding.accounts.<账号>` → `render.branding` → 旧 `imgx.icon` 与账号默认值。修改配置后下一次渲染直接读取最新值，不必重新准备文章。

```bash
zzp config --key render.branding.logo --value '/path/to/logo.png'
zzp config --key render.branding.footerText --value '公众号：我的公众号'
zzp config --key render.cover.defaultTheme --value business
zzp config --schema --key render.branding
zzp config --schema --key render
```

Nezus 等 App 可以读取 `render` 的完整 JSON Schema，同时编辑主题、默认主题、Logo 和文案。

## 任务与插件契约

```bash
bun run src/cli.ts init --workspace /path/to/workspace --task-kind publish --content-form article --targets wechat --content-origin user --cover-theme technology
bun run src/cli.ts render --state /path/to/workflow-state.json --cover-theme minimal
```

优先级为：本次 `--cover-theme` → `intent.cover_theme` → 账号默认 → 全局默认。每次渲染使用当前配置参数；账号的名称和 Logo 独立于视觉主题。`imgx.icon` 继续作为全局 Logo 配置，旧 `--bg/--highlight/--footer/--icon` 显式参数仍可覆盖对应值。

两种 handoff 格式均支持 `cover_theme`。恢复任务时只改主题会重新进入 render，保留已审核正文；`cover_theme: null` 清除任务选择，恢复账号／全局默认。

```json
{
  "workflow_handoff": {
    "mode": "resume",
    "state_path": "/path/to/workflow-state.json",
    "cover_theme": "technology"
  }
}
```

`ImageRenderInput.coverTheme` 是可选的解析结果，包含 `id`、`format` 及合并尺寸覆盖后的参数。内置插件支持全部主题能力；旧插件可以忽略该字段。`ImageRenderOutput` 保持不变。任务的 `images.plan.cover_theme` 记录本次实际使用的主题 ID。

解析后的 Logo 和署名继续通过 `ImageRenderInput.accountVisualParams.fallbackIcon/footer` 传给插件，字段名不变。直接调用 `runRenderArticleCli()` 的代码需要 `await`；CLI 命令和插件异步接口不变。

`config --schema --key render.cover` 即使配置文件损坏也可读取。JSON Schema 描述字段与默认值，主题引用、字号上下限和安全区之间的关联由 CLI 校验，错误包含字段路径。

## 正文分页

正文、列表和引用默认 40px / 64px，三级标题依次为 56/72、50/66、44/60px。强调在分页前解析，使用 pretext 0.0.8 的 rich-inline 测量，最终按相同字体、行高和片段绘制。每页左下显示一次账号署名，右下显示正文页码。

`pagination_mode: multi` 不依赖逐页规则是否存在。自动分页保留段落与标题关联；填充率为软目标，最大页数不足时会尝试使用完整可用高度，仍不够则报告所需页数。最少页数无法满足时也会终止并说明原因，不缩小正文字号或扩展画布。正文页数不包含单独的封面，单图模式仍返回一张封面。
