import { ensureDb } from "../db";
import {
  TopicSchema,
  type Topic,
  type TopicStatus,
  type TopicPriority,
} from "../schema/topic";

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
