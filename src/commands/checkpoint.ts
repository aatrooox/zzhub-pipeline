/**
 * checkpoint — Read and validate state, report phase status.
 *
 * Used by orchestrator to check state at phase boundaries.
 *
 * Usage:
 *   zzhub-pipeline checkpoint --state /path/to/state.json [--phase render]
 *
 * Output: JSON with state summary and validation errors.
 */

import { parseArgs, requireArg, optionalArg } from "../args";
import { printResult, renderTaskShape } from "../output";
import { getTaskByStatePath } from "../task-manager";
import { parseTaskViewMode, renderTaskStatusMarkdown } from "../task-views";
import type { PhaseName } from "../state";
import { validateForPhase } from "../state";
import type { CommandOutcome } from "../command-outcome";

export async function checkpoint(args: string[]): Promise<void | CommandOutcome> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline checkpoint [options]

Options:
  --state    Path to state JSON (required)
  --phase    Phase to validate for (optional; defaults to state.phase.current)
  --view     json | markdown | agent (default: json)
`.trim());
    return;
  }

  const statePath = requireArg(parsed, "state", "state JSON path");
  const phaseOverride = optionalArg(parsed, "phase") as PhaseName | undefined;
  const view = parseTaskViewMode(optionalArg(parsed, "view"));

  const task = await getTaskByStatePath(statePath);
  const phase = phaseOverride ?? task.state.phase.current;
  const errors = validateForPhase(task.state, phase);

  const output = {
    summary: task.summary,
    validation: {
      phase_checked: phase,
      valid: errors.length === 0,
      errors,
    },
    gaps: task.gaps,
    blockers: task.blockers,
    next_action: task.next_action,
  };

  if (view !== "json") {
    console.log(renderTaskStatusMarkdown({
      ...task,
      validation: output.validation,
    }, view));
  } else {
    printResult(output, renderTaskShape);
  }

  if (errors.length > 0) {
    return { status: "failed", errors: errors.map((error) => ({ code: "CHECKPOINT_FAILED", message: `${error.field}: ${error.message}`, stage: phase })) };
  }
}
