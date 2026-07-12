# 内容修订 Brief 构建指南

当 `next_action.action` 为 `revise-content` 时，`next_action.params.feedback` 中包含修改意见。主 Agent 构建修订 Brief（原文 + 修改意见 + 格式要求），spawn sub-agent 在干净上下文中执行修订。

## 构建修订 Brief

主 Agent 读取 `source_body_path` 的正文，与 `feedback` 一起构建修订 Brief。

Brief 应包含：
- 原始正文内容
- 具体的修改意见（来自 `feedback`）
- 写稿格式要求（参考 writing-brief.md 中的格式要求）

## Spawn Sub-agent

使用 `Agent` 工具 spawn sub-agent（类型选择 `general-purpose`），prompt 中只包含原文、修改意见、格式要求。

## 交稿流程

Sub-agent 返回修改后的正文。主 Agent 检查修改是否覆盖了所有反馈点，然后交稿：

```bash
zzhub-pipeline attach-body --state {state_path} --body-text "{修改后的正文}"
```

交稿后重新 `status`。下一步通常会是 `review-content`（重新审核）。
