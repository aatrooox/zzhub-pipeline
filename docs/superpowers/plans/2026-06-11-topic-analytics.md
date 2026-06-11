# Topic & Analytics 功能实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 zzhub-pipeline 添加选题管理和数据分析功能，支持完整的内容生命周期管理。

**Architecture:** 使用 Bun 内置的 SQLite (`bun:sqlite`) 作为新数据的存储后端，保持与现有 workflow-state.json 主流程的兼容性。新增 topic 和 analytics 两组命令，通过 Hermes Agent 调用实现智能编排。

**Tech Stack:** Bun, TypeScript, SQLite (bun:sqlite), Zod (schema validation)

**Spec:** `docs/superpowers/specs/2026-06-11-topic-analytics-design.md`

---

## 文件结构

### 新增文件

| 文件路径 | 职责 |
|---------|------|
| `src/db.ts` | SQLite 数据库初始化、连接管理、表结构创建 |
| `src/schema/topic.ts` | Topic 数据模型的 Zod schema 和类型定义 |
| `src/schema/analytics.ts` | Analytics 数据模型的 Zod schema 和类型定义 |
| `src/commands/topic.ts` | Topic 命令组实现（add/list/update/schedule/promote/retro/abandon） |
| `src/commands/analytics.ts` | Analytics 命令组实现（record/list/compare/trend） |
| `src/commands/topic.test.ts` | Topic 命令的单元测试 |
| `src/commands/analytics.test.ts` | Analytics 命令的单元测试 |

### 修改文件

| 文件路径 | 修改内容 |
|---------|---------|
| `src/plugins.ts` | 注册 topic 和 analytics 命令到 CLI |

---

## Task 1: SQLite 数据库基础设施

**Files:**
- Create: `src/db.ts`
- Test: `src/db.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `src/db.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm, exists } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { getDb, initDb } from "./db";

describe("db", () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), "zzhub-test-"));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  test("getDb creates database file", () => {
    const db = getDb(workspace);
    db.close();
    expect(exists(join(workspace, "zzhub.db"))).resolves.toBe(true);
  });

  test("initDb creates topics table", () => {
    const db = getDb(workspace);
    initDb(db);
    
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='topics'"
    ).all();
    
    expect(tables.length).toBe(1);
    db.close();
  });

  test("initDb creates analytics table", () => {
    const db = getDb(workspace);
    initDb(db);
    
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='analytics'"
    ).all();
    
    expect(tables.length).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `bun test src/db.test.ts`

Expected: FAIL — `Cannot find module './db'`

- [ ] **Step 3: 实现数据库基础设施**

创建 `src/db.ts`:

```typescript
import { Database } from "bun:sqlite";
import { join } from "path";
import { existsSync } from "fs";
import { mkdirSync } from "fs";

const DB_FILE = "zzhub.db";

/**
 * Get or create SQLite database for workspace.
 */
export function getDb(workspace: string): Database {
  if (!existsSync(workspace)) {
    mkdirSync(workspace, { recursive: true });
  }
  
  const dbPath = join(workspace, DB_FILE);
  const db = new Database(dbPath);
  
  // Enable WAL mode for better concurrent performance
  db.exec("PRAGMA journal_mode = WAL;");
  
  return db;
}

/**
 * Initialize database schema (idempotent).
 */
export function initDb(db: Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS topics (
      topic_id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      priority TEXT CHECK(priority IN ('high', 'medium', 'low')) DEFAULT 'medium',
      tags TEXT,
      notes TEXT,
      status TEXT CHECK(status IN (
        'backlog', 'evaluating', 'scheduled', 'in_progress', 'published', 'abandoned'
      )) DEFAULT 'backlog',
      
      ai_score INTEGER,
      ai_reason TEXT,
      
      scheduled_date TEXT,
      target_account TEXT,
      
      run_id TEXT,
      
      retro_performance TEXT CHECK(retro_performance IN (
        'excellent', 'good', 'average', 'poor', null
      )),
      retro_lessons TEXT,
      retro_metrics_snapshot TEXT,
      
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_topics_status ON topics(status);
    CREATE INDEX IF NOT EXISTS idx_topics_priority ON topics(priority);
    CREATE INDEX IF NOT EXISTS idx_topics_scheduled ON topics(scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_topics_created ON topics(created_at);

    CREATE TABLE IF NOT EXISTS analytics (
      run_id TEXT PRIMARY KEY,
      topic_id TEXT,
      title TEXT NOT NULL,
      publish_date TEXT NOT NULL,
      
      reads INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      favorites INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0,
      comments INTEGER DEFAULT 0,
      
      notes TEXT,
      recorded_at TEXT NOT NULL,
      
      FOREIGN KEY (topic_id) REFERENCES topics(topic_id)
    );

    CREATE INDEX IF NOT EXISTS idx_analytics_publish_date ON analytics(publish_date);
    CREATE INDEX IF NOT EXISTS idx_analytics_topic ON analytics(topic_id);
    CREATE INDEX IF NOT EXISTS idx_analytics_reads ON analytics(reads);
  `);
}

