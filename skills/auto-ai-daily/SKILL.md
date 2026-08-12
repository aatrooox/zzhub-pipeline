---
name: auto-ai-daily
description: 全自动每日 AI 资讯发文流程。从 AIHOT 抓取今日热门前五条，扩写为 1000-1200 字文章，经 humanizer-zh 去 AI 味后，通过 zzhub-pipeline 跳过 review 直接发布到微信公众号「早早集市」。
---

# auto-ai-daily — 全自动 AI 日报发文

无人值守的端到端发文流水线。每天定时执行，从素材到发布全自动完成。

## 固定参数

- **workspace**: `/Users/aatrox/.oh-my-zzhub`
- **发布账号**: 早早集市（default）
- **内容形式**: article（微信公众号图文）
- **目标**: wechat
- **内容来源**: external
- **review 策略**: 跳过审核，写完直接标记 `passed`

## 执行流程

严格按顺序执行以下 5 个阶段。单篇文章失败不影响其他文章，记录错误后继续。

### 阶段 1：抓取今日 AI 热门

```bash
UA="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
since=$(date -u -v-24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '24 hours ago' +%Y-%m-%dT%H:%M:%SZ)
curl -sH "User-Agent: $UA" "https://aihot.virxact.com/api/public/items?mode=selected&since=$since&take=5"
```

从返回 JSON 的 `items` 数组中取前 5 条。每条提取：
- `title` — 资讯标题
- `summary` — 摘要
- `sourceUrl` — 原文链接
- `source` — 来源名称
- `category` — 分类 slug

如果返回不足 5 条，用 `take=10` 重试一次，仍取前 5 条。

### 阶段 2：扩写文章

对每一条资讯，撰写一篇 **1000-1200 字** 的中文文章。

**写作要求：**
1. 以资讯事实为核心，忠实还原事件全貌，不编造细节
2. 不做任何评判、褒贬或立场表态——只陈述事实
3. 结构清晰：标题（H1）→ 事件概述 → 背景/细节展开 → 相关信息 → 来源标注
4. 段落长短交错，避免每段长度相同
5. 用具体数字、名称、日期，不用模糊的"专家认为""有报道称"
6. 文末用一行注明来源：`信息来源：{source}（{sourceUrl}）`

**humanizer-zh 强制应用：**

写作时必须遵循以下去 AI 味规则：
- 删除所有填充短语（"值得注意的是""此外""总而言之"等）
- 不用三段式列举（改为两项或四项）
- 不用"不仅……而且……""这不仅仅是……而是……"等否定式排比
- 不用破折号做戏剧性停顿
- 不用"标志着""彰显了""至关重要""充满活力"等 AI 高频词
- 不写"展望未来""尽管面临挑战"等公式化段落
- 句长有变化，短句和长句混合
- 直接陈述事实，不做软化和过度解释
- 不用粗体装饰短语
- 不使用表情符号
- 结尾要具体，不写通用的积极展望

将文章保存为 markdown 文件到临时目录：

```bash
mkdir -p /tmp/auto-ai-daily
# 文件命名：article-{序号}.md，例如 article-1.md
```

文件第一行必须是 H1 标题：`# {文章标题}`

### 阶段 3：发布到早早集市

对每篇文章，依次执行以下命令。将 `{state_path}` 替换为上一条命令输出的实际路径。

#### 3.1 初始化任务

```bash
zzhub-pipeline init \
  --workspace /Users/aatrox/.oh-my-zzhub \
  --task-kind publish \
  --content-form article \
  --targets wechat \
  --content-origin external \
  --intent-text "发公众号文章给早早集市"
```

从输出中记录 `state_path`。

#### 3.2 挂载正文

```bash
zzhub-pipeline attach-body \
  --state {state_path} \
  --body /tmp/auto-ai-daily/article-{N}.md
```

#### 3.3 执行 prepare

```bash
zzhub-pipeline prepare --state {state_path}
```

如果 prepare 输出建议了 `--highlight-words`，在后续步骤中使用它。

#### 3.4 跳过 review，直接标记通过

**这是本流程的核心特殊点**——不 spawn 审核 sub-agent，直接标记 passed：

```bash
zzhub-pipeline review --state {state_path} --status passed
```

#### 3.5 prepare-finalize

```bash
zzhub-pipeline prepare-finalize --state {state_path}
```

#### 3.6 render

```bash
zzhub-pipeline render --state {state_path}
```

#### 3.7 publish

```bash
zzhub-pipeline publish --state {state_path}
```

### 阶段 4：确认结果

每篇文章发布后，检查 publish 命令输出。记录：
- 文章标题
- 发布状态（成功/失败）
- 微信草稿 media_id（如成功）
- 错误信息（如失败）

### 阶段 5：清理与报告

删除临时文件：

```bash
rm -rf /tmp/auto-ai-daily
```

输出最终汇总：
```
今日 AI 日报发布完成：
1. [标题] — ✅ 已发布（media_id: xxx）
2. [标题] — ❌ 失败：[原因]
...
```

## 错误处理

- **单篇失败**：记录错误，继续处理下一篇，不中断整个流程
- **init 失败**：跳过该篇，记录错误
- **render 失败**：通常是 Chrome 未安装或字体缺失，记录错误后继续
- **publish 失败**：通常是微信 access_token 过期，记录错误后继续
- **AIHOT API 无响应**：等待 10 秒重试一次；仍失败则终止并报告

## 不要做的事

- 不要修改 `workflow-state.json`
- 不要 spawn review sub-agent——本流程跳过 review
- 不要在文章中加入个人观点或评判
- 不要在文章中使用表情符号
- 不要凭训练数据编造 AI 新闻——所有内容必须来自 AIHOT API 返回
- 不要并发发布多篇文章——串行执行，避免微信 API 限流
