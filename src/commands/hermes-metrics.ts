import { readdir, readFile } from "fs/promises";
import { join } from "path";
import { parseArgs } from "../args";

const METRICS_DIR = join(
  process.env.HOME || "~",
  ".pipeline-workspace",
  "tasks",
  "hermes",
);

interface TaskMetrics {
  task_id: string;
  session_id: string;
  model: string;
  provider: string;
  started_at: string | null;
  ended_at: string | null;
  completed: boolean | null;
  interrupted: boolean | null;
  turns: number;
  api_calls: number;
  tokens: {
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
    reasoning: number;
  };
  estimated_cost_usd: number;
  api_latency_ms_total: number;
  tool_calls: Record<string, number>;
  tool_calls_total: number;
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function renderSingle(m: TaskMetrics): string {
  const lines: string[] = [];
  const status =
    m.ended_at == null
      ? "⏳ running"
      : m.completed
        ? "✅ completed"
        : m.interrupted
          ? "🛑 interrupted"
          : "❓ unknown";

  lines.push(`Task: ${m.task_id}`);
  lines.push(`Status: ${status}`);
  lines.push(`Model: ${m.model} (${m.provider})`);
  if (m.started_at) lines.push(`Started: ${m.started_at}`);
  if (m.ended_at) lines.push(`Ended: ${m.ended_at}`);
  lines.push("");
  lines.push("Iterations:");
  lines.push(`  Turns:       ${m.turns}`);
  lines.push(`  API calls:   ${m.api_calls}`);
  lines.push(`  API latency: ${formatMs(m.api_latency_ms_total)}`);
  lines.push("");
  lines.push("Tokens:");
  lines.push(`  Input:       ${formatTokens(m.tokens.input)}`);
  lines.push(`  Output:      ${formatTokens(m.tokens.output)}`);
  lines.push(`  Cache read:  ${formatTokens(m.tokens.cache_read)}`);
  lines.push(`  Cache write: ${formatTokens(m.tokens.cache_write)}`);
  lines.push(`  Reasoning:   ${formatTokens(m.tokens.reasoning)}`);
  const totalTokens =
    m.tokens.input +
    m.tokens.output +
    m.tokens.cache_read +
    m.tokens.cache_write +
    m.tokens.reasoning;
  lines.push(`  Total:       ${formatTokens(totalTokens)}`);
  lines.push("");
  lines.push(`Cost: $${m.estimated_cost_usd.toFixed(4)}`);
  lines.push("");

  if (m.tool_calls_total > 0) {
    lines.push(`Tool calls (${m.tool_calls_total}):`);
    const sorted = Object.entries(m.tool_calls).sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sorted) {
      lines.push(`  ${name}: ${count}`);
    }
  } else {
    lines.push("Tool calls: none");
  }

  return lines.join("\n");
}

function renderTable(metricsList: TaskMetrics[]): string {
  if (metricsList.length === 0) return "No metrics found.";

  const header = [
    "task_id".padEnd(32),
    "status".padEnd(14),
    "turns".padStart(5),
    "api".padStart(4),
    "tools".padStart(5),
    "tokens".padStart(10),
    "cost".padStart(9),
  ].join("  ");

  const sep = "─".repeat(header.length);
  const lines = [header, sep];

  for (const m of metricsList) {
    const status =
      m.ended_at == null
        ? "running"
        : m.completed
          ? "done"
          : m.interrupted
            ? "interrupted"
            : "unknown";

    const totalTokens =
      m.tokens.input +
      m.tokens.output +
      m.tokens.cache_read +
      m.tokens.cache_write +
      m.tokens.reasoning;

    const row = [
      m.task_id.padEnd(32).slice(0, 32),
      status.padEnd(14),
      String(m.turns).padStart(5),
      String(m.api_calls).padStart(4),
      String(m.tool_calls_total).padStart(5),
      formatTokens(totalTokens).padStart(10),
      `$${m.estimated_cost_usd.toFixed(4)}`.padStart(9),
    ].join("  ");

    lines.push(row);
  }

  lines.push("");
  lines.push(`${metricsList.length} task(s)`);
  return lines.join("\n");
}

async function readMetricsFile(filePath: string): Promise<TaskMetrics | null> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as TaskMetrics;
  } catch {
    return null;
  }
}

export async function hermesMetrics(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  const positional = JSON.parse(String(parsed._ ?? "[]")) as string[];

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline hermes-metrics [run_id] [--json]

Show execution metrics collected by the Hermes pipeline-metrics plugin.

Options:
  --json    Output raw JSON instead of table

Without a run_id, lists all tasks in a summary table.
With a run_id, shows detailed metrics for that task.
`.trim());
    return;
  }

  const asJson = parsed.json === true || parsed.json === "true";

  // List mode: no positional arg
  if (positional.length === 0) {
    let entries: string[];
    try {
      entries = (await readdir(METRICS_DIR)).filter((f) =>
        f.endsWith(".json"),
      );
    } catch {
      console.log("No metrics found (directory does not exist).");
      return;
    }

    if (entries.length === 0) {
      console.log("No metrics found.");
      return;
    }

    const metricsList: TaskMetrics[] = [];
    for (const entry of entries.sort()) {
      const m = await readMetricsFile(join(METRICS_DIR, entry));
      if (m) metricsList.push(m);
    }

    if (asJson) {
      console.log(JSON.stringify(metricsList, null, 2));
    } else {
      console.log(renderTable(metricsList));
    }
    return;
  }

  // Single task mode
  const runId = positional[0];
  const filePath = join(METRICS_DIR, `${runId}.json`);
  const m = await readMetricsFile(filePath);

  if (!m) {
    throw new Error(`No metrics found for run_id: ${runId}`);
  }

  if (asJson) {
    console.log(JSON.stringify(m, null, 2));
  } else {
    console.log(renderSingle(m));
  }
}
