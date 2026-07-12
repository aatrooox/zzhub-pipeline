import { copyFile, mkdir, readFile } from "fs/promises";
import { extname, join, resolve } from "path";

import { parseArgs, optionalArg, requireArg } from "../args";
import { loadConfig, resolveWorkspacePaths, resolveWorkspaceRoot } from "../config";
import { printResult } from "../output";
import { resolveFullRoute } from "../routes";
import {
  defaultArtifacts,
  defaultContentReview,
  defaultImages,
  defaultMetadata,
  defaultPhase,
  defaultPublish,
  defaultState,
  generateRunId,
  getRunStatePath,
  readResolvedState,
  writeState,
  type ContentForm,
  type HandoffAuthoringPolicy,
  type HandoffResearchPolicy,
  type HandoffReviewPolicy,
  type Target,
  type WorkflowState,
} from "../state";
import { findTask, getTaskByStatePath } from "../task-manager";

interface PublishHandoffInput {
  content_form: ContentForm;
  body_path: string;
  target_account: string;
  title: string;
  user_intent_text: string;
  explicit_constraints?: string[];
}

type WorkflowHandoffMode = "new" | "resume";

interface WorkflowHandoffInput {
  mode?: WorkflowHandoffMode;
  state_path?: string;
  run_id?: string;
  content_form?: ContentForm;
  body_path?: string;
  materials_path?: string;
  target_account?: string;
  title?: string;
  user_intent_text?: string;
  explicit_constraints?: string[];
  research_policy?: Exclude<HandoffResearchPolicy, "default">;
  authoring_policy?: Exclude<HandoffAuthoringPolicy, "default">;
  review_policy?: Exclude<HandoffReviewPolicy, "default">;
}

interface ResolvedWorkflowHandoff {
  source: "publish_handoff" | "workflow_handoff";
  mode: WorkflowHandoffMode;
  state_path?: string;
  run_id?: string;
  content_form?: ContentForm;
  body_path?: string;
  materials_path?: string;
  target_account?: string;
  title?: string;
  user_intent_text?: string;
  explicit_constraints: string[];
  research_policy: HandoffResearchPolicy;
  authoring_policy: HandoffAuthoringPolicy;
  review_policy: HandoffReviewPolicy;
}

function cleanString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`Invalid ${field}: expected a non-empty string`);
  }
  return value.trim();
}

function parseExplicitConstraints(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    : [];
}

function parseContentForm(value: unknown, field: string): ContentForm | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === "article" || value === "newspic" || value === "unknown") {
    return value;
  }
  throw new Error(`Invalid ${field}: expected article | newspic | unknown`);
}

function parseWorkflowMode(value: unknown): WorkflowHandoffMode | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (value === "new" || value === "resume") {
    return value;
  }
  throw new Error("Invalid workflow_handoff.mode: expected new | resume");
}

function parseResearchPolicy(value: unknown): HandoffResearchPolicy {
  if (value === undefined || value === null) {
    return "default";
  }
  if (value === "need" || value === "skip") {
    return value;
  }
  throw new Error("Invalid workflow_handoff.research_policy: expected need | skip");
}

function parseAuthoringPolicy(value: unknown): HandoffAuthoringPolicy {
  if (value === undefined || value === null) {
    return "default";
  }
  if (
    value === "write" ||
    value === "write_from_materials" ||
    value === "revise" ||
    value === "format_only"
  ) {
    return value;
  }
  throw new Error(
    "Invalid workflow_handoff.authoring_policy: expected write | write_from_materials | revise | format_only",
  );
}

function parseReviewPolicy(value: unknown): HandoffReviewPolicy {
  if (value === undefined || value === null) {
    return "default";
  }
  if (value === "required" || value === "trust_user") {
    return value;
  }
  throw new Error("Invalid workflow_handoff.review_policy: expected required | trust_user");
}

