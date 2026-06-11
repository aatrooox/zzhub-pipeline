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
