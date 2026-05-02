import { parseArgs, optionalArg } from "../args";
import { printResult, renderTaskShape } from "../output";
import { findTask } from "../task-manager";
import { buildAgentTaskShape, parseTaskViewMode, renderTaskStatusMarkdown } from "../task-views";

export async function findRun(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline find-run [options]

Options:
  --workspace       Workspace root (optional)
  --run-id          Exact run id
  --route           Primary route filter
  --account         Account filter
  --mode            Mode filter
  --phase           Current phase filter
  --title-contains  Match title substring
  --active          Prefer only in-flight tasks
  --full            Include the full state payload
  --view            json | markdown | agent | agent-json (default: json)
`.trim());
    return;
  }

  const includeFull = parsed.full === true || parsed.full === "true";
  const view = parseTaskViewMode(optionalArg(parsed, "view"));
  const task = await findTask(optionalArg(parsed, "workspace"), {
    run_id: optionalArg(parsed, "run-id"),
    route: optionalArg(parsed, "route"),
    account: optionalArg(parsed, "account"),
    mode: optionalArg(parsed, "mode"),
    phase: optionalArg(parsed, "phase"),
    title_contains: optionalArg(parsed, "title-contains"),
    active_only: parsed.active === true || parsed.active === "true",
  });

  if (!task) {
    throw new Error("No matching task found");
  }

  if (view === "agent-json") {
    console.log(JSON.stringify(buildAgentTaskShape(task), null, 2));
    return;
  }

  if (view !== "json") {
    console.log(renderTaskStatusMarkdown(task, view));
    return;
  }

  printResult(includeFull ? task : task.summary, renderTaskShape);
}
