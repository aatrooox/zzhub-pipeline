# longform-3-4 模板规范

比例：3:4 | 尺寸：900×1200 | 用途：长文正文卡片，适合非封面页、长段落、阅读型内容

## 特点

- 复用 `poster-3-4` 的顶部 logo 和底部 watermark 结构
- 正文使用 `LXGWNeoZhiSongPlus.ttf`
- 行高更舒展，适合阅读，不追求封面式冲击力
- 支持 markdown 正文
- 支持正文中的正文插图（内容插图），文字会自动绕排
- 障碍物流排逻辑来自共享浏览器模块 `assets/browser/obstacle-flow.js`
- 分页基于真实排版高度，而不是字符数估算
- 分页测量优先直接在进程内执行 `pretext`，Chrome 只负责最终截图
- 最终截图阶段会补偿 headless Chrome 的 viewport inset，再裁回目标尺寸，避免 footer 在截图时被底部裁掉
- 当存在显式 `page_specs` 时，支持 spec-driven 分页：固定页序列、按页图文占比近似求解
- 样式层可切换主题，便于同模板服务不同账号

## 适用场景

- 用户要“文章分页图”或“阅读内页”
- 用户给的是长文，而不是一句标题
- 正文里需要插图、caption、ASCII 头像块这类正文插图
- 同一模板要服务多个账号，只换主题和图文布局风格

## 调用方式

单页长文：

```bash
bun ./scripts/render-article.ts \
  --template longform-3-4 \
  --theme linen-news \
  --title "文章标题" \
  --text "这里是一页长文正文" \
  --out tmp/longform.png
```

真实分页，多图导出：

```bash
bun ./scripts/render-article.ts \
  --template longform-3-4 \
  --theme paper-sage \
  --title "文章标题" \
  --text-file /absolute/path/to/article.md \
  --out-dir tmp/longform-pages
```

图文混排，正文插图绕排：

```bash
bun ./scripts/render-article.ts \
  --template longform-3-4 \
  --theme linen-news \
  --text-file /absolute/path/to/article.md \
  --body-image /absolute/path/to/image.jpg \
  --image-side right \
  --image-layout editorial-float \
  --image-caption "配图说明" \
  --out tmp/longform-mixed.png
```

把 ASCII 头像块作为正文插图插入正文：

```bash
bun ./scripts/render-article.ts \
  --template longform-3-4 \
  --text-file /absolute/path/to/article.md \
  --body-ascii-portrait /absolute/path/to/avatar.jpg \
  --ascii-side left \
  --ascii-layout mid-left \
  --ascii-caption "作者头像 ASCII 版" \
  --out tmp/longform-ascii.png
```

## 正文插图布局预设（`--image-layout`）

| 预设值 | 别名 | 视觉效果 | 适用场景 |
|--------|------|----------|----------|
| `auto` | `default` | 按 `--image-side` 固定边，纵向等距排列 | 1 张插图，简单明确 |
| `staggered` | `split-dual` | 奇数张靠指定边，偶数张自动翻转对侧，纵向拉开间距 | **多张插图首选**，左右交替有节奏感 |
| `editorial` | `editorial-float` | 同侧排列但每张有额外竖向错位，版式感强 | 2–3 张，杂志排版风格 |
| `corner-soft` | — | 靠近顶部角落，纵向紧凑叠放 | 插图作角落装饰，正文为主 |
| `mid-left` | — | 页面中段靠左，纵向等距 | 明确放左侧中部 |
| `mid-right` | — | 页面中段靠右，纵向等距 | 明确放右侧中部 |

默认值：未指定时为 `auto`。pipeline 模式下 orchestrator 统一默认使用 `staggered`（适合 2 张及以上）。

## 参数说明

与 `render-article.ts` 的通用参数基本一致，额外约定如下：

- `--template longform-3-4`：启用 LXGW 阅读版模板
- `--theme`：主题名，默认 `paper-sage`，支持 `paper-sage` / `linen-news`
- `--title`：当前模板不在正文区显示标题，但参数仍保留给脚本统一接口
- `--text` / `--text-file`：正文内容，支持有限的块级 markdown 子集
- `--out`：输出单张图；如果正文超长，会按指定 `--page-num` 或默认第 1 页导出
- `--out-dir`：输出多张分页图，文件名形如 `article-01.png`
- `--body-image`：可重复传入，多张正文插图路径
- `--image-side`：可重复传入，支持 `left` / `right`
- `--image-layout`：自动布局预设，默认 `auto`，支持 `auto` / `staggered` / `editorial`
  也支持更偏风格名的别名：`corner-soft` / `mid-left` / `mid-right` / `split-dual` / `editorial-float`
