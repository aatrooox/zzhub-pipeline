import { readFile } from "fs/promises";
import { dirname } from "path";
import { ensureDb } from "../db";
import { AnalyticsSchema, type Analytics } from "../schema/analytics";
import { parseArgs, requireArg, optionalArg } from "../args";
import { printResult } from "../output";

export interface RecordAnalyticsInput {
  statePath: string;
  reads?: number;
  likes?: number;
  favorites?: number;
  shares?: number;
  comments?: number;
  notes?: string;
}

function resolveWorkspace(statePath: string): string {
  const postsIdx = statePath.lastIndexOf("/posts/");
  if (postsIdx !== -1) {
    return statePath.substring(0, postsIdx);
  }
  return dirname(statePath);
}

export async function recordAnalytics(
  input: RecordAnalyticsInput,
): Promise<Analytics> {
  const stateContent = await readFile(input.statePath, "utf-8");
  const state = JSON.parse(stateContent);

  const workspace = resolveWorkspace(input.statePath);
  const db = ensureDb(workspace);

  try {
    const now = new Date().toISOString();
    const publishDate = state.metadata?.date || now.split("T")[0];
    const title = state.metadata?.title || "Untitled";
    const topicId = state.topic_id || null;

    db.prepare(
      `INSERT OR REPLACE INTO analytics (
        run_id, topic_id, title, publish_date,
        reads, likes, favorites, shares, comments,
        notes, recorded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      state.run_id,
      topicId,
      title,
      publishDate,
      input.reads ?? 0,
      input.likes ?? 0,
      input.favorites ?? 0,
      input.shares ?? 0,
      input.comments ?? 0,
      input.notes ?? null,
      now,
    );

    const row = db
      .prepare("SELECT * FROM analytics WHERE run_id = ?")
      .get(state.run_id) as Record<string, unknown>;
    return AnalyticsSchema.parse(row);
  } finally {
    db.close();
  }
}

export interface ListAnalyticsFilter {
  days?: number;
  sort?: string;
  limit?: number;
}

const ALLOWED_SORT_FIELDS = new Set([
  "publish_date",
  "reads",
  "likes",
  "favorites",
  "shares",
  "comments",
  "recorded_at",
  "title",
]);

export async function listAnalytics(
  workspace: string,
  filter: ListAnalyticsFilter,
): Promise<Analytics[]> {
  const db = ensureDb(workspace);

  try {
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (filter.days) {
      conditions.push("publish_date >= date('now', ?)");
      params.push(`-${filter.days} days`);
    }

    const where =
      conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

    const sortField = filter.sort || "publish_date";
    if (!ALLOWED_SORT_FIELDS.has(sortField)) {
      throw new Error(
        `Invalid sort field: ${sortField}. Allowed: ${[...ALLOWED_SORT_FIELDS].join(", ")}`,
      );
    }

    const limit = filter.limit ?? 50;

    const sql = `SELECT * FROM analytics ${where} ORDER BY ${sortField} DESC LIMIT ?`;
    params.push(limit);

    const rows = db
      .prepare(sql)
      .all(...params) as Record<string, unknown>[];
    return rows.map((row) => AnalyticsSchema.parse(row));
  } finally {
    db.close();
  }
}

// CLI handler
export async function analytics(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help || args.length === 0) {
    console.log(`
Usage: zzhub-pipeline analytics <subcommand> [options]

Subcommands:
  record     Record post-publish metrics
  list       List analytics history

Run 'zzhub-pipeline analytics <subcommand> --help' for details.
`.trim());
    return;
  }

  const subcommand = args[0];
  const subArgs = args.slice(1);

  switch (subcommand) {
    case "record":
      return analyticsRecord(subArgs);
    case "list":
      return analyticsList(subArgs);
    default:
      throw new Error(`Unknown analytics subcommand: ${subcommand}`);
  }
}

async function analyticsRecord(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline analytics record [options]

Options:
  --state      State file path (required)
  --reads      Read count
  --likes      Like count
  --favorites  Favorite count
  --shares     Share count
  --comments   Comment count
  --notes      Notes
`.trim());
    return;
  }

  const statePath = requireArg(parsed, "state", "State file path");
  const readsStr = optionalArg(parsed, "reads");
  const likesStr = optionalArg(parsed, "likes");
  const favoritesStr = optionalArg(parsed, "favorites");
  const sharesStr = optionalArg(parsed, "shares");
  const commentsStr = optionalArg(parsed, "comments");
  const notes = optionalArg(parsed, "notes");

  const result = await recordAnalytics({
    statePath,
    reads: readsStr ? parseInt(readsStr, 10) : undefined,
    likes: likesStr ? parseInt(likesStr, 10) : undefined,
    favorites: favoritesStr ? parseInt(favoritesStr, 10) : undefined,
    shares: sharesStr ? parseInt(sharesStr, 10) : undefined,
    comments: commentsStr ? parseInt(commentsStr, 10) : undefined,
    notes,
  });

  printResult(result);
}

async function analyticsList(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline analytics list [options]

Options:
  --workspace  Workspace path (required)
  --days       Show last N days (default: all)
  --sort       Sort field: publish_date/reads/likes (default: publish_date)
  --limit      Max results (default: 50)
  --view       Output format: json/markdown/agent (default: json)
`.trim());
    return;
  }

  const workspace = requireArg(parsed, "workspace", "Workspace path");
  const daysStr = optionalArg(parsed, "days");
  const days = daysStr ? parseInt(daysStr, 10) : undefined;
  const sort = optionalArg(parsed, "sort");
  const limitStr = optionalArg(parsed, "limit");
  const limit = limitStr ? parseInt(limitStr, 10) : undefined;

  const result = await listAnalytics(workspace, { days, sort, limit });

  printResult(result);
}
