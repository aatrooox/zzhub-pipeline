/**
 * init — Create initial run state from intent classification.
 *
 * This is called by the orchestrator after intent classification.
 * It creates the temporary run state JSON.
 *
 * Usage:
 *   zzhub-pipeline init \
 *     --workspace /abs/workspace \
 *     --task-kind publish \
 *     --content-form article \
 *     --targets wechat \
 *     --content-origin user \
 *     [--newspic-render-spec-file /abs/spec.json] \
 *     [--style-hint fact_report] \
 *     [--requires-research] \
 *     [--requires-style] \
 *     [--requires-render] \
 *     [--requires-publish]
 *
 * Output: JSON state written to {workspace}/.zzhub-media/runs/{run_id}.json
 *         Prints the state path to stdout.
 */

import { readFile } from "fs/promises";
import { parseArgs, requireArg, optionalArg, flagArg } from "../args";
import { printResult, renderInit } from "../output";
import { loadConfig, resolveWorkspaceRoot } from "../config";
import { resolveFullRoute } from "../routes";
import {
  defaultState,
  generateRunId,
  getRunStatePath,
  normalizeNewspicRenderSpec,
  writeState,
  type ContentForm,
  type ContentOrigin,
  type Target,
  type TaskKind,
} from "../state";

export async function init(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline init [options]

Options:
  --workspace        Workspace root directory (optional; defaults to config/env)
  --task-kind        draft | polish | organize | publish | mixed (required)
  --content-form     article | newspic | unknown (required)
  --targets          Comma-separated: wechat,blog (required)
  --content-origin   user | external | unknown (required)
  --intent-text      Original user request for route/account resolution (optional)
  --account          Explicit account override (optional)
  --newspic-render-spec-file  JSON file for newspic pagination / page-image intent (optional)
  --style-hint       e.g. fact_report (optional)
  --requires-research  Flag
  --requires-style     Flag
  --requires-render    Flag
  --requires-publish   Flag
`.trim());
    return;
  }

  const taskKind = requireArg(parsed, "task-kind", "task kind") as TaskKind;
  const contentForm = requireArg(parsed, "content-form", "content form") as ContentForm;
  const targetsRaw = requireArg(parsed, "targets", "publish targets");
  const contentOrigin = requireArg(parsed, "content-origin", "content origin") as ContentOrigin;
  const intentText = optionalArg(parsed, "intent-text") ?? "";
  const accountOverride = optionalArg(parsed, "account");
  const styleHint = optionalArg(parsed, "style-hint") ?? null;
  const newspicRenderSpecFile = optionalArg(parsed, "newspic-render-spec-file");
  const config = loadConfig();
  const workspace = resolveWorkspaceRoot(optionalArg(parsed, "workspace"), config);

  const targets = targetsRaw.split(",").map((t) => t.trim()) as Target[];

  const runId = generateRunId();
  const statePath = getRunStatePath(workspace, runId);
  let newspicRender = null;

  if (newspicRenderSpecFile) {
    const specRaw = JSON.parse(await readFile(newspicRenderSpecFile, "utf-8")) as unknown;
    newspicRender = normalizeNewspicRenderSpec(specRaw);
  }

  const state = defaultState();
  state.run_id = runId;
  state.workspace_root = workspace;
  state.state_path = statePath;
  state.mode = "active";
  state.route = resolveFullRoute(intentText, {
    account: accountOverride,
    contentForm,
    targets,
  });

  state.intent = {
    task_kind: taskKind,
    content_form: contentForm,
    targets,
    content_origin: contentOrigin,
    intent_text: intentText || null,
    explicit_constraints: [],
    style_hint: styleHint,
    newspic_render: newspicRender,
    requires: {
      research: flagArg(parsed, "requires-research"),
      style: flagArg(parsed, "requires-style"),
      render: flagArg(parsed, "requires-render"),
      publish: flagArg(parsed, "requires-publish"),
    },
  };

  await writeState(statePath, state);

  const output = {
    run_id: runId,
    state_path: statePath,
    mode: state.mode,
    phase: state.phase.current,
  };
  printResult(output, renderInit);
}
