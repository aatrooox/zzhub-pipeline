/**
 * abandon — Mark one or more tasks as abandoned.
 *
 * Non-interactive (Agent / script):
 *   zzhub-pipeline abandon --run-id <id>
 *   zzhub-pipeline abandon --state /path/to/workflow-state.json
 *
 * Interactive (TTY, no args):
 *   zzhub-pipeline abandon
 *   → Shows all active tasks. Space to toggle, Enter to confirm, q/Esc to cancel.
 *
 * Output: JSON list of { run_id, state_path, ok, error? }
 */

import * as readline from "readline";
import { parseArgs, optionalArg } from "../args";
import { printResult, renderAbandon } from "../output";
import { filterActiveTasks, getTaskByStatePath, listTasks, type ListedTask } from "../task-manager";
import { updateState } from "../state";
import type { CommandOutcome } from "../command-outcome";

// ── Result type ───────────────────────────────────────────────────────────────

export interface AbandonResult {
  run_id: string;
  state_path: string;
  ok: boolean;
  error?: string;
}

// ── Core mutation ─────────────────────────────────────────────────────────────

async function abandonTask(task: ListedTask): Promise<AbandonResult> {
  const statePath = task.summary.state_path;
  try {
    await updateState(statePath, (state) => {
      state.mode = "abandoned";
    });
    return { run_id: task.summary.run_id, state_path: statePath, ok: true };
  } catch (err) {
    return {
      run_id: task.summary.run_id,
      state_path: statePath,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// ── Interactive checkbox (raw TTY) ────────────────────────────────────────────

interface CheckboxState {
  items: ListedTask[];
  selected: Set<number>;
  cursor: number;
}

function renderCheckbox(state: CheckboxState): string {
  const lines: string[] = [
    "\x1b[1mAbandon tasks\x1b[0m  \x1b[2m(↑↓ move · space select · enter confirm · q cancel)\x1b[0m",
    "",
  ];
  for (let i = 0; i < state.items.length; i++) {
    const task = state.items[i];
    const isCursor = i === state.cursor;
    const isSelected = state.selected.has(i);
    const box = isSelected ? "\x1b[31m[✗]\x1b[0m" : "\x1b[2m[ ]\x1b[0m";
    const title = task.summary.metadata.title ?? task.summary.run_id;
    const id = `\x1b[2m${task.summary.run_id}\x1b[0m`;
    const prefix = isCursor ? "\x1b[36m▶\x1b[0m " : "  ";
    lines.push(`${prefix}${box} ${title}  ${id}`);
  }
  if (state.items.length === 0) {
    lines.push("  \x1b[2m(no active tasks)\x1b[0m");
  }
  return lines.join("\n");
}

function clearLines(count: number): void {
  for (let i = 0; i < count; i++) {
    process.stdout.write("\x1b[1A\x1b[2K");
  }
}

async function runInteractive(items: ListedTask[]): Promise<ListedTask[]> {
  if (items.length === 0) {
    process.stdout.write("No active tasks to abandon.\n");
    return [];
  }

  const state: CheckboxState = {
    items,
    selected: new Set(),
    cursor: 0,
  };

  // Enter raw mode
  const rl = readline.createInterface({ input: process.stdin });
  process.stdin.setRawMode(true);
  process.stdin.resume();

  let rendered = renderCheckbox(state);
  process.stdout.write(rendered + "\n");
  let lineCount = rendered.split("\n").length;

  return new Promise<ListedTask[]>((resolve) => {
    process.stdin.on("data", (chunk: Buffer) => {
      const key = chunk.toString();

      if (key === "\x1b[A" || key === "k") {
        state.cursor = Math.max(0, state.cursor - 1);
      } else if (key === "\x1b[B" || key === "j") {
        state.cursor = Math.min(items.length - 1, state.cursor + 1);
      } else if (key === " ") {
        if (state.selected.has(state.cursor)) {
          state.selected.delete(state.cursor);
        } else {
          state.selected.add(state.cursor);
        }
      } else if (key === "\r" || key === "\n") {
        cleanup();
        const chosen = [...state.selected].map((i) => items[i]);
        resolve(chosen);
        return;
      } else if (key === "q" || key === "\x03") {
        cleanup();
        resolve([]);
        return;
      } else if (key === "\x1b") {
        return;
      } else {
        return;
      }

      clearLines(lineCount);
      rendered = renderCheckbox(state);
      process.stdout.write(rendered + "\n");
      lineCount = rendered.split("\n").length;
    });

    function cleanup(): void {
      process.stdin.setRawMode(false);
      rl.close();
    }
  });
}

// ── Command entry point ───────────────────────────────────────────────────────

export async function abandon(args: string[]): Promise<void | CommandOutcome> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline abandon [options]

Without options (interactive TTY):
  Lists all active tasks. Use ↑↓ to move, space to select,
  enter to confirm abandonment, q/Esc to cancel.

Options:
  --run-id    Run ID of the task to abandon
  --state     Path to the workflow-state.json to abandon
  --workspace Workspace root (used when listing tasks interactively)
`.trim());
    return;
  }

  const runId = optionalArg(parsed, "run-id");
  const statePath = optionalArg(parsed, "state");
  const workspace = optionalArg(parsed, "workspace");

  // ── Non-interactive: direct task identification ───────────────────────────
  if (runId || statePath) {
    let task: ListedTask;
    if (statePath) {
      task = await getTaskByStatePath(statePath);
    } else {
      const all = await listTasks(workspace);
      const found = all.find((t) => t.summary.run_id === runId);
      if (!found) {
        throw new Error(`No task found with run_id: ${runId}`);
      }
      task = found;
    }
    const result = await abandonTask(task);
    printResult([result], renderAbandon);
    return abandonOutcome([result]);
  }

  // ── Interactive: TTY checkbox ─────────────────────────────────────────────
  const all = await listTasks(workspace);
  const active = filterActiveTasks(all);
  const chosen = await runInteractive(active);

  if (chosen.length === 0) {
    process.stdout.write("No tasks abandoned.\n");
    return;
  }

  const results = await Promise.all(chosen.map(abandonTask));
  printResult(results, renderAbandon);
  return abandonOutcome(results);
}

/** 批量操作保留成功项，失败项决定本次执行结果。 */
function abandonOutcome(results: AbandonResult[]): CommandOutcome {
  const failed = results.filter((result) => !result.ok);
  return {
    status: failed.length ? (failed.length < results.length ? "partial_failure" : "failed") : "success",
    errors: failed.map((result) => ({ code: "ABANDON_FAILED", message: result.error || "放弃任务失败" })),
  };
}
