import { parseArgs, optionalArg, requireArg } from "../args";
import { printResult, renderTaskShape } from "../output";
import { findTask, getTaskByStatePath } from "../task-manager";
import { buildAgentTaskShape, parseTaskViewMode, renderTaskStatusMarkdown } from "../task-views";

export async function status(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  const positional = JSON.parse(String(parsed._ ?? "[]")) as string[];

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline status [options]

Options:
  --state      Path to state JSON
  --run-id     Run id to resolve inside workspace
  --workspace  Workspace root (optional; when used alone, resolves the current active task)
  --full       Include the full state payload
  --view       json | markdown | agent | agent-json (default: json)
`.trim());
    return;
  }

  if (positional.length > 0) {
    throw new Error(`Unexpected positional arguments: ${positional.join(" ")}. Use --state or --run-id.`);
  }

  const statePath = optionalArg(parsed, "state");
  const workspace = optionalArg(parsed, "workspace");
  const includeFull = parsed.full === true || parsed.full === "true";
  const view = parseTaskViewMode(optionalArg(parsed, "view"));

  const task = statePath
    ? await getTaskByStatePath(statePath)
    : await findTask(
        workspace,
        optionalArg(parsed, "run-id")
          ? { run_id: requireArg(parsed, "run-id", "run id") }
          : { active_only: true },
      );

  if (!task) {
    throw new Error("Task not found");
  }

  if (view === "agent-json") {
    console.log(JSON.stringify(buildAgentTaskShape(task), null, 2));
    return;
  }

  if (view !== "json") {
    console.log(renderTaskStatusMarkdown(task, view));
    return;
  }

  printResult(
    includeFull
      ? task
      : {
          summary: task.summary,
          validation: task.validation,
          gaps: task.gaps,
          blockers: task.blockers,
          next_action: task.next_action,
        },
    renderTaskShape,
  );
}
