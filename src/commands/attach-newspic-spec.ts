import { readFile } from "fs/promises";

import { parseArgs, requireArg } from "../args";
import { printResult, renderTaskShape } from "../output";
import { normalizeNewspicRenderSpec, readState, writeState } from "../state";
import { getTaskByStatePath } from "../task-manager";
import { reconcileStateArtifacts } from "../workflow-materials";

export async function attachNewspicSpec(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline attach-newspic-spec [options]

Options:
  --state  Path to state JSON (required)
  --file   Path to newspic render spec JSON (required)
`.trim());
    return;
  }

  const statePath = requireArg(parsed, "state", "state JSON path");
  const specPath = requireArg(parsed, "file", "newspic render spec file");

  const state = await readState(statePath);
  const spec = JSON.parse(await readFile(specPath, "utf-8")) as unknown;
  state.intent.newspic_render = normalizeNewspicRenderSpec(spec);
  await reconcileStateArtifacts(state);
  await writeState(statePath, state);

  const task = await getTaskByStatePath(statePath);
  printResult(
    {
      summary: task.summary,
      blockers: task.blockers,
      next_action: task.next_action,
    },
    renderTaskShape,
  );
}
