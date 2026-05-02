# x-like-posts 模板规范

比例：自适应长图 | 宽度：900px | 用途：将多条帖子整理成一张 X / Twitter 风格分享长图

## 适用场景

- 用户要“X 风格分享图”
- 用户给的是帖子类型数据，不一定来自 Twitter
- 用户希望保留 X 的阅读感，但以通用帖子分享图方式导出

## 渲染命令

```bash
bun ./scripts/render-x-like-posts.ts \
  --author "OpenAI" \
  --handle "@OpenAI" \
  --post "第一条帖子内容" \
  --post "第二条帖子内容" \
  --out tmp/x-like-posts.png
```

如帖子较多，优先写入 JSON 文件后传入：

```bash
bun ./scripts/render-x-like-posts.ts \
  --author "OpenAI" \
  --handle "@OpenAI" \
  --posts-file tmp/posts.json \
  --out /absolute/path/to/output/x-like-posts.png
```

## JSON 输入格式

`--posts-file` 读取一个 JSON 数组，支持两种结构。

### 1. 字符串数组

最简格式，每个元素只提供正文：

```json
[
  "post 1",
  "post 2"
]
```

此格式下模板只显示：

- 正文
- 外层参数提供的作者名 / handle / avatar

### 2. 对象数组

推荐格式，每条帖子可带时间和互动信息：

```json
[
  {
    "text": "post 1",
    "created_at": "2026-03-11T04:39:46.000Z",
    "url": "https://x.com/foo/status/1",
    "favorite_count": 31,
    "retweet_count": 4
  },
  {
    "text": "post 2"
  }
]
```

字段规则：

| 字段 | 必填 | 说明 | 当前是否显示 |
|------|------|------|--------------|
| `text` | 是 | 帖子正文 | 是 |
| `created_at` | 否 | 帖子发布时间，建议 ISO 8601 | 是 |
| `url` | 否 | 原帖链接 | 是（显示为 `x.com` 标记） |
| `favorite_count` | 否 | 点赞数 | 是 |
| `retweet_count` | 否 | 转发 / repost 数 | 是 |

### 当前模板显示逻辑

- `text`：显示为正文
- `created_at`：显示在每条帖子底部，并用于顶部日期标签
- `favorite_count`：大于 0 时显示
- `retweet_count`：大于 0 时显示
- `url`：存在时显示 `x.com` 来源标记
- 作者名、handle、avatar：不从 JSON 内层读取，而是由外层参数 `--author`、`--handle`、`--avatar` 控制

### 输入兼容说明

- 旧参数 `--tweet` / `--tweets-file` 仍可用
- 如果输入来自 `ingest-service`，优先使用它的 `created_at` 作为发布时间

## 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--author` | `Unknown Author` | 作者名 |
| `--handle` | `@twitter` | 作者 handle |
| `--post` | 空 | 单条帖子内容，可重复传多次 |
| `--posts-file` | 空 | 帖子 JSON 文件 |
| `--out` | 必填 | 输出 PNG 路径，支持相对路径或绝对路径 |
| `--header-label` | `X-like 帖子分享图` | 顶部说明文案 |
| `--footer` | `整理转发 · via zzhub-media-imgx` | 底部来源文案 |
| `--bg` | `#f5f8fa` | 页面背景 |
| `--card-bg` | `#ffffff` | 卡片背景 |
| `--text` | `#0f1419` | 正文颜色 |
| `--muted` | `#536471` | 次级文字颜色 |
| `--border` | `#e6ecf0` | 分隔线颜色 |
| `--accent` | `#1d9bf0` | 强调色 |
| `--avatar` | 默认头像 | 作者头像 |

## 内容处理规则

1. 一条帖子对应一个卡片区块，按输入顺序排列
2. 保留段落换行；空行只用于分段，不额外显示
3. 多条帖子合成一张长图，画布高度按内容长度自动估算
4. 若帖子过多导致总高度接近上限，优先按语义拆成多张图，不要强行塞满一张
5. 时间信息默认取帖子 `created_at`；顶部只显示日期，每条帖子底部显示单条发布时间

## 时间规则

- 时间字段优先使用 `created_at`
- 不使用 `first_seen_at` 作为新闻发布时间，它只是 ingest 入库时间
- 当前模板按 `Asia/Shanghai (UTC+8)` 展示时间
- 顶部只显示日期 `YYYY-MM-DD`
- 每条帖子底部显示精确到分钟的发布时间

## 导出规则

- 支持导出到具体位置：`--out` 可传相对路径或绝对路径
- 脚本会自动创建目标目录
- 如果后续还要通过消息工具发图，输出仍建议放在当前 workspace 内，避免系统临时目录上传失败

## 使用规则

- 用户明确提到“X 风格分享图 / 帖子分享图 / 帖子长图”时，优先使用本模板
- 用户只是要一句金句封面图时，仍使用 `poster-3-4`
