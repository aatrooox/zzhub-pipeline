# zzhub-pipeline 扩展设计：选题管理与数据分析

**日期**: 2026-06-11  
**状态**: 草案  
**版本**: v1.0

---

## 概述

本设计规划将 zzhub-pipeline 从单纯的发布工具扩展为完整的内容生命周期管理系统，支持选题管理、数据分析等功能。系统将与 Hermes Agent 集成，由 Hermes 负责智能决策和调度，CLI 专注于业务逻辑和数据管理。

---

## 目标与范围

### 目标

1. **完整生命周期管理**：从选题到发布再到数据分析的全流程
2. **选题管理**：选题池、AI 评估、排期、复盘
3. **数据分析**：手动录入发布后数据，历史对比和趋势分析
4. **Hermes 集成**：CLI 命令作为 Hermes Tools，由 Hermes 负责智能层

### 非目标

1. **不迁移主流程存储**：保持 workflow-state.json 不变
2. **不内置 LLM 调用**：由 Hermes 负责 AI 决策
3. **不实现自动数据拉取**：数据分析基于手动录入
4. **不实现复杂的调度系统**：由 Hermes 负责任务调度

---

## 架构设计

### 整体架构

```
┌─────────────────────────────────────────────┐
│   Hermes Agent（智能层）                     │
│   - LLM 调用、决策、调度                    │
│   - Skill 管理（选题策略、写作风格等）       │
│   - Token 追踪、成本控制                    │
│   - 自我学习和改进                          │
└─────────────┬───────────────────────────────┘
              │ Tool 调用
              ▼
┌─────────────────────────────────────────────┐
│   zzhub-pipeline CLI（业务层）               │
│                                             │
│   现有功能（保留）：                        │
│   - init, prepare, render, publish          │
│   - status, tasks, find-run                 │
│   - reset, review, abandon                  │
│                                             │
│   新增功能：                                │
│   - topic 组：选题管理                      │
│   - analytics 组：数据分析                  │
└─────────────────────────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────┐
│   数据存储层                                 │
│   - workflow-state.json（已有，不动）        │
│   - zzhub.db（新增，SQLite）                │
│     - topics 表                             │
│     - analytics 表                          │
└─────────────────────────────────────────────┘
```

### 职责分工

| 层级 | 职责 | 技术 |
|------|------|------|
| **Hermes Agent** | LLM 调用、智能决策、任务调度、Skill 管理 | Hermes 框架 |
| **CLI 业务层** | 业务逻辑、状态管理、数据持久化、发布流程 | Bun + TypeScript |
| **数据存储层** | 结构化数据查询和存储 | SQLite (bun:sqlite) |

### 为什么选择 SQLite

1. **Bun 内置**：`bun:sqlite` 原生支持，无需额外依赖
2. **零依赖**：npm 分发时不会增加安装复杂度
3. **查询能力**：支持复杂查询和索引
4. **性能**：支持大数据量（千级到万级）
5. **事务支持**：数据一致性保障
6. **单文件**：`zzhub.db` 一个文件管理所有新数据

### 为什么不迁移主流程

1. **保持简单**：现有 JSON 方案够用，YAGNI 原则
2. **可读性**：用户可以直接查看和调试 workflow-state.json
3. **Git 友好**：可以版本控制任务状态
4. **风险低**：不破坏现有功能
5. **灵活性**：未来如需要再迁移

---

## 数据模型设计

### SQLite 数据库结构

数据库文件位置：`{workspace}/zzhub.db`

#### topics 表

```sql
CREATE TABLE topics (
  topic_id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT CHECK(priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
  tags TEXT, -- JSON array: ["AI", "工具"]
  notes TEXT,
  status TEXT CHECK(status IN (
    'backlog',      -- 待评估
    'evaluating',   -- 评估中
    'scheduled',    -- 已排期
    'in_progress',  -- 执行中（已转化为任务）
    'published',    -- 已发布
    'abandoned'     -- 已放弃
  )) DEFAULT 'backlog',
  
  -- AI 评估
  ai_score INTEGER, -- 0-100
  ai_reason TEXT,
  
  -- 排期
  scheduled_date TEXT, -- YYYY-MM-DD
  target_account TEXT,
  
  -- 关联
  run_id TEXT, -- 转化为任务后的 run_id
  
  -- 复盘
  retro_performance TEXT CHECK(retro_performance IN (
    'excellent', 'good', 'average', 'poor', null
  )),
  retro_lessons TEXT,
  retro_metrics_snapshot TEXT, -- JSON: {"reads": 1500, "likes": 45, ...}
  
  created_at TEXT NOT NULL, -- ISO 8601
  updated_at TEXT NOT NULL
);

CREATE INDEX idx_topics_status ON topics(status);
CREATE INDEX idx_topics_priority ON topics(priority);
CREATE INDEX idx_topics_scheduled ON topics(scheduled_date);
CREATE INDEX idx_topics_created ON topics(created_at);
```

