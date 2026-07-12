import { parseArgs, requireArg } from "../args";
import { printResult, renderTaskShape } from "../output";
import { readResolvedState, writeState } from "../state";
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

  const requestedStatePath = requireArg(parsed, "state", "state JSON path");
  const resolved = await readResolvedState(requestedStatePath);
  const statePath = resolved.path;
  const state = resolved.state;
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
