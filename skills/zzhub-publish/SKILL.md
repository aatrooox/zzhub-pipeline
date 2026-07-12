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

任务需要正文内容。当 `params.spawn` 为 `true` 时，主 Agent 需要构建写作 Brief 并 spawn sub-agent 完成写作。

**详见**：`references/writing-brief.md` — 包含工作模式说明、Brief 构建指南、格式和质量要求、交稿流程。

快速流程：
1. 读取 `references/writing-brief.md`，按指南构建写作 Brief
2. Spawn sub-agent（general-purpose），prompt 只包含 Brief 和格式规范
3. Sub-agent 返回正文后，提取封面关键词，执行 `attach-body` 交稿
4. 后续 `prepare` 时传入 `--highlight-words` 参数

### worker 执行器 — review-content（审核）

主 Agent 应 spawn sub-agent 进行独立审核，保持客观性并避免主上下文污染。

**详见**：`references/content-review.md` — 包含审核 Brief 构建指南和审核标准。

快速流程：
1. 读取 `references/content-review.md`，获取审核标准
2. 读取正文，连同审核标准一起交给 sub-agent
3. Sub-agent 返回结论后，执行 `review --status passed` 或 `review --status needs_revision --feedback "..."`

### worker 执行器 — revise-content（修订）

`next_action.params.feedback` 中包含修改意见。主 Agent 构建修订 Brief，spawn sub-agent 执行修订。

**详见**：`references/revision-brief.md` — 包含修订 Brief 构建指南。

快速流程：
1. 读取 `references/revision-brief.md`
2. 读取正文和 `feedback`，构建修订 Brief，spawn sub-agent
3. Sub-agent 返回修改后的正文，执行 `attach-body` 交稿
4. 重新 `status`，下一步通常是 `review-content`

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

可选参数：
- `--existing-draft-media-id MEDIA_ID` — 更新已有草稿而非新建
- `--note-id NOTE_ID` — 关联 Nezus note，发布成功后自动回调通知

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

## 草稿箱管理

任务创建或发布前，可以用以下命令查看或删除微信草稿箱中的草稿：

```bash
# 列出最近 20 篇草稿（账号不传时使用 wx.defaultAccount 默认值）
zzhub-pipeline wx-drafts --limit 10

# 获取某篇草稿的完整内容（含 HTML）
zzhub-pipeline wx-drafts --media-id MEDIA_ID

# 删除一篇草稿
zzhub-pipeline wx-draft-delete --media-id MEDIA_ID
```

`--account` 参数可选，默认使用配置中的 `wx.defaultAccount`。指定账号：`--account ancientone`。

发布完成后，如果需要清理草稿箱（例如更新已有草稿后想删掉旧版本），用 `wx-drafts` 查到旧版 `media_id`，然后 `wx-draft-delete` 删除。

## 多账号/多平台发布

### init 时指定多目标

```bash
# 多目标（逗号分隔 route@account 格式）
zzp init --workspace ws \
  --targets "wechat-article@default,wechat-article@ancientone,blog@default" \
  --task-kind publish --content-form article --content-origin user

# 无 @ 时使用 --account 值
zzp init --workspace ws --targets "wechat-article,blog" --account ancientone
```

单目标时 `publish_targets` 为空（向后兼容）。多目标时写入 `publish_targets`，publish 阶段一次性并行发布。

### 事后追加发布（republish）

任务完成后（mode=done），追加发布到其他账号/平台：

```bash
# 简写：同路由不同账号
zzp republish --state {state_path} --account ancientone

# 多目标
zzp republish --state {state_path} --targets "wechat-article@ancientone,blog@default"

# 混合
zzp republish --state {state_path} --account ancientone --targets "blog@default"
```

**前置条件**：
- `asset_path` 存在（产物已生成）
- `content_review.status = passed`

**行为**：
- 并行执行所有新 targets
- 幂等：已成功的 route+account 自动跳过
- mode 保持 done，结果追加到 `publish.results[]`
- 有失败时返回错误详情