#### analytics 表

```sql
CREATE TABLE analytics (
  run_id TEXT PRIMARY KEY,
  topic_id TEXT,
  title TEXT NOT NULL,
  publish_date TEXT NOT NULL, -- YYYY-MM-DD
  
  -- 指标
  reads INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  favorites INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  
  notes TEXT,
  recorded_at TEXT NOT NULL, -- ISO 8601
  
  FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
);

CREATE INDEX idx_analytics_publish_date ON analytics(publish_date);
CREATE INDEX idx_analytics_topic ON analytics(topic_id);
CREATE INDEX idx_analytics_reads ON analytics(reads);
```

### TypeScript 类型定义

```typescript
// src/schema/topic.ts
import { z } from "zod";

export const TopicPrioritySchema = z.enum(["high", "medium", "low"]);
export const TopicStatusSchema = z.enum([
  "backlog",
  "evaluating",
  "scheduled",
  "in_progress",
  "published",
  "abandoned",
]);
export const RetroPerformanceSchema = z.enum([
  "excellent",
  "good",
  "average",
  "poor",
]);

export const TopicSchema = z.object({
  topic_id: z.string(),
  title: z.string(),
  description: z.string().nullable().default(null),
  priority: TopicPrioritySchema.default("medium"),
  tags: z.array(z.string()).default([]),
  notes: z.string().nullable().default(null),
  status: TopicStatusSchema.default("backlog"),
  
  ai_score: z.number().int().min(0).max(100).nullable().default(null),
  ai_reason: z.string().nullable().default(null),
  
  scheduled_date: z.string().nullable().default(null),
  target_account: z.string().nullable().default(null),
  
  run_id: z.string().nullable().default(null),
  
  retro_performance: RetroPerformanceSchema.nullable().default(null),
  retro_lessons: z.string().nullable().default(null),
  retro_metrics_snapshot: z.any().nullable().default(null),
  
  created_at: z.string(),
  updated_at: z.string(),
});

export type Topic = z.infer<typeof TopicSchema>;
export type TopicPriority = z.infer<typeof TopicPrioritySchema>;
export type TopicStatus = z.infer<typeof TopicStatusSchema>;
```

```typescript
// src/schema/analytics.ts
import { z } from "zod";

export const AnalyticsSchema = z.object({
  run_id: z.string(),
  topic_id: z.string().nullable().default(null),
  title: z.string(),
  publish_date: z.string(),
  
  reads: z.number().int().default(0),
  likes: z.number().int().default(0),
  favorites: z.number().int().default(0),
  shares: z.number().int().default(0),
  comments: z.number().int().default(0),
  
  notes: z.string().nullable().default(null),
  recorded_at: z.string(),
});

export type Analytics = z.infer<typeof AnalyticsSchema>;
```

---

## CLI 命令设计

### Topic 命令组

#### 1. `topic add` — 添加选题

```bash
zzp topic add \
  --workspace {ws} \
  --title "标题" \
  --description "描述" \
  --priority high \
  --tags "AI,工具" \
  --notes "灵感来源..."
```

**参数**：
- `--workspace` (必填): 工作区路径
- `--title` (必填): 选题标题
- `--description`: 选题描述
- `--priority`: 优先级 (high/medium/low)，默认 medium
- `--tags`: 标签，逗号分隔
- `--notes`: 备注

**输出**：
```json
{
  "topic_id": "topic_20260611_abc123",
  "title": "标题",
  "status": "backlog",
  "created_at": "2026-06-11T15:30:00.000Z"
}
```

#### 2. `topic list` — 列出选题

```bash
zzp topic list \
  --workspace {ws} \
  --status active \
  --priority high \
  --tag "AI" \
  --sort priority \
  --limit 20 \
  --view agent
```

**参数**：
- `--workspace` (必填): 工作区路径
- `--status`: 过滤状态 (backlog/evaluating/scheduled/in_progress/published/abandoned)
- `--priority`: 过滤优先级
- `--tag`: 过滤标签
- `--sort`: 排序字段 (priority/created_at/scheduled_date/ai_score)
- `--limit`: 返回数量限制，默认 50
- `--view`: 输出格式 (json/markdown/agent)

