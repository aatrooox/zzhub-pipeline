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