function parsePublishHandoff(raw: unknown): ResolvedWorkflowHandoff {
  const candidate =
    raw && typeof raw === "object" && "publish_handoff" in (raw as Record<string, unknown>)
      ? (raw as Record<string, unknown>).publish_handoff
      : raw;

  if (!candidate || typeof candidate !== "object") {
    throw new Error("Invalid publish_handoff file: expected an object or { publish_handoff: { ... } }");
  }

  const input = candidate as PublishHandoffInput;
  const contentForm = parseContentForm(input.content_form, "publish_handoff.content_form");
  const bodyPath = cleanString(input.body_path, "publish_handoff.body_path");
  const targetAccount = cleanString(input.target_account, "publish_handoff.target_account");
  const title = cleanString(input.title, "publish_handoff.title");
  const userIntentText = cleanString(input.user_intent_text, "publish_handoff.user_intent_text");

  if (!contentForm || !bodyPath || !targetAccount || !title || !userIntentText) {
    throw new Error("Invalid publish_handoff: missing required fields");
  }

  return {
    source: "publish_handoff",
    mode: "new",
    content_form: contentForm,
    body_path: bodyPath,
    target_account: targetAccount,
    title,
    user_intent_text: userIntentText,
    explicit_constraints: parseExplicitConstraints(input.explicit_constraints),
    research_policy: "skip",
    authoring_policy: "format_only",
    review_policy: "required",
  };
}

function parseWorkflowHandoff(raw: unknown): ResolvedWorkflowHandoff {
  const candidate =
    raw && typeof raw === "object" && "workflow_handoff" in (raw as Record<string, unknown>)
      ? (raw as Record<string, unknown>).workflow_handoff
      : raw;

  if (!candidate || typeof candidate !== "object") {
    throw new Error("Invalid workflow_handoff file: expected an object or { workflow_handoff: { ... } }");
  }

  const input = candidate as WorkflowHandoffInput;
  const mode =
    parseWorkflowMode(input.mode) ??
    (cleanString(input.state_path, "workflow_handoff.state_path") || cleanString(input.run_id, "workflow_handoff.run_id")
      ? "resume"
      : "new");
  const handoff: ResolvedWorkflowHandoff = {
    source: "workflow_handoff",
    mode,
    state_path: cleanString(input.state_path, "workflow_handoff.state_path"),
    run_id: cleanString(input.run_id, "workflow_handoff.run_id"),
    content_form: parseContentForm(input.content_form, "workflow_handoff.content_form"),
    body_path: cleanString(input.body_path, "workflow_handoff.body_path"),
    materials_path: cleanString(input.materials_path, "workflow_handoff.materials_path"),
    target_account: cleanString(input.target_account, "workflow_handoff.target_account"),
    title: cleanString(input.title, "workflow_handoff.title"),
    user_intent_text: cleanString(input.user_intent_text, "workflow_handoff.user_intent_text"),
    explicit_constraints: parseExplicitConstraints(input.explicit_constraints),
    research_policy: parseResearchPolicy(input.research_policy),
    authoring_policy: parseAuthoringPolicy(input.authoring_policy),
    review_policy: parseReviewPolicy(input.review_policy),
  };

  if (handoff.mode === "new") {
    if (!handoff.content_form) {
      throw new Error("workflow_handoff new mode requires content_form");
    }
    if (!handoff.target_account) {
      throw new Error("workflow_handoff new mode requires target_account");
    }
    if (!handoff.title) {
      throw new Error("workflow_handoff new mode requires title");
    }
    if (!handoff.user_intent_text) {
      throw new Error("workflow_handoff new mode requires user_intent_text");
    }
    if (!handoff.body_path && !handoff.materials_path) {
      throw new Error("workflow_handoff new mode requires body_path or materials_path");
    }
  } else if (!handoff.state_path && !handoff.run_id) {
    throw new Error("workflow_handoff resume mode requires state_path or run_id");
  }

  if (handoff.authoring_policy === "format_only" && !handoff.body_path && handoff.mode === "new") {
    throw new Error("workflow_handoff authoring_policy=format_only requires body_path in new mode");
  }
  if (handoff.authoring_policy === "write_from_materials" && !handoff.materials_path && handoff.mode === "new") {
    throw new Error("workflow_handoff authoring_policy=write_from_materials requires materials_path in new mode");
  }

  return handoff;
}

