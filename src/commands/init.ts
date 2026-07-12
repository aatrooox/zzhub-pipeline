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
 *     [--requires-publish] \
 *     [--existing-draft-media-id MEDIA_ID]
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
  parseAccountName,
  parseContentForm,
  parseContentOrigin,
  parsePublishTargets,
  parseTaskKind,
} from "../publish-targets";
import {
  defaultState,
  generateRunId,
  getRunStatePath,
  normalizeNewspicRenderSpec,
  writeState,
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
  --existing-draft-media-id  Update existing WeChat draft instead of creating new one (optional)
`.trim());
    return;
  }

  const taskKind = parseTaskKind(requireArg(parsed, "task-kind", "task kind"));
  const contentForm = parseContentForm(requireArg(parsed, "content-form", "content form"));
  const targetsRaw = requireArg(parsed, "targets", "publish targets");
  const contentOrigin = parseContentOrigin(requireArg(parsed, "content-origin", "content origin"));
  const intentText = optionalArg(parsed, "intent-text") ?? "";
  const accountOverride = optionalArg(parsed, "account");
  const styleHint = optionalArg(parsed, "style-hint") ?? null;
  const newspicRenderSpecFile = optionalArg(parsed, "newspic-render-spec-file");
  const existingDraftMediaId = optionalArg(parsed, "existing-draft-media-id") ?? null;
  const noteId = optionalArg(parsed, "note-id") ?? null;
  const config = loadConfig();
  const workspace = resolveWorkspaceRoot(optionalArg(parsed, "workspace"), config);

  const defaultAccount = parseAccountName(accountOverride ?? "default");
  const parsedTargets = parsePublishTargets(targetsRaw, {
    contentForm,
    defaultAccount,
  });
  const publishTargets = parsedTargets.targets;
  const intentTargets = parsedTargets.intentTargets;

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
    account: accountOverride ? defaultAccount : undefined,
    contentForm,
    targets: intentTargets,
  });

  // Set publish_targets if multi-target
  if (parsedTargets.explicit && publishTargets.length > 0) {
    state.publish_targets = publishTargets;
    // First target becomes primary route
    state.route.primary = publishTargets[0].route;
    state.route.account = publishTargets[0].account;
  }

  state.intent = {
    task_kind: taskKind,
    content_form: contentForm,
    targets: intentTargets,
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
    existing_draft_media_id: existingDraftMediaId,
    note_id: noteId,
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