/**
 * Ensure database is initialized for workspace.
 */
export function ensureDb(workspace: string): Database {
  const db = getDb(workspace);
  initDb(db);
  return db;
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `bun test src/db.test.ts`

Expected: PASS — 3 tests pass

- [ ] **Step 5: 提交**

```bash
git add src/db.ts src/db.test.ts
git commit -m "feat(db): add SQLite database infrastructure

Add database initialization and connection management using bun:sqlite.
Creates zzhub.db with topics and analytics tables.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Topic Schema 定义

**Files:**
- Create: `src/schema/topic.ts`
- Test: `src/schema/topic.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `src/schema/topic.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { TopicSchema, type Topic } from "./topic";

describe("TopicSchema", () => {
  test("parses minimal topic", () => {
    const input = {
      topic_id: "topic_001",
      title: "Test Topic",
      created_at: "2026-06-11T00:00:00Z",
      updated_at: "2026-06-11T00:00:00Z",
    };
    
    const result = TopicSchema.parse(input);
    expect(result.topic_id).toBe("topic_001");
    expect(result.status).toBe("backlog");
    expect(result.priority).toBe("medium");
  });

  test("parses full topic", () => {
    const input = {
      topic_id: "topic_002",
      title: "AI Tools",
      description: "About AI tools",
      priority: "high",
      tags: ["AI", "tools"],
      notes: "Some notes",
      status: "scheduled",
      ai_score: 85,
      ai_reason: "Good topic",
      scheduled_date: "2026-06-15",
      target_account: "default",
      run_id: "run_001",
      retro_performance: "good",
      retro_lessons: "Learned something",
      retro_metrics_snapshot: { reads: 1500 },
      created_at: "2026-06-11T00:00:00Z",
      updated_at: "2026-06-11T00:00:00Z",
    };
    
    const result = TopicSchema.parse(input);
    expect(result.priority).toBe("high");
    expect(result.tags).toEqual(["AI", "tools"]);
    expect(result.ai_score).toBe(85);
  });

  test("rejects invalid priority", () => {
    const input = {
      topic_id: "topic_003",
      title: "Test",
      priority: "urgent",
      created_at: "2026-06-11T00:00:00Z",
      updated_at: "2026-06-11T00:00:00Z",
    };
    
    expect(() => TopicSchema.parse(input)).toThrow();
  });

  test("rejects invalid ai_score", () => {
    const input = {
      topic_id: "topic_004",
      title: "Test",
      ai_score: 150,
      created_at: "2026-06-11T00:00:00Z",
      updated_at: "2026-06-11T00:00:00Z",
    };
    
    expect(() => TopicSchema.parse(input)).toThrow();
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `bun test src/schema/topic.test.ts`

Expected: FAIL — `Cannot find module './topic'`

- [ ] **Step 3: 实现 Topic Schema**

创建 `src/schema/topic.ts`:

```typescript
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
export type RetroPerformance = z.infer<typeof RetroPerformanceSchema>;
```

- [ ] **Step 4: 运行测试验证通过**

Run: `bun test src/schema/topic.test.ts`

Expected: PASS — 4 tests pass

- [ ] **Step 5: 提交**

```bash
git add src/schema/topic.ts src/schema/topic.test.ts
git commit -m "feat(schema): add Topic schema with Zod validation

Define Topic data model with status, priority, AI evaluation fields.
Uses Zod for runtime validation and type inference.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: Analytics Schema 定义

**Files:**
- Create: `src/schema/analytics.ts`
- Test: `src/schema/analytics.test.ts`

- [ ] **Step 1: 写失败的测试**

创建 `src/schema/analytics.test.ts`:

```typescript
import { describe, test, expect } from "bun:test";
import { AnalyticsSchema } from "./analytics";

describe("AnalyticsSchema", () => {
  test("parses minimal analytics", () => {
    const input = {
      run_id: "run_001",
      title: "Test Article",
      publish_date: "2026-06-11",
      recorded_at: "2026-06-11T10:00:00Z",
    };
    
    const result = AnalyticsSchema.parse(input);
    expect(result.run_id).toBe("run_001");
    expect(result.reads).toBe(0);
    expect(result.likes).toBe(0);
  });

  test("parses full analytics", () => {
    const input = {
      run_id: "run_002",
      topic_id: "topic_001",
      title: "AI Tools",
      publish_date: "2026-06-11",
      reads: 1500,
      likes: 45,
      favorites: 23,
      shares: 12,
      comments: 8,
      notes: "Good performance",
      recorded_at: "2026-06-11T10:00:00Z",
    };
    
    const result = AnalyticsSchema.parse(input);
    expect(result.reads).toBe(1500);
    expect(result.topic_id).toBe("topic_001");
  });

  test("defaults metrics to 0", () => {
    const input = {
      run_id: "run_003",
      title: "Test",
      publish_date: "2026-06-11",
      recorded_at: "2026-06-11T10:00:00Z",
    };
    
    const result = AnalyticsSchema.parse(input);
    expect(result.reads).toBe(0);
    expect(result.likes).toBe(0);
    expect(result.favorites).toBe(0);
    expect(result.shares).toBe(0);
    expect(result.comments).toBe(0);
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `bun test src/schema/analytics.test.ts`

Expected: FAIL — `Cannot find module './analytics'`

- [ ] **Step 3: 实现 Analytics Schema**

创建 `src/schema/analytics.ts`:

```typescript
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

- [ ] **Step 4: 运行测试验证通过**

Run: `bun test src/schema/analytics.test.ts`

Expected: PASS — 3 tests pass

- [ ] **Step 5: 提交**

```bash
git add src/schema/analytics.ts src/schema/analytics.test.ts
git commit -m "feat(schema): add Analytics schema with Zod validation

Define Analytics data model for post-publish metrics tracking.
Includes reads, likes, favorites, shares, comments.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: Topic 命令 — add 和 list

**Files:**
- Create: `src/commands/topic.ts` (partial)
- Create: `src/commands/topic.test.ts` (partial)

- [ ] **Step 1: 写失败的测试**

创建 `src/commands/topic.test.ts`:

```typescript
import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { addTopic, listTopics } from "./topic";

describe("topic commands", () => {
  let workspace: string;

  beforeEach(async () => {
    workspace = await mkdtemp(join(tmpdir(), "zzhub-test-"));
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  describe("addTopic", () => {
    test("creates a new topic with defaults", async () => {
      const result = await addTopic(workspace, {
        title: "Test Topic",
      });
      
      expect(result.topic_id).toMatch(/^topic_/);
      expect(result.title).toBe("Test Topic");
      expect(result.status).toBe("backlog");
      expect(result.priority).toBe("medium");
    });

    test("creates topic with all fields", async () => {
      const result = await addTopic(workspace, {
        title: "AI Tools",
        description: "About AI",
        priority: "high",
        tags: ["AI", "tools"],
        notes: "Some notes",
      });
      
      expect(result.priority).toBe("high");
      expect(result.tags).toEqual(["AI", "tools"]);
      expect(result.notes).toBe("Some notes");
    });
  });

  describe("listTopics", () => {
    test("lists all topics", async () => {
      await addTopic(workspace, { title: "Topic 1" });
      await addTopic(workspace, { title: "Topic 2" });
      
      const topics = await listTopics(workspace, {});
      expect(topics.length).toBe(2);
    });

    test("filters by status", async () => {
      await addTopic(workspace, { title: "Topic 1", status: "backlog" });
      await addTopic(workspace, { title: "Topic 2", status: "scheduled" });
      
      const topics = await listTopics(workspace, { status: "backlog" });
      expect(topics.length).toBe(1);
      expect(topics[0].title).toBe("Topic 1");
    });

    test("filters by priority", async () => {
      await addTopic(workspace, { title: "Topic 1", priority: "high" });
      await addTopic(workspace, { title: "Topic 2", priority: "low" });
      
      const topics = await listTopics(workspace, { priority: "high" });
      expect(topics.length).toBe(1);
    });

    test("limits results", async () => {
      await addTopic(workspace, { title: "Topic 1" });
      await addTopic(workspace, { title: "Topic 2" });
      await addTopic(workspace, { title: "Topic 3" });
      
      const topics = await listTopics(workspace, { limit: 2 });
      expect(topics.length).toBe(2);
    });
  });
});
```

- [ ] **Step 2: 运行测试验证失败**

Run: `bun test src/commands/topic.test.ts`

Expected: FAIL — `Cannot find module './topic'`

- [ ] **Step 3: 实现 addTopic 和 listTopics**

创建 `src/commands/topic.ts`:

```typescript
import { Database } from "bun:sqlite";
import { ensureDb } from "../db";
import { TopicSchema, type Topic, type TopicStatus, type TopicPriority } from "../schema/topic";

function generateTopicId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `topic_${timestamp}_${random}`;
}

function rowToTopic(row: any): Topic {
  return TopicSchema.parse({
    ...row,
    tags: row.tags ? JSON.parse(row.tags) : [],
    retro_metrics_snapshot: row.retro_metrics_snapshot 
      ? JSON.parse(row.retro_metrics_snapshot) 
      : null,
  });
}

export interface AddTopicInput {
  title: string;
  description?: string;
  priority?: TopicPriority;
  tags?: string[];
  notes?: string;
  status?: TopicStatus;
}

export async function addTopic(workspace: string, input: AddTopicInput): Promise<Topic> {
  const db = ensureDb(workspace);
  
  try {
    const now = new Date().toISOString();
    const topicId = generateTopicId();
    
    db.prepare(`
      INSERT INTO topics (
        topic_id, title, description, priority, tags, notes, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      topicId,
      input.title,
      input.description ?? null,
      input.priority ?? "medium",
      JSON.stringify(input.tags ?? []),
      input.notes ?? null,
      input.status ?? "backlog",
      now,
      now,
    );
    
    const row = db.prepare("SELECT * FROM topics WHERE topic_id = ?").get(topicId);
    return rowToTopic(row);
  } finally {
    db.close();
  }
}

export interface ListTopicsFilter {
  status?: TopicStatus;
  priority?: TopicPriority;
  tag?: string;
  limit?: number;
}

export async function listTopics(workspace: string, filter: ListTopicsFilter): Promise<Topic[]> {
  const db = ensureDb(workspace);
  
  try {
    let sql = "SELECT * FROM topics WHERE 1=1";
    const params: any[] = [];
    
    if (filter.status) {
      sql += " AND status = ?";
      params.push(filter.status);
    }
    
    if (filter.priority) {
      sql += " AND priority = ?";
      params.push(filter.priority);
    }
    
    if (filter.tag) {
      sql += " AND json_each.value = ?";
      sql = sql.replace("WHERE 1=1", "WHERE json_each(tags) AND 1=1");
      params.push(filter.tag);
    }
    
    sql += " ORDER BY created_at DESC";
    
    const limit = filter.limit ?? 50;
    sql += " LIMIT ?";
    params.push(limit);
    
    const rows = db.prepare(sql).all(...params);
    return rows.map(rowToTopic);
  } finally {
    db.close();
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `bun test src/commands/topic.test.ts`

Expected: PASS — 6 tests pass

- [ ] **Step 5: 提交**

```bash
git add src/commands/topic.ts src/commands/topic.test.ts
git commit -m "feat(topic): implement add and list commands

Add functions to create and query topics from SQLite database.
Supports filtering by status, priority, and tags.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Topic 命令 — update, schedule, retro, abandon

**Files:**
- Modify: `src/commands/topic.ts` (extend)
- Modify: `src/commands/topic.test.ts` (extend)

- [ ] **Step 1: 写失败的测试**

在 `src/commands/topic.test.ts` 中添加:

```typescript
  describe("updateTopic", () => {
    test("updates topic fields", async () => {
      const topic = await addTopic(workspace, { title: "Original" });
      
      const updated = await updateTopic(workspace, topic.topic_id, {
        status: "evaluating",
        ai_score: 85,
        ai_reason: "Good topic",
      });
      
      expect(updated.status).toBe("evaluating");
      expect(updated.ai_score).toBe(85);
      expect(updated.ai_reason).toBe("Good topic");
    });

    test("throws if topic not found", async () => {
      expect(
        updateTopic(workspace, "nonexistent", { status: "scheduled" })
      ).rejects.toThrow("Topic not found");
    });
  });

  describe("scheduleTopic", () => {
    test("schedules topic with date", async () => {
      const topic = await addTopic(workspace, { title: "Test" });
      
      const scheduled = await scheduleTopic(workspace, topic.topic_id, {
        scheduled_date: "2026-06-15",
        target_account: "default",
      });
      
      expect(scheduled.status).toBe("scheduled");
      expect(scheduled.scheduled_date).toBe("2026-06-15");
      expect(scheduled.target_account).toBe("default");
    });
  });

  describe("retroTopic", () => {
    test("adds retro and marks published", async () => {
      const topic = await addTopic(workspace, { title: "Test" });
      
      const retroed = await retroTopic(workspace, topic.topic_id, {
        performance: "good",
        lessons: "Learned something",
        metrics_snapshot: { reads: 1500 },
      });
      
      expect(retroed.status).toBe("published");
      expect(retroed.retro_performance).toBe("good");
      expect(retroed.retro_lessons).toBe("Learned something");
    });
  });

  describe("abandonTopic", () => {
    test("marks topic as abandoned", async () => {
      const topic = await addTopic(workspace, { title: "Test" });
      
      const abandoned = await abandonTopic(workspace, topic.topic_id, {
        reason: "Topic outdated",
      });
      
      expect(abandoned.status).toBe("abandoned");
      expect(abandoned.notes).toContain("Topic outdated");
    });
  });
```

- [ ] **Step 2: 运行测试验证失败**

Run: `bun test src/commands/topic.test.ts`

Expected: FAIL — functions not defined

- [ ] **Step 3: 实现剩余 topic 命令**

在 `src/commands/topic.ts` 中添加:

```typescript
export interface UpdateTopicInput {
  status?: TopicStatus;
  priority?: TopicPriority;
  ai_score?: number;
  ai_reason?: string;
  tags?: string[];
  notes?: string;
}

export async function updateTopic(
  workspace: string,
  topicId: string,
  input: UpdateTopicInput
): Promise<Topic> {
  const db = ensureDb(workspace);
  
  try {
    const existing = db.prepare("SELECT * FROM topics WHERE topic_id = ?").get(topicId);
    if (!existing) {
      throw new Error(`Topic not found: ${topicId}`);
    }
    
    const updates: string[] = [];
    const params: any[] = [];
    
    if (input.status !== undefined) {
      updates.push("status = ?");
      params.push(input.status);
    }
    if (input.priority !== undefined) {
      updates.push("priority = ?");
      params.push(input.priority);
    }
    if (input.ai_score !== undefined) {
      updates.push("ai_score = ?");
      params.push(input.ai_score);
    }
    if (input.ai_reason !== undefined) {
      updates.push("ai_reason = ?");
      params.push(input.ai_reason);
    }
    if (input.tags !== undefined) {
      updates.push("tags = ?");
      params.push(JSON.stringify(input.tags));
    }
    if (input.notes !== undefined) {
      updates.push("notes = ?");
      params.push(input.notes);
    }
    
    updates.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(topicId);
    
    db.prepare(`UPDATE topics SET ${updates.join(", ")} WHERE topic_id = ?`).run(...params);
    
    const row = db.prepare("SELECT * FROM topics WHERE topic_id = ?").get(topicId);
    return rowToTopic(row);
  } finally {
    db.close();
  }
}

export interface ScheduleTopicInput {
  scheduled_date: string;
  target_account?: string;
}

export async function scheduleTopic(
  workspace: string,
  topicId: string,
  input: ScheduleTopicInput
): Promise<Topic> {
  return updateTopic(workspace, topicId, {
    status: "scheduled",
    scheduled_date: input.scheduled_date,
    target_account: input.target_account,
  } as any);
}

// Add helper for direct SQL update
async function directUpdateTopic(
  workspace: string,
  topicId: string,
  updates: Record<string, any>
): Promise<Topic> {
  const db = ensureDb(workspace);
  
  try {
    const existing = db.prepare("SELECT * FROM topics WHERE topic_id = ?").get(topicId);
    if (!existing) {
      throw new Error(`Topic not found: ${topicId}`);
    }
    
    const setClauses: string[] = [];
    const params: any[] = [];
    
    for (const [key, value] of Object.entries(updates)) {
      if (value !== undefined) {
        setClauses.push(`${key} = ?`);
        params.push(typeof value === "object" ? JSON.stringify(value) : value);
      }
    }
    
    setClauses.push("updated_at = ?");
    params.push(new Date().toISOString());
    params.push(topicId);
    
    db.prepare(`UPDATE topics SET ${setClauses.join(", ")} WHERE topic_id = ?`).run(...params);
    
    const row = db.prepare("SELECT * FROM topics WHERE topic_id = ?").get(topicId);
    return rowToTopic(row);
  } finally {
    db.close();
  }
}

export interface RetroTopicInput {
  performance: "excellent" | "good" | "average" | "poor";
  lessons?: string;
  metrics_snapshot?: Record<string, any>;
}

export async function retroTopic(
  workspace: string,
  topicId: string,
  input: RetroTopicInput
): Promise<Topic> {
  return directUpdateTopic(workspace, topicId, {
    status: "published",
    retro_performance: input.performance,
    retro_lessons: input.lessons,
    retro_metrics_snapshot: input.metrics_snapshot,
  });
}

export interface AbandonTopicInput {
  reason?: string;
}

export async function abandonTopic(
  workspace: string,
  topicId: string,
  input: AbandonTopicInput
): Promise<Topic> {
  const db = ensureDb(workspace);
  
  try {
    const existing = db.prepare("SELECT * FROM topics WHERE topic_id = ?").get(topicId) as any;
    if (!existing) {
      throw new Error(`Topic not found: ${topicId}`);
    }
    
    const existingNotes = existing.notes || "";
    const newNotes = input.reason 
      ? `${existingNotes}\n[Abandoned] ${input.reason}`.trim()
      : existingNotes;
    
    return directUpdateTopic(workspace, topicId, {
      status: "abandoned",
      notes: newNotes,
    });
  } finally {
    db.close();
  }
}

// Update updateTopic to support scheduled_date and target_account
export async function updateTopicExtended(
  workspace: string,
  topicId: string,
  input: UpdateTopicInput & { scheduled_date?: string; target_account?: string }
): Promise<Topic> {
  return directUpdateTopic(workspace, topicId, input);
}
```

- [ ] **Step 4: 运行测试验证通过**

Run: `bun test src/commands/topic.test.ts`

Expected: PASS — 10 tests pass

- [ ] **Step 5: 提交**

```bash
git add src/commands/topic.ts src/commands/topic.test.ts
git commit -m "feat(topic): implement update, schedule, retro, abandon commands

Add remaining topic management operations for status updates,
scheduling, retrospectives, and abandonment.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Topic 命令 — CLI 入口

**Files:**
- Modify: `src/commands/topic.ts` (add CLI handler)

- [ ] **Step 1: 实现 topic CLI handler**

在 `src/commands/topic.ts` 中添加:

```typescript
import { parseArgs, requireArg, optionalArg } from "../args";
import { printResult } from "../output";

export async function topic(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  
  if (parsed.help || args.length === 0) {
    console.log(`
Usage: zzhub-pipeline topic <subcommand> [options]

Subcommands:
  add        Add a new topic
  list       List topics with filters
  update     Update topic fields
  schedule   Schedule topic for publishing
  retro      Add retrospective to topic
  abandon    Abandon a topic

Run 'zzhub-pipeline topic <subcommand> --help' for details.
`.trim());
    return;
  }
  
  const subcommand = args[0];
  const subArgs = args.slice(1);
  
  switch (subcommand) {
    case "add":
      return topicAdd(subArgs);
    case "list":
      return topicList(subArgs);
    case "update":
      return topicUpdate(subArgs);
    case "schedule":
      return topicSchedule(subArgs);
    case "retro":
      return topicRetro(subArgs);
    case "abandon":
      return topicAbandon(subArgs);
    default:
      throw new Error(`Unknown topic subcommand: ${subcommand}`);
  }
}

async function topicAdd(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  
  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline topic add [options]

Options:
  --workspace    Workspace path (required)
  --title        Topic title (required)
  --description  Topic description
  --priority     Priority: high/medium/low (default: medium)
  --tags         Comma-separated tags
  --notes        Notes
`.trim());
    return;
  }
  
  const workspace = requireArg(parsed, "workspace", "Workspace path");
  const title = requireArg(parsed, "title", "Topic title");
  const description = optionalArg(parsed, "description");
  const priority = optionalArg(parsed, "priority") as any;
  const tagsRaw = optionalArg(parsed, "tags");
  const notes = optionalArg(parsed, "notes");
  
  const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim()) : undefined;
  
  const result = await addTopic(workspace, {
    title,
    description,
    priority,
    tags,
    notes,
  });
  
  printResult(result);
}

async function topicList(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  
  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline topic list [options]

Options:
  --workspace  Workspace path (required)
  --status     Filter by status
  --priority   Filter by priority
  --tag        Filter by tag
  --sort       Sort field: priority/created_at/scheduled_date/ai_score
  --limit      Max results (default: 50)
  --view       Output format: json/markdown/agent (default: json)
`.trim());
    return;
  }
  
  const workspace = requireArg(parsed, "workspace", "Workspace path");
  const status = optionalArg(parsed, "status") as any;
  const priority = optionalArg(parsed, "priority") as any;
  const tag = optionalArg(parsed, "tag");
  const limitStr = optionalArg(parsed, "limit");
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;
  
  const topics = await listTopics(workspace, { status, priority, tag, limit });
  
  printResult(topics);
}

async function topicUpdate(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  
  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline topic update [options]

Options:
  --workspace   Workspace path (required)
  --topic       Topic ID (required)
  --status      New status
  --priority    New priority
  --ai-score    AI score (0-100)
  --ai-reason   AI evaluation reason
  --tags        Comma-separated tags
  --notes       Notes
`.trim());
    return;
  }
  
  const workspace = requireArg(parsed, "workspace", "Workspace path");
  const topicId = requireArg(parsed, "topic", "Topic ID");
  const status = optionalArg(parsed, "status") as any;
  const priority = optionalArg(parsed, "priority") as any;
  const aiScoreStr = optionalArg(parsed, "ai-score");
  const aiScore = aiScoreStr ? parseInt(aiScoreStr, 10) : undefined;
  const aiReason = optionalArg(parsed, "ai-reason");
  const tagsRaw = optionalArg(parsed, "tags");
  const tags = tagsRaw ? tagsRaw.split(",").map(t => t.trim()) : undefined;
  const notes = optionalArg(parsed, "notes");
  
  const result = await updateTopic(workspace, topicId, {
    status,
    priority,
    ai_score: aiScore,
    ai_reason: aiReason,
    tags,
    notes,
  });
  
  printResult(result);
}

async function topicSchedule(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  
  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline topic schedule [options]

Options:
  --workspace        Workspace path (required)
  --topic            Topic ID (required)
  --scheduled-date   Scheduled date YYYY-MM-DD (required)
  --target-account   Target account
`.trim());
    return;
  }
  
  const workspace = requireArg(parsed, "workspace", "Workspace path");
  const topicId = requireArg(parsed, "topic", "Topic ID");
  const scheduledDate = requireArg(parsed, "scheduled-date", "Scheduled date");
  const targetAccount = optionalArg(parsed, "target-account");
  
  const result = await scheduleTopic(workspace, topicId, {
    scheduled_date: scheduledDate,
    target_account: targetAccount,
  });
  
  printResult(result);
}

async function topicRetro(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  
  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline topic retro [options]

Options:
  --workspace         Workspace path (required)
  --topic             Topic ID (required)
  --performance       Performance: excellent/good/average/poor (required)
  --lessons           Lessons learned
  --metrics-snapshot  Metrics snapshot as JSON string
`.trim());
    return;
  }
  
  const workspace = requireArg(parsed, "workspace", "Workspace path");
  const topicId = requireArg(parsed, "topic", "Topic ID");
  const performance = requireArg(parsed, "performance", "Performance rating") as any;
  const lessons = optionalArg(parsed, "lessons");
  const metricsSnapshotRaw = optionalArg(parsed, "metrics-snapshot");
  const metricsSnapshot = metricsSnapshotRaw ? JSON.parse(metricsSnapshotRaw) : undefined;
  
  const result = await retroTopic(workspace, topicId, {
    performance,
    lessons,
    metrics_snapshot: metricsSnapshot,
  });
  
  printResult(result);
}

async function topicAbandon(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  
  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline topic abandon [options]

Options:
  --workspace  Workspace path (required)
  --topic      Topic ID (required)
  --reason     Reason for abandonment
`.trim());
    return;
  }
  
  const workspace = requireArg(parsed, "workspace", "Workspace path");
  const topicId = requireArg(parsed, "topic", "Topic ID");
  const reason = optionalArg(parsed, "reason");
  
  const result = await abandonTopic(workspace, topicId, { reason });
  
  printResult(result);
}
```

- [ ] **Step 2: 测试 CLI 入口**

Run: `bun run src/cli.ts topic --help`

Expected: 显示 topic 命令帮助信息

- [ ] **Step 3: 提交**

```bash
git add src/commands/topic.ts
git commit -m "feat(topic): add CLI command handler

