---
name: zzhub-analytics
description: 录入和分析发布后的数据。当需要记录文章表现、对比历史数据、分析趋势时使用。支持阅读、点赞、收藏、分享等指标的追踪和分析。
---

# zzhub-analytics — 数据分析 Agent

zzhub-pipeline 数据分析系统的编排层。通过 `analytics` 命令组录入和分析发布后的数据。

## 前置信息

开始前先确认 workspace 路径。按优先级尝试：

1. 问用户："workspace 路径是什么？"
2. 检查环境变量 `ZZHUB_PIPELINE_WORKSPACE_ROOT`
3. 执行 `zzhub-pipeline config --key paths.workspaceRoot` 读取配置中的默认值

后续示例中用 `{workspace}` 表示 workspace 路径。

全局命令：`zzhub-pipeline`（或简写 `zzp`），安装后即可在任何目录执行。

## 数据存储

所有分析数据存储在 `{workspace}/zzhub.db`（SQLite 数据库）的 `analytics` 表中。

**数据结构**：
```json
{
  "run_id": "run_001",
  "topic_id": "topic_001",
  "title": "文章标题",
  "publish_date": "2026-06-11",
  "reads": 1500,
  "likes": 45,
  "favorites": 23,
  "shares": 12,
  "comments": 8,
  "notes": "表现良好",
  "recorded_at": "2026-06-15T10:00:00Z"
}
```

## 核心操作

### 1. 录入发布数据

发布完成后录入数据：

```bash
zzp analytics record \
  --state {workspace}/posts/{date-slug}/workflow-state.json \
  --reads 1500 \
  --likes 45 \
  --favorites 23 \
  --shares 12 \
  --comments 8 \
  --notes "标题效果好，转化率高"
```

**参数说明**：
- `--state` (必填): 任务状态文件路径
- `--reads`: 阅读量
- `--likes`: 点赞数
- `--favorites`: 收藏数
- `--shares`: 分享数
- `--comments`: 评论数
- `--notes`: 备注，记录关键观察或特殊原因

**数据来源**：
- 微信公众号后台 → 阅读量、点赞、收藏、分享、评论
- 博客平台统计 → 阅读量、评论
- 手动记录 → 其他平台数据

**录入时机**：
- 发布后 24 小时：初步数据
- 发布后 7 天：稳定数据
- 发布后 30 天：最终数据

**幂等性**：同一 `run_id` 可以多次录入，数据会更新而不是重复。

### 2. 查看历史数据

查看发布数据的列表：

```bash
# 查看所有数据
zzp analytics list --workspace {workspace}

# 查看最近 30 天
zzp analytics list --workspace {workspace} --days 30

# 按阅读量排序
zzp analytics list --workspace {workspace} --sort reads

# 按点赞排序
zzp analytics list --workspace {workspace} --sort likes

# 限制数量
zzp analytics list --workspace {workspace} --limit 20

# 组合使用
zzp analytics list --workspace {workspace} --days 7 --sort reads --limit 10
```

**排序字段**：
- `publish_date` (默认): 按发布日期
- `reads`: 按阅读量
- `likes`: 按点赞数

**常用场景**：
- 周报：`zzp analytics list --days 7` 查看本周发布
- 月报：`zzp analytics list --days 30` 查看本月发布
- 排行榜：`zzp analytics list --sort reads --limit 10` 查看 Top 10

### 3. 数据对比（未来扩展）

对比多篇文章的数据表现：

```bash
# 未来支持
zzp analytics compare \
  --run-ids "run1,run2,run3" \
  --metrics reads,likes
```

### 4. 趋势分析（未来扩展）

分析数据趋势：

```bash
# 未来支持
zzp analytics trend \
  --workspace {workspace} \
  --period 90d \
  --group-by week
```

## 工作流示例

### 示例 1：日常数据录入

