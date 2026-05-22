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
import { readState, writeState, defaultContentReview } from "../state";

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

  const statePath = requireArg(parsed, "state", "state JSON path");
  const mode = requireArg(parsed, "mode", "reset mode") as ResetMode;

  if (!VALID_MODES.includes(mode)) {
    throw new Error(
      `Invalid reset mode: ${mode}. Valid modes: ${VALID_MODES.join(", ")}`,
    );
  }

  const state = await readState(statePath);

  switch (mode) {
    case "content":
    case "redo.style":
    case "redo.format":
    case "redo.metadata":
    case "redo.route":
      // Reset prepare + render + publish
      state.phase.prepare = { status: "pending", error: null };
      state.phase.render = { status: "pending", error: null };
      state.phase.publish = { status: "pending", error: null };
      state.phase.current = "prepare";
      state.mode = "active";
      // Persist redo hint so orchestrator can recover start step even after context loss
      state.redo_hint =
        mode === "redo.style"
          ? "style"
          : mode === "redo.format"
            ? "format"
            : mode === "redo.metadata"
              ? "asset-meta"
              : mode === "redo.route"
                ? "channel-route"
                : "writer"; // content
      // Reset content_review for content rewrite (writer will produce new body)
      if (mode === "content") {
        state.content_review = defaultContentReview();
      }
      break;

    case "render":
      // Reset render + publish, keep prepare done
      state.phase.render = { status: "pending", error: null };
      state.phase.publish = { status: "pending", error: null };
      state.phase.current = "render";
      state.mode = "active";
      state.redo_hint = null;
      // Reset image plan status
      if (state.images.plan.needed) {
        state.images.plan.status = "planned";
      }
      break;

    case "publish":
      // Reset publish only
      state.phase.publish = { status: "pending", error: null };
      state.phase.current = "publish";
      state.mode = "active";
      state.redo_hint = null;
      // Don't change content_version or render_version
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