function shouldParseAsWorkflow(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") {
    return false;
  }

  const input = raw as Record<string, unknown>;
  return [
    "workflow_handoff",
    "mode",
    "state_path",
    "run_id",
    "materials_path",
    "research_policy",
    "authoring_policy",
    "review_policy",
  ].some((key) => key in input);
}

function parseHandoff(raw: unknown): ResolvedWorkflowHandoff {
  if (shouldParseAsWorkflow(raw)) {
    return parseWorkflowHandoff(raw);
  }

  if (raw && typeof raw === "object" && "workflow_handoff" in (raw as Record<string, unknown>)) {
    return parseWorkflowHandoff(raw);
  }

  return parsePublishHandoff(raw);
}

async function stageManagedInputFile(
  workspaceRoot: string,
  runId: string,
  sourcePath: string,
  stem: string,
): Promise<string> {
  const tempRoot = resolveWorkspacePaths(workspaceRoot).tempRoot;
  const extension = extname(sourcePath) || ".md";
  const managedDir = join(tempRoot, runId);
  const managedPath = join(managedDir, `${stem}${extension}`);
  await mkdir(managedDir, { recursive: true });
  if (resolve(sourcePath) !== resolve(managedPath)) {
    await copyFile(sourcePath, managedPath);
  }
  return managedPath;
}

function arraysEqual(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, index) => item === b[index]);
}

function routesEqual(a: WorkflowState["route"], b: WorkflowState["route"]): boolean {
  return (
    a.primary === b.primary &&
    a.account === b.account &&
    a.content_profile === b.content_profile &&
    arraysEqual(a.extras, b.extras)
  );
}

function resetDerivedState(state: WorkflowState): void {
  state.mode = "active";
  state.phase = defaultPhase();
  state.asset_path = "";
  state.formatted_body_path = null;
  state.metadata = {
    ...defaultMetadata(),
    title: state.metadata.title,
  };
  state.artifacts = defaultArtifacts();
  state.images = defaultImages();
  state.publish = defaultPublish();
  state.content_review = defaultContentReview();
  state.redo_hint = null;
}

async function resolveExistingStatePath(
  workspaceRoot: string,
  handoff: ResolvedWorkflowHandoff,
): Promise<string> {
  if (handoff.state_path) {
    return handoff.state_path;
  }

  const task = await findTask(workspaceRoot, { run_id: handoff.run_id });
  if (!task) {
    throw new Error(`Task not found for run_id: ${handoff.run_id}`);
  }
  return task.summary.state_path;
}

async function applyHandoffToState(
  state: WorkflowState,
  handoff: ResolvedWorkflowHandoff,
): Promise<void> {
  const targets: Target[] = state.intent.targets.length > 0 ? state.intent.targets : ["wechat"];
  let restartFromPrepare = false;

  const nextContentForm = handoff.content_form ?? state.intent.content_form;
  if (handoff.content_form && handoff.content_form !== state.intent.content_form) {
    restartFromPrepare = true;
  }
  state.intent.content_form = nextContentForm;
  state.intent.task_kind = "publish";
  state.intent.targets = targets;
  state.intent.content_origin = handoff.body_path ? "user" : handoff.materials_path ? "external" : state.intent.content_origin;
  state.intent.requires.render = true;
  state.intent.requires.publish = true;
  if (handoff.research_policy === "need") {
    state.intent.requires.research = true;
  } else if (handoff.research_policy === "skip") {
    state.intent.requires.research = false;
  }

  if (handoff.user_intent_text && handoff.user_intent_text !== state.intent.intent_text) {
    state.intent.intent_text = handoff.user_intent_text;
    restartFromPrepare = true;
  }

  if (
    handoff.explicit_constraints.length > 0 &&
    !arraysEqual(handoff.explicit_constraints, state.intent.explicit_constraints)
  ) {
    state.intent.explicit_constraints = handoff.explicit_constraints;
    restartFromPrepare = true;
  } else if (handoff.mode === "new") {
    state.intent.explicit_constraints = handoff.explicit_constraints;
  }

  if (handoff.title && handoff.title !== state.metadata.title) {
    state.metadata.title = handoff.title;
    restartFromPrepare = true;
  }

  if (handoff.research_policy !== "default") {
    state.handoff.research_policy = handoff.research_policy;
  }
  if (handoff.authoring_policy !== "default") {
    state.handoff.authoring_policy = handoff.authoring_policy;
  }
  if (handoff.review_policy !== "default") {
    state.handoff.review_policy = handoff.review_policy;
  }

  const nextRoute = resolveFullRoute(state.intent.intent_text ?? "", {
    account: handoff.target_account ?? state.route.account,
    contentForm: state.intent.content_form,
    targets,
  });
  if (!routesEqual(nextRoute, state.route)) {
    restartFromPrepare = true;
    state.route = nextRoute;
  }

  if (handoff.body_path) {
    state.source_body_path = await stageManagedInputFile(
      state.workspace_root,
      state.run_id,
      handoff.body_path,
      "source-body",
    );
    state.handoff.source_materials_path = null;
    restartFromPrepare = true;
  }

  if (handoff.materials_path) {
    state.handoff.source_materials_path = await stageManagedInputFile(
      state.workspace_root,
      state.run_id,
      handoff.materials_path,
      "source-materials",
    );
    if (!handoff.body_path) {
      state.source_body_path = null;
    }
    restartFromPrepare = true;
  }

  if (
    state.handoff.authoring_policy === "write_from_materials" &&
    !state.handoff.source_materials_path
  ) {
    throw new Error("workflow_handoff authoring_policy=write_from_materials requires materials_path");
  }

  if (restartFromPrepare) {
    resetDerivedState(state);
  }

  if (state.handoff.review_policy === "trust_user" && state.source_body_path) {
    state.content_review = { status: "passed", feedback: null };
  } else if (state.handoff.review_policy === "required" && restartFromPrepare) {
    state.content_review = defaultContentReview();
  }

  state.mode = "active";
}