```bash
# 1. 发布后 24 小时录入初步数据
zzp analytics record \
  --state ./posts/2026-06-11-article/workflow-state.json \
  --reads 500 \
  --likes 15 \
  --notes "24 小时数据"

# 2. 发布后 7 天更新数据
zzp analytics record \
  --state ./posts/2026-06-11-article/workflow-state.json \
  --reads 1500 \
  --likes 45 \
  --favorites 23 \
  --shares 12 \
  --notes "7 天数据，表现良好"

# 3. 发布后 30 天最终数据
zzp analytics record \
  --state ./posts/2026-06-11-article/workflow-state.json \
  --reads 2200 \
  --likes 68 \
  --favorites 35 \
  --shares 18 \
  --comments 8 \
  --notes "最终数据"
```

### 示例 2：周报制作

```bash
# 1. 查看本周发布
zzp analytics list --workspace ./ws --days 7

# 2. 查看本周表现最好的
zzp analytics list --workspace ./ws --days 7 --sort reads --limit 5

# 3. 导出数据（未来支持）
zzp analytics export --days 7 --format csv --output weekly-report.csv
```

### 示例 3：月度分析

```bash
# 1. 查看本月所有发布
zzp analytics list --workspace ./ws --days 30

# 2. 查看本月 Top 10
zzp analytics list --workspace ./ws --days 30 --sort reads --limit 10

# 3. 分析表现好的文章特点
# 查看 Top 10 的标题、标签、发布时间等
```

## 数据指标解读

### 阅读量 (reads)

**影响因素**：
- 标题吸引力
- 发布时间
- 账号粉丝数
- 推荐算法

**基准值**（仅供参考）：
- 优秀: >2000
- 良好: 1000-2000
- 一般: 500-1000
- 较差: <500

### 点赞数 (likes)

**影响因素**：
- 内容质量
- 情感共鸣
- 实用性

**基准值**：
- 点赞率 = likes/reads
- 优秀: >3%
- 良好: 2-3%
- 一般: 1-2%
- 较差: <1%

### 收藏数 (favorites)

**影响因素**：
- 内容实用性
- 参考价值
- 可重复阅读性

**基准值**：
- 收藏率 = favorites/reads
- 优秀: >2%
- 良好: 1-2%
- 一般: 0.5-1%
- 较差: <0.5%

### 分享数 (shares)

**影响因素**：
- 社交价值
- 情感共鸣
- 实用性
- 话题性

**基准值**：
- 分享率 = shares/reads
- 优秀: >1.5%
- 良好: 0.8-1.5%
- 一般: 0.3-0.8%
- 较差: <0.3%

### 评论数 (comments)

**影响因素**：
- 话题性
- 争议性
- 互动引导
- 读者参与度

**基准值**：
- 评论率 = comments/reads
- 优秀: >1%
- 良好: 0.5-1%
- 一般: 0.2-0.5%
- 较差: <0.2%

## 与其他 Skill 的关系

- **zzhub-topic**: 选题复盘时使用 analytics 数据，数据会关联到选题
- **zzhub-publish**: 发布完成后使用 analytics 录入数据

## 最佳实践

1. **及时录入**: 发布后及时录入数据，避免遗忘
2. **多次更新**: 24 小时、7 天、30 天各录入一次，观察数据变化
3. **记录备注**: 在 notes 中记录关键观察，方便后续分析
4. **定期分析**: 每周/每月分析数据，发现规律
5. **对标基准**: 使用基准值评估表现，持续优化

## 错误恢复

CLI 命令失败时：
1. 仔细阅读错误信息
2. 检查 state 文件是否存在
3. 检查数据库文件是否存在：`ls {workspace}/zzhub.db`
4. 修复问题后重新执行同一命令

## 未来扩展

计划中的功能：
- `analytics compare`: 对比多篇文章的数据
- `analytics trend`: 趋势分析和可视化
- `analytics export`: 导出数据为 CSV/JSON
- `analytics query`: 自定义 SQL 查询