**输出**（agent view）：
```markdown
# 选题列表

共 15 个选题

| 标题 | 优先级 | 状态 | AI 评分 | 排期 |
|------|--------|------|---------|------|
| 如何用 AI 写公众号 | high | scheduled | 85 | 2026-06-15 |
| ... | ... | ... | ... | ... |
```

#### 3. `topic update` — 更新选题

```bash
zzp topic update \
  --topic {topic_id} \
  --status evaluating \
  --ai-score 85 \
  --ai-reason "基于热点趋势和受众匹配度..."
```

**参数**：
- `--topic` (必填): 选题 ID
- `--status`: 新状态
- `--priority`: 新优先级
- `--ai-score`: AI 评分 (0-100)
- `--ai-reason`: AI 评估理由
- `--tags`: 更新标签
- `--notes`: 更新备注

#### 4. `topic schedule` — 选题排期

```bash
zzp topic schedule \
  --topic {topic_id} \
  --scheduled-date 2026-06-15 \
  --target-account default
```

**参数**：
- `--topic` (必填): 选题 ID
- `--scheduled-date` (必填): 排期日期 (YYYY-MM-DD)
- `--target-account`: 目标账号

#### 5. `topic promote` — 选题转化为发布任务

```bash
zzp topic promote \
  --topic {topic_id} \
  --intent-text "写一篇关于...的文章" \
  --content-form article \
  --targets wechat
```

**参数**：
- `--topic` (必填): 选题 ID
- `--intent-text`: 发布意图描述
- `--content-form`: 内容形式 (article/newspic)
- `--targets`: 发布目标 (wechat/blog)
- `--account`: 目标账号

**行为**：
1. 创建新的发布任务（调用 init）
2. 更新选题状态为 `in_progress`
3. 关联 `run_id` 到选题

**输出**：
```json
{
  "topic_id": "topic_20260611_abc123",
  "run_id": "run_20260611_xyz789",
  "state_path": "/workspace/posts/2026-06-15-xxx/workflow-state.json",
  "message": "选题已转化为发布任务"
}
```

#### 6. `topic retro` — 选题复盘

```bash
zzp topic retro \
  --topic {topic_id} \
  --performance good \
  --lessons "标题悬念效果好..." \
  --metrics-snapshot '{"reads": 1500, "likes": 45}'
```

**参数**：
- `--topic` (必填): 选题 ID
- `--performance` (必填): 表现评级 (excellent/good/average/poor)
- `--lessons`: 经验教训
- `--metrics-snapshot`: 数据快照 (JSON 字符串)

**行为**：
1. 更新选题的复盘信息
2. 更新选题状态为 `published`

#### 7. `topic abandon` — 放弃选题

```bash
zzp topic abandon \
  --topic {topic_id} \
  --reason "话题过时"
```

**参数**：
- `--topic` (必填): 选题 ID
- `--reason`: 放弃原因

**行为**：
- 更新选题状态为 `abandoned`
- 记录放弃原因到 `notes`

---

### Analytics 命令组

#### 1. `analytics record` — 录入发布数据

```bash
zzp analytics record \
  --state {state_path} \
  --reads 1500 \
  --likes 45 \
  --favorites 23 \
  --shares 12 \
  --comments 8 \
  --notes "标题效果好，转化率高"
```

**参数**：
- `--state` (必填): 任务状态文件路径
- `--reads`: 阅读量
- `--likes`: 点赞数
- `--favorites`: 收藏数
- `--shares`: 分享数
- `--comments`: 评论数
- `--notes`: 备注

**行为**：
1. 从 state 文件读取任务信息（title、publish_date）
2. 如果任务关联了 topic_id，一并记录
3. 插入或更新 analytics 表

**输出**：
```json
{
  "run_id": "run_20260611_xyz789",
  "title": "文章标题",
  "publish_date": "2026-06-11",
  "reads": 1500,
  "likes": 45,
  "recorded_at": "2026-06-15T10:00:00.000Z"
}
```

#### 2. `analytics list` — 列出历史数据

```bash
zzp analytics list \
  --workspace {ws} \
  --days 30 \
  --sort reads \
  --limit 20 \
  --view agent
```

**参数**：
- `--workspace` (必填): 工作区路径
- `--days`: 查询最近 N 天，默认 30
- `--sort`: 排序字段 (reads/likes/publish_date)
- `--limit`: 返回数量限制，默认 50
- `--view`: 输出格式

