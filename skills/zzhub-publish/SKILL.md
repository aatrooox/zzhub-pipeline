---
name: zzhub-publish
description: 编排 zzhub-pipeline 状态机完成内容发布。当用户需要发布微信公众号文章或图文消息、创建草稿、或管理发布任务时使用。覆盖完整的 prepare→render→publish 流程。
---

# zzhub-publish — 内容发布 Agent

zzhub-pipeline 状态机的编排层。CLI 通过 `--view agent` 输出告诉你**要做什么**，本 skill 覆盖**具体怎么做**，特别是需要 AI 判断的环节（写稿、审核、修订）。

## 前置信息

开始前先确认 workspace 路径。按优先级尝试：

1. 问用户："workspace 路径是什么？"
2. 检查环境变量 `ZZHUB_PIPELINE_WORKSPACE_ROOT`
3. 执行 `zzhub-pipeline config --key paths.workspaceRoot` 读取配置中的默认值

后续示例中用 `{workspace}` 表示 workspace 路径。

全局命令：`zzhub-pipeline`（或简写 `zzp`），安装后即可在任何目录执行。

## 核心循环

严格按以下顺序执行，不许跳过或打乱：

1. **查找任务**：`zzhub-pipeline find-run --workspace {workspace} --active --view agent`
2. **检查状态**：`zzhub-pipeline status --state {state_path} --view agent`
3. **执行** `next_action.action` 指定的动作（见下方各处理器）
4. **重复** 直到 `next_action.action` 为 `complete`

如果 `find-run` 返回空，先创建任务（见下方"任务创建"）。

## 动作处理器

从 `status --view agent` 输出中读取 `next_action`，按匹配的处理器执行：

### cli 执行器

直接执行 `## Suggested Command` 下的命令（已经是 `zzhub-pipeline` 格式），完成后重新 `status`。

适用动作：`prepare`、`prepare-finalize`、`render`、`publish`

### worker 执行器 — attach-body（写稿）

任务需要正文内容。`next_action.params` 指明模式：

- **worker_mode=write**：从零写一篇新文章。任务中的 `intent_text` 描述了用户想要的内容。
- **worker_mode=write-from-materials**：`source_materials_path` 有上游素材。先读完再写。
- **worker_mode=research-then-write** / **research-then-write-from-materials**：先调研再写稿。用网络搜索收集事实信息，然后动笔。

写完后，通过以下命令交稿：

```bash
zzhub-pipeline attach-body --state {state_path} --body-text "{正文内容}"
```

如果正文很长，先写到临时文件，然后用 `--body {file_path}` 代替。

**写稿质量要求：**
- 有具体的细节和观点，避免空洞的套话
- 段落简短，适合手机阅读（每段 2-4 句）
- 有个人语气和风格，不要写得像教科书或官方通稿
- 标题要有吸引力但不能标题党

### worker 执行器 — review-content（审核）

读取 `source_body_path`（或 `formatted_body_path`，如果存在）对应的正文。按以下标准审核：

1. **AI 味检测**：是否读起来像 AI 生成？警惕：过于流畅的过渡句、空洞的总结、无意义的最高级形容词、公式化的结构、缺乏具体细节或个人声音。
2. **事实准确性**：文章中的说法、日期、人名、技术细节是否准确？标记任何看起来有问题的内容。
3. **微信适配**：格式是否适合微信阅读？段落是否简短？是否有微信无法渲染的 markdown？字数是否合适（文章 800-3000 字）？
4. **标题质量**：标题是否准确且有吸引力？是否避免了标题党？

决策：
- **通过** → 执行：`zzhub-pipeline review --state {state_path} --status passed`
- **需要修改** → 执行：`zzhub-pipeline review --state {state_path} --status needs_revision --feedback "具体修改建议..."`

反馈必须具体可操作，用中文写，明确指出需要修改的具体段落。

### worker 执行器 — revise-content（修订）

`next_action.params.feedback` 中包含修改意见。读取 `source_body_path` 的正文，按要求修改后交稿：

```bash
zzhub-pipeline attach-body --state {state_path} --body-text "{修改后的正文}"
```

交稿后重新 `status`。下一步通常会是 `review-content`（重新审核）。

### await-input 执行器

任务需要用户输入（如图片素材）。`required_inputs` 列出了需要什么。向用户询问，然后把用户提供的值替换到 `{images_json_path}` 等占位符中，执行建议的命令。

适用动作：`attach-body-images`

### repair 执行器

执行建议的 `checkpoint` 命令进行诊断，根据输出判断。如果任务已失败且无法恢复，告知用户并建议 `reset --mode full`。

适用动作：`reset-or-repair`、`resolve-handoff`

### complete 执行器

向用户报告最终状态：标题、路由、发布结果（如有）。任务完成。

适用动作：`complete`

## 任务创建

当 `find-run` 返回空时，先创建任务。询问用户想发布什么内容，然后：

```bash
zzhub-pipeline init \
  --workspace {workspace} \
  --task-kind publish \
  --content-form article \
  --targets wechat \
  --content-origin user \
  --intent-text "{用户的中文需求描述}"
```

账号映射：
- "大号" / "早早集市" / "default" → 默认账号
- "小号" / "古一" / "ancientone" → 使用 `--account ancientone`

图文消息（图片合集）用 `--content-form newspic --requires-render`。

`init` 执行后 CLI 会输出 `state_path`。将其传给 `status --view agent` 继续循环。

### Handoff 入口（ingest-handoff）

当人类或外部系统已准备好 body 文件，通过 JSON 交接：

```bash
zzhub-pipeline ingest-handoff --file {handoff.json 的路径}
```

新建任务的 handoff JSON 必须包含 `user_intent_text`（用于路由解析）：

```json
{
  "workflow_handoff": {
    "mode": "new",
    "content_form": "article",
    "body_path": "/abs/path/body.md",
    "target_account": "default",
    "title": "文章标题",
    "user_intent_text": "发公众号文章给大号，标题是..."
  }
}
```

ingest 后 body 已自动挂载。运行 `status --view agent` 从 CLI 指示的位置继续——通常是 `prepare`（元数据完整时）或 `review-content`（review_policy 为 `trust_user` 时）。

## 错误恢复

CLI 命令失败时：
1. 仔细阅读错误信息
2. 大部分错误可修复：文件缺失、状态异常、Chrome 未安装
3. 修复问题后重新执行同一命令
4. 如果错误持续或含义不明，运行 `zzhub-pipeline checkpoint --state {state_path}` 诊断
5. **绝对不要**直接修改 `workflow-state.json`
