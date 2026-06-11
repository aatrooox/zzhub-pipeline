---
name: zzhub-topic
description: 管理内容选题的完整生命周期。当需要管理选题池、评估选题、排期、复盘时使用。覆盖从创意收集到发布复盘的全流程。
---

# zzhub-topic — 选题管理 Agent

zzhub-pipeline 选题管理系统的编排层。通过 `topic` 命令组管理选题的完整生命周期。

## 前置信息

开始前先确认 workspace 路径。按优先级尝试：

1. 问用户："workspace 路径是什么？"
2. 检查环境变量 `ZZHUB_PIPELINE_WORKSPACE_ROOT`
3. 执行 `zzhub-pipeline config --key paths.workspaceRoot` 读取配置中的默认值

后续示例中用 `{workspace}` 表示 workspace 路径。

全局命令：`zzhub-pipeline`（或简写 `zzp`），安装后即可在任何目录执行。

## 选题状态流转

```
backlog → evaluating → scheduled → in_progress → published
                                              ↘ abandoned
```

- **backlog**: 待评估，刚收集的创意
- **evaluating**: 评估中，正在进行 AI 评估或人工审核
- **scheduled**: 已排期，确定了发布日期和账号
- **in_progress**: 执行中，已转化为发布任务
- **published**: 已发布，完成复盘
- **abandoned**: 已放弃，不再执行

## 核心操作

### 1. 添加选题

当有新创意或选题需求时：

```bash
zzp topic add \
  --workspace {workspace} \
  --title "选题标题" \
  --description "选题描述（可选）" \
  --priority high \
  --tags "标签1,标签2" \
  --notes "备注信息"
```

**参数说明**：
- `--title` (必填): 选题标题
- `--description`: 详细描述
- `--priority`: 优先级 (high/medium/low)，默认 medium
- `--tags`: 标签，逗号分隔，用于分类和筛选
- `--notes`: 备注，记录灵感来源或特殊要求

**输出**：返回完整的 topic 对象，包含 `topic_id`。

### 2. 查看选题列表

查看当前选题池：

```bash
# 查看所有选题
zzp topic list --workspace {workspace}

# 按状态筛选
zzp topic list --workspace {workspace} --status backlog

# 按优先级筛选
zzp topic list --workspace {workspace} --priority high

# 按标签筛选
zzp topic list --workspace {workspace} --tag "AI"

# 组合筛选
zzp topic list --workspace {workspace} --status evaluating --priority high

# 限制数量
zzp topic list --workspace {workspace} --limit 20
```

**常用场景**：
- 每日站会：`zzp topic list --status scheduled` 查看今日排期
- 选题评审：`zzp topic list --status backlog` 查看待评估选题
- 复盘会议：`zzp topic list --status published` 查看已发布选题

### 3. AI 评估选题

对选题进行 AI 评估和打分：

```bash
zzp topic update \
  --workspace {workspace} \
  --topic {topic_id} \
  --status evaluating \
  --ai-score 85 \
  --ai-reason "基于热点趋势、受众匹配度和竞争分析，该选题有较高潜力"
```

**评估维度**（建议）：
1. **热点趋势** (0-30 分): 是否符合当前热点或趋势
2. **受众匹配** (0-30 分): 是否契合目标受众兴趣
3. **竞争分析** (0-20 分): 同类内容的差异化程度
4. **执行难度** (0-20 分): 素材获取和制作难度（反向，难度越低分越高）

**评分标准**：
- 85-100: 高优先级，立即排期
- 70-84: 中优先级，纳入选题池
- 60-69: 低优先级，备选
- <60: 不建议执行

### 4. 排期

确定发布日期和目标账号：

```bash
zzp topic schedule \
  --workspace {workspace} \
  --topic {topic_id} \
  --scheduled-date 2026-06-15 \
  --target-account default
```

**参数说明**：
- `--scheduled-date` (必填): 发布日期 (YYYY-MM-DD)
- `--target-account`: 目标账号 (default/ancientone)，默认 default

**排期策略**：
- 避免同一天发布多篇相同主题的内容
- 考虑节假日和热点事件
- 平衡不同类型的内容（教程、观点、案例等）

### 5. 转化为发布任务

将选题转化为实际的发布任务：