**输出**（agent view）：
```markdown
# 发布数据分析（过去 30 天）

共 12 篇文章

| 标题 | 发布日期 | 阅读 | 点赞 | 收藏 | 分享 |
|------|----------|------|------|------|------|
| 如何用 AI 写公众号 | 2026-06-11 | 1500 | 45 | 23 | 12 |
| ... | ... | ... | ... | ... | ... |
```

#### 3. `analytics compare` — 对比分析

```bash
zzp analytics compare \
  --run-ids "run1,run2,run3" \
  --metrics reads,likes,favorites \
  --view agent
```

**参数**：
- `--run-ids` (必填): 逗号分隔的 run_id 列表
- `--metrics`: 要对比的指标，默认全部
- `--view`: 输出格式

**输出**（agent view）：
```markdown
# 数据对比

| 指标 | run1 | run2 | run3 | 平均 |
|------|------|------|------|------|
| 阅读 | 1500 | 800 | 2200 | 1500 |
| 点赞 | 45 | 20 | 65 | 43 |
| 收藏 | 23 | 10 | 35 | 23 |
```

#### 4. `analytics trend` — 趋势统计

```bash
zzp analytics trend \
  --workspace {ws} \
  --period 90d \
  --group-by week
```

**参数**：
- `--workspace` (必填): 工作区路径
- `--period`: 统计周期 (30d/60d/90d/1y)
- `--group-by`: 分组方式 (day/week/month)

**输出**（agent view）：
```markdown
# 发布趋势（过去 90 天，按周分组）

| 周 | 发布数 | 平均阅读 | 平均点赞 | 总阅读 |
|----|--------|----------|----------|--------|
| 2026-W24 | 3 | 1200 | 35 | 3600 |
| 2026-W23 | 2 | 950 | 28 | 1900 |
| ... | ... | ... | ... | ... |
```

---

## 实现路径

### Phase 1：Topic 管理（MVP）

**目标**：实现完整的选题管理功能

**任务**：
1. 创建 SQLite 数据库初始化逻辑
   - 文件：`src/db.ts`
   - 功能：创建 zzhub.db，初始化 topics 和 analytics 表

2. 实现 topic schema
   - 文件：`src/schema/topic.ts`
   - 功能：Zod schema 定义和类型

3. 实现 topic 命令
   - 文件：`src/commands/topic.ts`
   - 功能：add/list/update/schedule/promote/abandon/retro

4. 注册命令
   - 文件：`src/plugins.ts`
   - 功能：将 topic 命令组注册到 CLI

5. 编写测试
   - 文件：`src/commands/topic.test.ts`
   - 功能：单元测试

**预计工作量**：3-5 天

### Phase 2：Analytics 管理

**目标**：实现数据分析功能

**任务**：
1. 实现 analytics schema
   - 文件：`src/schema/analytics.ts`

2. 实现 analytics 命令
   - 文件：`src/commands/analytics.ts`
   - 功能：record/list/compare/trend

3. 与 topic 集成
   - 功能：analytics record 时自动关联 topic_id

4. 编写测试
   - 文件：`src/commands/analytics.test.ts`

**预计工作量**：2-3 天

### Phase 3：Hermes Skills（不在本项目范围）

**目标**：编写 Hermes Skills 来编排这些命令

**说明**：这部分工作在 Hermes 侧完成，不在 zzhub-pipeline 项目中实现。

**可能的 Skills**：
- 选题生成 Skill：基于热点生成选题建议
- 选题评估 Skill：自动评估选题潜力
- 自动排期 Skill：根据历史数据优化排期
- 数据复盘 Skill：自动分析发布效果，生成复盘报告

---

## 迁移和兼容性

### 数据库初始化

首次使用时自动创建数据库：

```typescript
// src/db.ts
import { Database } from "bun:sqlite";
import { join } from "path";

export function getDb(workspace: string): Database {
  const dbPath = join(workspace, "zzhub.db");
  const db = new Database(dbPath);
  
  // 启用 WAL 模式，提升并发性能
  db.exec("PRAGMA journal_mode = WAL;");
  
  // 初始化表结构
  db.exec(`
    CREATE TABLE IF NOT EXISTS topics (...);
    CREATE TABLE IF NOT EXISTS analytics (...);
  `);
  
  return db;
}
```

### 向后兼容

- 现有命令和行为完全不变
- 新增功能是可选的，不影响现有工作流
- 用户可以选择性使用 topic 和 analytics 功能

---

## 错误处理