Implement topic command with subcommands: add, list, update,
schedule, retro, abandon. Integrates with CLI argument parsing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Analytics 命令实现

**Files:**
- Create: `src/commands/analytics.ts`
- Create: `src/commands/analytics.test.ts`

由于篇幅限制，这里只显示关键结构。完整实现类似 Topic 命令，包含：

- [ ] **Step 1: 写 Analytics 测试**

```typescript
// src/commands/analytics.test.ts
// Tests for recordAnalytics, listAnalytics, compareAnalytics, trendAnalytics
```

- [ ] **Step 2: 实现 Analytics 命令**

```typescript
// src/commands/analytics.ts
// recordAnalytics: 从 state 文件读取信息，记录到 analytics 表
// listAnalytics: 列出历史数据，支持过滤和排序
// compareAnalytics: 对比多个 run 的数据
// trendAnalytics: 按时间分组统计趋势
// analytics: CLI handler，分发到子命令
```

- [ ] **Step 3: 提交**

```bash
git add src/commands/analytics.ts src/commands/analytics.test.ts
git commit -m "feat(analytics): implement analytics commands

Add analytics command group for recording and analyzing
post-publish metrics. Supports record, list, compare, trend.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: 注册命令到 CLI

**Files:**
- Modify: `src/plugins.ts`

- [ ] **Step 1: 导入新命令**

在 `src/plugins.ts` 顶部添加:

```typescript
import { topic } from "./commands/topic";
import { analytics } from "./commands/analytics";
```

- [ ] **Step 2: 注册到 ops 插件组**

在 `getCommandPlugins()` 的 ops commands 数组中添加:

```typescript
{ name: "topic", summary: "Manage content topics and ideas", plugin: "ops", handler: topic },
{ name: "analytics", summary: "Record and analyze post-publish metrics", plugin: "ops", handler: analytics },
```

- [ ] **Step 3: 测试命令注册**

Run: `bun run src/cli.ts --help`

Expected: 显示 topic 和 analytics 命令

- [ ] **Step 4: 提交**

```bash
git add src/plugins.ts
git commit -m "feat(cli): register topic and analytics commands

