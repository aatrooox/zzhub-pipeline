# poster-3-4 模板规范

比例：3:4 | 尺寸：900×1200 | 用途：小绿书 / 公众号 / 小红书通用封面

 
## 渲染命令

```bash
bun ./scripts/render-card.ts \
  --template poster-3-4 \
  --out tmp/card.png \
  --text "OpenClaw 有两层 model 配置" \
  --highlight "#22a854" \
  --highlight-words "OpenClaw,model" \
  --bg "#e6f5ef" \
  --footer "公众号 · 早早集市"
```

如果用户已经明确拆成三行，也可以直接按行控制：

```bash
bun ./scripts/render-card.ts \
  --template poster-3-4 \
  --line1 "OpenClaw 有两层" \
  --line2 "model 配置" \
  --hl2 \
  --out tmp/card-lines.png
```

## 参数说明

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--text` | 空 | 推荐入口。整段文案，自适应字号和自动断行 |
| `--line1` | 空 | 第一行文字 |
| `--line2` | 空 | 第二行文字（空则隐藏）|
| `--line3` | 空 | 第三行文字（空则隐藏）|
| `--hl1` | 关闭 | 整行高亮：第一行 |
| `--hl2` | 关闭 | 整行高亮：第二行 |
| `--hl3` | 关闭 | 整行高亮：第三行 |
| `--highlight-words` | 空 | 按子串高亮，逗号分隔（子串匹配，非单词边界），如 `OpenClaw,GPT-5.4`（跨行生效）|
| `--highlight` | `#22a854` | 高亮/强调色 |
| `--bg` | `#e6f5ef` | 背景色 |
| `--footer` | `公众号 · 早早集市` | 底部文字 |
| `--icon` | 自动判断 | 顶部图标路径，不传则按内容自动选 |
| `--template` | `poster-3-4` | 模板名称 |
| `--out` | — | 必填，输出 PNG 路径 |
| `--fallback-icon` | — | 备用图标路径，`--icon` 判空时使用 |

## 高亮文字处理规则

**两种高亮方式，按需选择：**

当使用 `--text` 时，优先使用 `--highlight-words`。当使用 `--line1/2/3` 时，`--hl1/2/3` 仍然有效。

### 1. 整行高亮（`--hl1` / `--hl2` / `--hl3`）
整行文字渲染为高亮色。适合"某一行是关键句"的场景。

> 示例：第二行要高亮
> → `--line1 "GPT-5.4 发布了" --line2 "能控电脑" --hl2`

### 2. 按词高亮（`--highlight-words`）
在任意行中，将指定词语渲染为高亮色，其余文字保持黑色。适合"某几个关键词"的场景。

> 示例：高亮 OpenClaw 和 GPT-5.4
> → `--line1 "GPT-5.4 最适合" --line2 "OpenClaw 使用" --highlight-words "GPT-5.4,OpenClaw"`

**优先级规则（有歧义时）：**
- 用户说「高亮第X行」→ 用 `--hlX`
- 用户说「高亮某个词/某几个词」→ 用 `--highlight-words`
- 两者可以同时使用



| 位置 | 最多字数 | 说明 |
|------|---------|------|
| 每行（line1/2/3） | **6~7 个汉字** / **10~12 个英文字符** | 字号 108px，可用宽 720px |
| 三行合计 | **≤ 20 字** | 超出则横向溢出，无法使用 |

> 用户文案超出时，先帮忙拆分/缩写到上限内，再渲染，不要直接塞入模板。

## 配图选取原则

| 条件 | 使用图标 | 文件 |
|------|---------|------|
| 任意行含 `openclaw` 或 `skill`（不区分大小写） | OpenClaw 圆形 logo | `assets/icons/openclaw-logo.svg` |
| 其他（默认） | 博客站 logo（灰色） | `assets/icons/zzclub-logo-black.jpg` |
