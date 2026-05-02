import { parseArgs, requireArg } from "../args";
import { printResult, renderTaskShape } from "../output";
import { readState, writeState } from "../state";
import { getTaskByStatePath } from "../task-manager";
import { reconcileStateArtifacts } from "../workflow-materials";

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

  const statePath = requireArg(parsed, "state", "state JSON path");
  const state = await readState(statePath);
  await reconcileStateArtifacts(state);
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