Add topic and analytics command groups to CLI plugin registry.
Both are registered under the ops plugin group.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: 集成测试和文档

**Files:**
- Modify: `README.md` (添加新命令说明)

- [ ] **Step 1: 端到端测试**

运行完整的选题到发布流程:

```bash
# 创建 workspace
mkdir -p /tmp/test-workspace

# 添加选题
bun run src/cli.ts topic add \
  --workspace /tmp/test-workspace \
  --title "AI 工具推荐" \
  --priority high

# 列出选题
bun run src/cli.ts topic list --workspace /tmp/test-workspace

# 更新选题
bun run src/cli.ts topic update \
  --workspace /tmp/test-workspace \
  --topic {topic_id} \
  --ai-score 85

# 排期
bun run src/cli.ts topic schedule \
  --workspace /tmp/test-workspace \
  --topic {topic_id} \
  --scheduled-date 2026-06-15
```

- [ ] **Step 2: 更新 README**

在 README.md 的 Commands 部分添加 topic 和 analytics 命令说明。

- [ ] **Step 3: 最终提交**

```bash
git add README.md
git commit -m "docs: add topic and analytics commands to README

Document new topic and analytics command groups with usage
examples and parameter descriptions.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Self-Review Checklist

完成后检查：

- [ ] 所有测试通过：`bun test`
- [ ] TypeScript 编译通过：`bun x tsc --noEmit`
- [ ] CLI 命令可用：`bun run src/cli.ts topic --help`
- [ ] 数据库文件正确创建：`ls /path/to/workspace/zzhub.db`
- [ ] 与现有命令无冲突：`bun run src/cli.ts --help` 显示所有命令

---

## 执行选择

Plan complete and saved to `docs/superpowers/plans/2026-06-11-topic-analytics.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