- `--image-x` / `--image-y` / `--image-width` / `--image-height`：可重复传入，覆盖每张图片的位置和尺寸
  默认图片尺寸为 210×210
- `--image-caption`：可重复传入，给对应图片添加 caption
- `--body-ascii-portrait`：把 ASCII 头像块作为障碍物组合进正文
- `--ascii-side` / `--ascii-layout` / `--ascii-width` / `--ascii-height` / `--ascii-caption`：控制 ASCII 障碍物的位置与尺寸
- `--ascii-bg`：ASCII 块背景色
- `--ascii-chars`：字符梯度，默认 `@#W$9876543210?!abc;:+=-,._ `
- `--ascii-columns`：ASCII 横向采样列数，默认 `34`
- `--ascii-x` / `--ascii-y`：覆盖 ASCII 障碍物位置坐标
- `--page-width` / `--page-height`：覆盖页面尺寸
- `--body-padding-x` / `--body-padding-y`：覆盖正文外边距
- `--logo-size` / `--logo-gap`：覆盖 header 几何
- `--footer-height` / `--footer-margin-top`：覆盖 footer 预留高度
- `--content-width` / `--content-height`：显式指定正文内容区
- `--content-bottom-gap`：控制内容区底部保留空间
- `#` / `##` / `>` / `-`：会解析成小标题、引用、列表项，并进入同一套正文插图流排系统；当前不是完整 markdown 渲染器

## 内容区几何

`longform-3-4` 现在把内容区当成“可推导区域”而不是固定常量：

- 默认内容宽度：`pageWidth - bodyPaddingX * 2`
- 默认内容高度：`pageHeight - bodyPaddingY * 2 - (logoSize + logoGap) - (footerHeight + footerMarginTop)`
- 如果调用方显式传了 `--content-width` / `--content-height`，会在可用范围内裁到该值

这意味着同一个模板里，只要 header/footer/padding/page size 改了，分页算法也会跟着重算，不需要再去源码里找写死的内容区尺寸。

## 分页图片消费逻辑

## Spec 驱动分页

当调用方传入 `--page-image-spec-file` 时，`longform-3-4` 不再只按“当前页塞满才翻页”处理，而是进入另一条版式路径：

- 有正文页标记时：
  `【第一页】` / `【第二页】` / `【Page 1】` / `【Page 2】` 会成为硬分页锚点
- 没有正文页标记时：
  会按段落 block 顺序，把正文自动分配到显式页序列里
- 每页图片会做一轮页内缩放搜索，尽量让“文字 + 图片”占到内容区约 `target_fill_ratio`
- 顶层 `target_fill_ratio` 默认 `0.8`
- `page_specs[].target_fill_ratio` 可以覆盖单页目标

这条路径适合：

- 已经知道要分几页
- 每页已经知道有哪些插图
- 希望某些文字固定在指定页里，即使该页文字不算很多

**分页图片消费逻辑（`--body-image` 在多页中的分配）：**

当正文超过一页时，`render-article.ts` 通过 `obstacle-flow.js` 的 `paginateBlocks()` 将正文和图片分配到各页：

- **消费方式**: 顺序切片（sequential slice），不是全局障碍物
- **每页上限**: `pageImageLimit = 2`（当前硬编码）
- **分配规则**: `bodyImages.slice(imageIndex, imageIndex + pageImageLimit)` — 第 1 页取前 2 张，第 2 页取接下来 2 张，依此类推
- **图片顺序**: 与 `--body-image` 参数的传入顺序一致
- **超出页数**: 若图片数 > 页数 × 2，多余图片不渲染（不报错）
- **不足**: 若某页分配不到图片，该页无插图，只渲染文字

> 这意味着传入 4 张 `--body-image`，前 2 张出现在第 1 页，后 2 张出现在第 2 页。
> 若只有 1 页但传了 3 张图，只有前 2 张会渲染。

## 注意事项

- 正文中若含 `插图N` / `配图N` 占位标记，调用本脚本前必须先由 orchestrator 剔除，否则标记文字会直接渲染进卡片
- 适合正文、随笔、文章分页内页、说明卡
- 不适合大标题封面
- 若是封面或强视觉标题，优先使用 `poster-3-4`
- 需要图文混排时，优先使用 `--body-image` 配合 `--image-side left/right`
- 多账号复用时，优先固定 `--theme` + `--image-layout` 的组合，而不是每次手调坐标
- 真正的长文发布优先使用 `--out-dir`，让模板自动产出多张连续图片