function buildNewState(workspaceRoot: string, statePath: string, runId: string): WorkflowState {
  const state = defaultState();
  state.run_id = runId;
  state.workspace_root = workspaceRoot;
  state.state_path = statePath;
  state.mode = "active";
  return state;
}

export async function ingestHandoff(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline ingest-handoff [options]

Options:
  --file           Path to a publish_handoff/workflow_handoff JSON file (required)
  --workspace      Workspace root directory (optional; defaults to config/env)
`.trim());
    return;
  }

  const filePath = requireArg(parsed, "file", "publish_handoff/workflow_handoff JSON file");
  const config = loadConfig();
  const workspace = resolveWorkspaceRoot(optionalArg(parsed, "workspace"), config);
  const raw = JSON.parse(await readFile(filePath, "utf-8")) as unknown;
  const handoff = parseHandoff(raw);

  const statePath =
    handoff.mode === "resume"
      ? await resolveExistingStatePath(workspace, handoff)
      : getRunStatePath(workspace, generateRunId());
  const resolvedExisting = handoff.mode === "resume"
    ? await readResolvedState(statePath)
    : null;
  const effectiveStatePath = resolvedExisting?.path ?? statePath;
  const state = resolvedExisting?.state ??
    buildNewState(
      workspace,
      effectiveStatePath,
      effectiveStatePath.split("/").pop()?.replace(/\.json$/, "") ?? generateRunId(),
    );

  if (handoff.mode === "new" && !state.run_id) {
    state.run_id = generateRunId();
    state.state_path = getRunStatePath(workspace, state.run_id);
  }

  await applyHandoffToState(state, handoff);
  await writeState(state.state_path || effectiveStatePath, state);

  const task = await getTaskByStatePath(state.state_path);
  printResult({
    accepted_handoff: {
      source: handoff.source,
      mode: handoff.mode,
      run_id: task.summary.run_id,
      state_path: task.summary.state_path,
      content_form: state.intent.content_form,
      target_account: state.route.account,
      title: state.metadata.title,
      user_intent_text: state.intent.intent_text,
      explicit_constraints: state.intent.explicit_constraints,
      research_policy: state.handoff.research_policy,
      authoring_policy: state.handoff.authoring_policy,
      review_policy: state.handoff.review_policy,
      body_attached: Boolean(state.source_body_path),
      materials_attached: Boolean(state.handoff.source_materials_path),
    },
    ...task,
  });
}