### 常见错误场景

1. **选题不存在**：
   ```
   Error: Topic not found: topic_20260611_abc123
   ```

2. **状态转换无效**：
   ```
   Error: Invalid status transition: abandoned -> scheduled
   ```

3. **排期日期无效**：
   ```
   Error: Invalid date format: 2026/06/15 (expected YYYY-MM-DD)
   ```

4. **数据库锁定**：
   ```
   Error: Database is locked. Please retry.
   ```

### 错误处理策略

- 使用 Zod 验证输入
- 提供清晰的错误信息
- 数据库操作使用事务
- 重试机制（针对锁定）

---

## 测试策略

### 单元测试

- 每个命令函数都有对应的测试
- 使用临时目录隔离测试数据
- 测试正常流程和错误场景

### 集成测试

- 测试 topic promote 创建任务的完整流程
- 测试 analytics record 与 topic 的关联
- 测试复杂查询的正确性

### 测试示例

```typescript
// src/commands/topic.test.ts
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { addTopic, listTopics, updateTopic } from "./topic";

describe("topic commands", () => {
  let workspace: string;
  
  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), "zzhub-test-"));
  });
  
  afterEach(async () => {
    await rm(workspace, { recursive: true });
  });
  
  test("addTopic creates a new topic", async () => {
    const result = await addTopic(workspace, {
      title: "测试选题",
      priority: "high",
      tags: ["AI", "工具"],
    });
    
    expect(result.topic_id).toBeDefined();
    expect(result.status).toBe("backlog");
  });
  
  test("listTopics filters by status", async () => {
    await addTopic(workspace, { title: "选题1", status: "backlog" });
    await addTopic(workspace, { title: "选题2", status: "scheduled" });
    
    const topics = await listTopics(workspace, { status: "backlog" });
    expect(topics.length).toBe(1);
    expect(topics[0].title).toBe("选题1");
  });
});
```

---

## 文档和示例

### 用户文档

- 更新 README.md，添加 topic 和 analytics 命令说明
- 提供使用示例
- 说明与 Hermes 的集成方式

### 示例工作流

**示例 1：从选题到发布**

```bash
# 1. 添加选题
zzp topic add --workspace ./ws --title "AI 工具推荐" --priority high

# 2. AI 评估（由 Hermes 调用）
zzp topic update --topic topic_xxx --ai-score 85 --ai-reason "..."

# 3. 排期
zzp topic schedule --topic topic_xxx --scheduled-date 2026-06-15

# 4. 转化为发布任务
zzp topic promote --topic topic_xxx --intent-text "写一篇 AI 工具推荐文章"

# 5. 执行发布流程（使用现有命令）
zzp prepare --state /path/to/state
zzp render --state /path/to/state
zzp publish --state /path/to/state

# 6. 录入数据
zzp analytics record --state /path/to/state --reads 1500 --likes 45

# 7. 复盘
zzp topic retro --topic topic_xxx --performance good --lessons "..."
```

---

## 未来扩展

### 可能的增强功能

1. **更复杂的查询**：
   ```bash
   zzp analytics query --sql "SELECT ..."
   ```

2. **数据导出**：
   ```bash
   zzp analytics export --format csv --output data.csv
   ```

3. **批量操作**：
   ```bash
   zzp topic import --file topics.csv
   ```

4. **统计报表**：
   ```bash
   zzp stats --period 90d --output report.md
   ```

### 迁移到 SQLite 主流程（可选）

如果未来任务数量超过 100+，且用户需要跨任务查询，可以考虑：
- 提供 `migrate-to-sqlite` 命令
- 将 workflow-state.json 迁移到 tasks 表
- 保持兼容层，允许继续使用 JSON

---

## 总结

本设计通过扩展 topic 和 analytics 命令组，将 zzhub-pipeline 从发布工具升级为完整的内容生命周期管理系统。使用 SQLite 作为新数据的存储后端，既保证了查询性能，又保持了与现有架构的兼容性。

核心原则：
1. **保持简单**：不过度设计，满足当前需求
2. **向后兼容**：不破坏现有功能
3. **职责分离**：CLI 负责业务，Hermes 负责智能
4. **可扩展**：未来可以平滑升级

---

## 附录

### 相关资源

- [Bun SQLite 文档](https://bun.sh/docs/api/sqlite)
- [Hermes Agent](https://hermes-agent.nousresearch.com/)
- [Zod Schema 验证](https://zod.dev/)

### 变更历史

- 2026-06-11: 初始版本（v1.0）
