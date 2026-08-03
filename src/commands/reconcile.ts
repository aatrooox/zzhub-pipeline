import { parseArgs, requireArg } from "../args";
import { printResult, renderTaskShape } from "../output";
import { writeState } from "../state";
import { getTaskByStatePath, loadTaskState } from "../task-manager";

export async function reconcile(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline reconcile [options]

Options:
  --state  Path to state JSON (required)
`.trim());
    return;
  }

  const requestedStatePath = requireArg(parsed, "state", "state JSON path");
  const resolved = await loadTaskState(requestedStatePath);
  const statePath = resolved.path;
  const state = resolved.state;
  await writeState(statePath, state);

  const task = await getTaskByStatePath(statePath);
  printResult(
    {
      summary: task.summary,
      validation: task.validation,
      gaps: task.gaps,
      blockers: task.blockers,
      next_action: task.next_action,
    },
    renderTaskShape,
  );
}
