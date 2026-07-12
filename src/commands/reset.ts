/**
 * reset — Reset phases for revision re-entry.
 *
 * Implements the revision protocol from revision-protocol.md.
 *
 * Usage:
 *   zzhub-pipeline reset --state /path/to/state.json --mode <mode>
 *
 * Modes:
 *   content    — Reset prepare+render+publish (for re-writing body)
 *   redo.style — Reset prepare+render+publish, start from style step
 *   redo.format — Reset prepare+render+publish, start from format step
 *   redo.metadata — Reset prepare+render+publish, start from metadata step
 *   redo.route — Reset prepare+render+publish, start from route step
 *   render     — Reset render+publish (for re-generating images)
 *   publish    — Reset publish only (for re-publishing)
 *   full       — Mark current as abandoned, prepare for full re-run
 *
 * Output: Updated state JSON summary.
 */

import { parseArgs, requireArg } from "../args";
import { printResult, renderReset } from "../output";
import {
  defaultContentReview,
  readResolvedState,
  reenterPrepare,
  reenterPublish,
  reenterRender,
  writeState,
} from "../state";

type ResetMode =
  | "content"
  | "redo.style"
  | "redo.format"
  | "redo.metadata"
  | "redo.route"
  | "render"
  | "publish"
  | "full";

const VALID_MODES: ResetMode[] = [
  "content",
  "redo.style",
  "redo.format",
  "redo.metadata",
  "redo.route",
  "render",
  "publish",
  "full",
];

export async function reset(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline reset [options]

Options:
  --state    Path to state JSON (required)
  --mode     Reset mode (required): ${VALID_MODES.join(" | ")}

Modes:
  content        Reset all phases (for body rewrite, requires writer re-run)
  redo.style     From style step (skip writer)
  redo.format    From format step
  redo.metadata  From metadata step
  redo.route     From route step
  render         Reset render+publish (for image re-generation)
  publish        Reset publish only (for re-publish)
  full           Abandon current, prepare for full re-run
`.trim());
    return;
  }

  const requestedStatePath = requireArg(parsed, "state", "state JSON path");
  const mode = requireArg(parsed, "mode", "reset mode") as ResetMode;

  if (!VALID_MODES.includes(mode)) {
    throw new Error(
      `Invalid reset mode: ${mode}. Valid modes: ${VALID_MODES.join(", ")}`,
    );
  }

  const resolved = await readResolvedState(requestedStatePath);
  const statePath = resolved.path;
  const state = resolved.state;

  switch (mode) {
    case "content":
    case "redo.style":
    case "redo.format":
    case "redo.metadata":
    case "redo.route":
      reenterPrepare(state, {
        clearFormattedBody: mode === "content",
        resetReview: mode === "content" || mode === "redo.style",
        redoHint:
        mode === "redo.style"
          ? "style"
          : mode === "redo.format"
            ? "format"
            : mode === "redo.metadata"
              ? "asset-meta"
              : mode === "redo.route"
                ? "channel-route"
                : "writer",
      });
      break;

    case "render":
      reenterRender(state);
      break;

    case "publish":
      reenterPublish(state);
      state.publish.results = state.publish.results.filter(
        (result) =>
          result.content_version !== state.artifacts.content_version ||
          result.render_version !== state.artifacts.render_version,
      );
      break;

    case "full":
      // Mark current state as failed/abandoned
      state.mode = "failed";
      state.phase.current = "failed";
      state.content_review = defaultContentReview();
      state.redo_hint = null;
      break;
  }

  await writeState(statePath, state);

  const output = {
    state_path: statePath,
    reset_mode: mode,
    mode: state.mode,
    phase: {
      current: state.phase.current,
      prepare: state.phase.prepare.status,
      render: state.phase.render.status,
      publish: state.phase.publish.status,
    },
    // redo_hint is persisted in state; also echoed here for convenience
    start_step: state.redo_hint ?? null,
  };

  printResult(output, renderReset);
}
