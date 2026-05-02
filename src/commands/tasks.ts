import { parseArgs, optionalArg } from "../args";
import { printResult, renderTasks } from "../output";
import { filterActiveTasks, listTasks } from "../task-manager";
import { buildAgentTasksShape, parseTaskViewMode, renderTasksView } from "../task-views";

export async function tasks(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline tasks [options]

Options:
  --workspace  Workspace root (optional)
  --active     Only return in-flight tasks (active/handoff)
  --full       Include the full state payload for every task
  --view       json | markdown | agent | agent-json (default: json)
`.trim());
    return;
  }

  const workspace = optionalArg(parsed, "workspace");
  const includeFull = parsed.full === true || parsed.full === "true";
  const activeOnly = parsed.active === true || parsed.active === "true";
  const view = parseTaskViewMode(optionalArg(parsed, "view"));
  const allTasks = await listTasks(workspace);
  const visibleTasks = activeOnly ? filterActiveTasks(allTasks) : allTasks;

  if (view === "agent-json") {
    console.log(JSON.stringify(buildAgentTasksShape(visibleTasks), null, 2));
    return;
  }

  if (view !== "json") {
    console.log(renderTasksView(visibleTasks, view));
    return;
  }

  printResult(
    includeFull
      ? visibleTasks
      : visibleTasks.map((task) => ({
          summary: task.summary,
          validation: task.validation,
          blockers: task.blockers,
          next_action: task.next_action,
        })),
    renderTasks,
  );
}