```bash
zzp topic promote \
  --workspace {workspace} \
  --topic {topic_id} \
  --intent-text "写一篇关于...的文章" \
  --content-form article \
  --targets wechat \
  --account default
```

**行为**：
1. 创建新的发布任务（调用 init）
2. 更新选题状态为 `in_progress`
3. 关联 `run_id` 到选题
4. 返回任务的 `state_path`

**后续步骤**：使用 `zzhub-publish` skill 继续发布流程。

### 6. 复盘

发布完成后进行复盘：

```bash
zzp topic retro \
  --workspace {workspace} \
  --topic {topic_id} \
  --performance good \
  --lessons "标题悬念效果好，开头需要更吸引人" \
  --metrics-snapshot '{"reads": 1500, "likes": 45, "favorites": 23, "shares": 12}'
```

**参数说明**：
- `--performance` (必填): 表现评级 (excellent/good/average/poor)
- `--lessons`: 经验教训，记录成功经验和改进点
- `--metrics-snapshot`: 数据快照（JSON 字符串）

**复盘维度**：
1. **数据表现**: 阅读量、点赞、收藏、分享是否达到预期
2. **内容质量**: 写作质量、结构安排、论点表达
3. **标题效果**: 点击率、读者反馈
4. **改进方向**: 下次可以做得更好的地方

### 7. 放弃选题

放弃不再执行的选题：

```bash
zzp topic abandon \
  --workspace {workspace} \
  --topic {topic_id} \
  --reason "话题已过时"
```

**常见原因**：
- 话题过时或失去时效性
- 与账号定位不符
- 执行难度过高
- 已有类似内容

## 工作流示例

### 示例 1：日常选题管理

```bash
# 1. 收集新选题
zzp topic add --workspace ./ws --title "AI 工具推荐" --priority high --tags "AI,工具"

# 2. 查看待评估选题
zzp topic list --workspace ./ws --status backlog

# 3. AI 评估
zzp topic update --workspace ./ws --topic topic_xxx --status evaluating --ai-score 85 --ai-reason "..."

# 4. 排期
zzp topic schedule --workspace ./ws --topic topic_xxx --scheduled-date 2026-06-15

# 5. 查看排期
zzp topic list --workspace ./ws --status scheduled
```

### 示例 2：从选题到发布

```bash
# 1. 选择已排期的选题
TOPIC_ID=$(zzp topic list --workspace ./ws --status scheduled | jq -r '.[0].topic_id')

# 2. 转化为发布任务
zzp topic promote --workspace ./ws --topic $TOPIC_ID --intent-text "写一篇..."

# 3. 使用 zzhub-publish skill 完成发布流程
# ...

# 4. 发布完成后复盘
zzp topic retro --workspace ./ws --topic $TOPIC_ID --performance good --lessons "..."
```

### 示例 3：选题评审会议

```bash
# 1. 导出待评估选题
zzp topic list --workspace ./ws --status backlog --view markdown > backlog.md

# 2. 会议中逐个评估
zzp topic update --workspace ./ws --topic topic_1 --ai-score 90 --ai-reason "..."
zzp topic update --workspace ./ws --topic topic_2 --ai-score 65 --ai-reason "..."

# 3. 为高优先级选题排期
zzp topic schedule --workspace ./ws --topic topic_1 --scheduled-date 2026-06-20
```

## 错误恢复

CLI 命令失败时：
1. 仔细阅读错误信息
2. 大部分错误可修复：参数错误、数据库锁定等
3. 修复问题后重新执行同一命令
4. 如果错误持续，检查数据库文件是否存在：`ls {workspace}/zzhub.db`

## 与其他 Skill 的关系

- **zzhub-publish**: 选题转化为任务后，使用 zzhub-publish 完成发布流程
- **zzhub-analytics**: 使用 analytics 命令录入和分析发布后的数据，数据会关联到选题

## 最佳实践

1. **及时记录**: 有新创意立即记录，避免遗忘
2. **定期评审**: 每周评审一次 backlog，保持选题池健康
3. **数据驱动**: 基于历史数据调整选题策略
4. **复盘总结**: 每篇文章发布后都要复盘，积累经验
5. **标签管理**: 使用一致的标签体系，方便筛选和分析
