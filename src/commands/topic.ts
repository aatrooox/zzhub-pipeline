import { ensureDb } from "../db";
import {
  TopicSchema,
  type Topic,
  type TopicStatus,
  type TopicPriority,
} from "../schema/topic";
import { parseArgs, requireArg, optionalArg } from "../args";
import { printResult } from "../output";

function generateTopicId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `topic_${timestamp}_${random}`;
}

function rowToTopic(row: Record<string, unknown>): Topic {
  return TopicSchema.parse({
    ...row,
    tags: row.tags ? JSON.parse(row.tags as string) : [],
    retro_metrics_snapshot: row.retro_metrics_snapshot
      ? JSON.parse(row.retro_metrics_snapshot as string)
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

export async function addTopic(
  workspace: string,
  input: AddTopicInput,
): Promise<Topic> {
  const db = ensureDb(workspace);

  try {
    const now = new Date().toISOString();
    const topicId = generateTopicId();

    db.prepare(
      `INSERT INTO topics (
        topic_id, title, description, priority, tags, notes, status,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
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

    const row = db
      .prepare("SELECT * FROM topics WHERE topic_id = ?")
      .get(topicId) as Record<string, unknown>;
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
  input: UpdateTopicInput,
): Promise<Topic> {
  const db = ensureDb(workspace);

  try {
    const existing = db
      .prepare("SELECT * FROM topics WHERE topic_id = ?")
      .get(topicId);
    if (!existing) {
      throw new Error(`Topic not found: ${topicId}`);
    }

    const updates: string[] = [];
    const params: (string | number | null)[] = [];

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

    db
      .prepare(`UPDATE topics SET ${updates.join(", ")} WHERE topic_id = ?`)
      .run(...params);

    const row = db
      .prepare("SELECT * FROM topics WHERE topic_id = ?")
      .get(topicId) as Record<string, unknown>;
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
  input: ScheduleTopicInput,
): Promise<Topic> {
  const db = ensureDb(workspace);

  try {
    const existing = db
      .prepare("SELECT * FROM topics WHERE topic_id = ?")
      .get(topicId);
    if (!existing) {
      throw new Error(`Topic not found: ${topicId}`);
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE topics
       SET status = 'scheduled',
           scheduled_date = ?,
           target_account = ?,
           updated_at = ?
       WHERE topic_id = ?`,
    ).run(input.scheduled_date, input.target_account ?? null, now, topicId);

    const row = db
      .prepare("SELECT * FROM topics WHERE topic_id = ?")
      .get(topicId) as Record<string, unknown>;
    return rowToTopic(row);
  } finally {
    db.close();
  }
}

export interface RetroTopicInput {
  performance: "excellent" | "good" | "average" | "poor";
  lessons?: string;
  metrics_snapshot?: Record<string, unknown>;
}

export async function retroTopic(
  workspace: string,
  topicId: string,
  input: RetroTopicInput,
): Promise<Topic> {
  const db = ensureDb(workspace);

  try {
    const existing = db
      .prepare("SELECT * FROM topics WHERE topic_id = ?")
      .get(topicId);
    if (!existing) {
      throw new Error(`Topic not found: ${topicId}`);
    }

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE topics
       SET status = 'published',
           retro_performance = ?,
           retro_lessons = ?,
           retro_metrics_snapshot = ?,
           updated_at = ?
       WHERE topic_id = ?`,
    ).run(
      input.performance,
      input.lessons ?? null,
      input.metrics_snapshot ? JSON.stringify(input.metrics_snapshot) : null,
      now,
      topicId,
    );

    const row = db
      .prepare("SELECT * FROM topics WHERE topic_id = ?")
      .get(topicId) as Record<string, unknown>;
    return rowToTopic(row);
  } finally {
    db.close();
  }
}

export interface AbandonTopicInput {
  reason?: string;
}

export async function abandonTopic(
  workspace: string,
  topicId: string,
  input: AbandonTopicInput,
): Promise<Topic> {
  const db = ensureDb(workspace);

  try {
    const existing = db
      .prepare("SELECT * FROM topics WHERE topic_id = ?")
      .get(topicId) as Record<string, unknown> | undefined;
    if (!existing) {
      throw new Error(`Topic not found: ${topicId}`);
    }

    const existingNotes = (existing.notes as string) ?? "";
    const newNotes = input.reason
      ? `${existingNotes}\n[Abandoned] ${input.reason}`.trim()
      : existingNotes;

    const now = new Date().toISOString();
    db.prepare(
      `UPDATE topics
       SET status = 'abandoned',
           notes = ?,
           updated_at = ?
       WHERE topic_id = ?`,
    ).run(newNotes, now, topicId);

    const row = db
      .prepare("SELECT * FROM topics WHERE topic_id = ?")
      .get(topicId) as Record<string, unknown>;
    return rowToTopic(row);
  } finally {
    db.close();
  }
}

export async function listTopics(
  workspace: string,
  filter: ListTopicsFilter,
): Promise<Topic[]> {
  const db = ensureDb(workspace);

  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.status) {
      conditions.push("status = ?");
      params.push(filter.status);
    }

    if (filter.priority) {
      conditions.push("priority = ?");
      params.push(filter.priority);
    }

    if (filter.tag) {
      conditions.push(
        "EXISTS (SELECT 1 FROM json_each(tags) WHERE value = ?)",
      );
      params.push(filter.tag);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
    const limit = filter.limit ?? 50;

    const sql = `SELECT * FROM topics ${where} ORDER BY created_at DESC LIMIT ?`;
    params.push(limit);

    const rows = db.prepare(sql).all(...params) as Record<string, unknown>[];
    return rows.map(rowToTopic);
  } finally {
    db.close();
  }
}

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
  const priority = optionalArg(parsed, "priority") as TopicPriority | undefined;
  const tagsRaw = optionalArg(parsed, "tags");
  const notes = optionalArg(parsed, "notes");

  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()) : undefined;

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
  const status = optionalArg(parsed, "status") as TopicStatus | undefined;
  const priority = optionalArg(parsed, "priority") as TopicPriority | undefined;
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
  const status = optionalArg(parsed, "status") as TopicStatus | undefined;
  const priority = optionalArg(parsed, "priority") as TopicPriority | undefined;
  const aiScoreStr = optionalArg(parsed, "ai-score");
  const aiScore = aiScoreStr ? parseInt(aiScoreStr, 10) : undefined;
  const aiReason = optionalArg(parsed, "ai-reason");
  const tagsRaw = optionalArg(parsed, "tags");
  const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()) : undefined;
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
  const performance = requireArg(parsed, "performance", "Performance rating") as
    | "excellent"
    | "good"
    | "average"
    | "poor";
  const lessons = optionalArg(parsed, "lessons");
  const metricsSnapshotRaw = optionalArg(parsed, "metrics-snapshot");
  const metricsSnapshot = metricsSnapshotRaw
    ? JSON.parse(metricsSnapshotRaw)
    : undefined;

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
