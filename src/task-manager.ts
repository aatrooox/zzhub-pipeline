import { readdir, stat } from "fs/promises";
import { join } from "path";

import { loadConfig, resolveWorkspacePaths, resolveWorkspaceRoot } from "./config";
import {
  readResolvedState,
  type PhaseName,
  type ValidationError,
  validateForPhase,
  type WorkflowState,
} from "./state";
import { reconcileStateArtifacts } from "./workflow-materials";

export type TaskFileSource = "run" | "canonical";

export interface TaskGap {
  code: string;
  field: string;
  message: string;
}

export interface TaskNextAction {
  action: string;
  reason: string;
  executor: "cli" | "worker" | "await-input" | "repair" | "complete" | "none";
  command: string | null;
  params?: {
    /** Absolute path to the state JSON file. Always populated. */
    state_path?: string;
    /** True when the action should be executed as a spawned worker (e.g. editor). */
    spawn?: boolean;
    /** True when a research pass is needed before writing. */
    requires_research?: boolean;
    /** Path to the existing source body file, when already attached. */
    source_body_path?: string;
    /** Path to upstream material bundle/file, when writing should start from materials. */
    source_materials_path?: string;
    /** Path to the most recent formatted body file, when prepare already ran. */
    formatted_body_path?: string;
    /** Review feedback text, populated for revise-content action. */
    feedback?: string | null;
    /** Named worker expected to handle the step when executor=worker. */
    worker_profile?: string;
    /** High-level worker mode or purpose. */
    worker_mode?: string;
    /** Effective handoff research policy, when upstream explicitly set it. */
    research_policy?: WorkflowState["handoff"]["research_policy"];
    /** Effective handoff authoring policy, when upstream explicitly set it. */
    authoring_policy?: WorkflowState["handoff"]["authoring_policy"];
    /** Effective handoff review policy, when upstream explicitly set it. */
    review_policy?: WorkflowState["handoff"]["review_policy"];
    /** Inputs the caller must still provide before the command can run. */
    required_inputs?: string[];
    /** Whether body text must be generated or can be supplied by the user. */
    body_source?: "needs_production" | "user_provided";
    /** Post-execution instruction for the orchestrator. */
    on_complete?: string;
    /** Alternative CLI command when user already has the body as a file (no placeholder). */
    handoff_alt?: string;
  };
}

export interface TaskSummary {
  run_id: string;
  mode: WorkflowState["mode"];
  phase: {
    current: WorkflowState["phase"]["current"];
    prepare: WorkflowState["phase"]["prepare"]["status"];
    render: WorkflowState["phase"]["render"]["status"];
    publish: WorkflowState["phase"]["publish"]["status"];
  };
  created_at: string | null;
  updated_at: string | null;
  state_path: string;
  asset_path: string | null;
  source: TaskFileSource;
  task_kind: WorkflowState["intent"]["task_kind"];
  content_form: WorkflowState["intent"]["content_form"];
  targets: WorkflowState["intent"]["targets"];
  content_origin: WorkflowState["intent"]["content_origin"];
  route: {
    primary: WorkflowState["route"]["primary"];
    extras: WorkflowState["route"]["extras"];
    account: string;
  };
  metadata: {
    title: string | null;
    slug: string | null;
    date: string | null;
    description: string | null;
  };
  content_review: WorkflowState["content_review"];
  artifacts: WorkflowState["artifacts"];
  images: {
    plan_status: WorkflowState["images"]["plan"]["status"];
    body_inputs: WorkflowState["images"]["body_inputs"];
    render_assets_count: number;
  };
  publish: WorkflowState["publish"];
}

export interface TaskStatusReport {
  summary: TaskSummary;
  state: WorkflowState;
  validation: {
    phase_checked: PhaseName;
    valid: boolean;
    errors: ValidationError[];
  };
  gaps: TaskGap[];
  blockers: TaskGap[];
  next_action: TaskNextAction;
}

export interface ListedTask extends TaskStatusReport {
  file_path: string;
  source: TaskFileSource;
}

function parseDateParts(runId: string): Date | null {
  const match = runId.match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (!match) {
    return null;
  }
  const [, y, m, d, hh, mm, ss] = match;
  const date = new Date(`${y}-${m}-${d}T${hh}:${mm}:${ss}`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function fallbackIsoFromRunId(runId: string): string | null {
  const parsed = parseDateParts(runId);
  return parsed ? parsed.toISOString() : null;
}

async function fallbackIsoFromFile(path: string): Promise<string | null> {
  try {
    const info = await stat(path);
    return info.mtime.toISOString();
  } catch {
    return null;
  }
}

function getValidationPhase(state: WorkflowState): PhaseName {
  if (state.phase.current === "done") {
    if (state.intent.requires.publish) {
      return "publish";
    }
    if (state.intent.requires.render) {
      return "render";
    }
    return "prepare";
  }

  if (state.phase.current === "failed") {
    if (state.phase.publish.status === "failed" || state.phase.publish.status === "handoff") {
      return "publish";
    }
    if (state.phase.render.status === "failed" || state.phase.render.status === "handoff") {
      return "render";
    }
    return "prepare";
  }

  return state.phase.current;
}

function summarizeState(
  state: WorkflowState,
  filePath: string,
  source: TaskFileSource,
  createdAt: string | null,
  updatedAt: string | null,
): TaskSummary {
  return {
    run_id: state.run_id,
    mode: state.mode,
    phase: {
      current: state.phase.current,
      prepare: state.phase.prepare.status,
      render: state.phase.render.status,
      publish: state.phase.publish.status,
    },
    created_at: createdAt,
    updated_at: updatedAt,
    state_path: state.state_path || filePath,
    asset_path: state.asset_path || null,
    source,
    task_kind: state.intent.task_kind,
    content_form: state.intent.content_form,
    targets: state.intent.targets,
    content_origin: state.intent.content_origin,
    route: {
      primary: state.route.primary,
      extras: state.route.extras,
      account: state.route.account,
    },
    metadata: {
      title: state.metadata.title || null,
      slug: state.metadata.slug || null,
      date: state.metadata.date || null,
      description: state.metadata.description || null,
    },
    content_review: state.content_review,
    artifacts: state.artifacts,
    images: {
      plan_status: state.images.plan.status,
      body_inputs: state.images.body_inputs,
      render_assets_count: state.images.render_assets.length,
    },
    publish: state.publish,
  };
}

function buildRevisionAction(
  summary: TaskSummary,
  state: WorkflowState,
  mode: "revise" | "style",
): TaskNextAction {
  const isStyleRedo = mode === "style";
  return {
    action: "revise-content",
    reason: isStyleRedo
      ? "A style redo was requested before deterministic prepare can continue."
      : "Content review requested a revision.",
    executor: "worker",
    command: null,
    params: {
      state_path: summary.state_path,
      feedback: state.content_review.feedback ?? null,
      source_body_path: state.source_body_path ?? undefined,
      source_materials_path: state.handoff.source_materials_path ?? undefined,
      worker_profile: "editor",
      worker_mode: mode,
      required_inputs: ["body_text"],
      body_source: "needs_production",
      on_complete: isStyleRedo
        ? "Apply the requested style pass. Then call: zzhub-pipeline attach-body --state ... --body-text \"...\" and re-run status."
        : "Revise the body text based on the feedback. Then call: zzhub-pipeline attach-body --state ... --body-text \"...\" and re-run status.",
      handoff_alt: `zzhub-pipeline attach-body --state "${summary.state_path}" --body "{file_path}"`,
    },
  };
}

function buildTaskStatus(summary: TaskSummary, state: WorkflowState): TaskStatusReport {
  const phaseChecked = getValidationPhase(state);
  const validationErrors = validateForPhase(state, phaseChecked);
  const gaps: TaskGap[] = validationErrors.map((error) => ({
    code: "validation",
    field: error.field,
    message: error.message,
  }));
  const blockers: TaskGap[] = [];

  if (!state.source_body_path && !state.asset_path && !state.handoff.source_materials_path) {
    gaps.unshift({
      code: "missing-body",
      field: "source_body_path",
      message: "Body source is not attached yet.",
    });
  }

  if (state.content_review.status === "unchecked" && state.source_body_path) {
    gaps.push({
      code: "content-review",
      field: "content_review.status",
      message: "Content review decision is still missing.",
    });
  }

  if (state.content_review.status === "needs_revision") {
    blockers.push({
      code: "needs-revision",
      field: "content_review.status",
      message: state.content_review.feedback || "Content review requires revision.",
    });
  }

  if (state.images.body_inputs.status === "pending") {
    blockers.push({
      code: "missing-body-images",
      field: "images.body_inputs",
      message: `Waiting for ${state.images.body_inputs.expected - state.images.body_inputs.received.length} more body image(s).`,
    });
  }

  if (state.mode === "failed") {
    blockers.push({
      code: "failed",
      field: "mode",
      message: "Task is marked as failed and needs manual intervention or reset.",
    });
  }

  if (state.mode === "handoff") {
    blockers.push({
      code: "handoff",
      field: "mode",
      message: "Task is currently waiting in handoff mode.",
    });
  }

  let nextAction: TaskNextAction = {
    action: "noop",
    reason: "No next action computed.",
    executor: "none",
    command: null,
  };

  if (state.mode === "done" || state.phase.current === "done") {
    nextAction = {
      action: "complete",
      reason: "Task is already complete.",
      executor: "complete",
      command: null,
      params: {
        state_path: summary.state_path,
        on_complete: "Task is done. No further action needed.",
      },
    };
  } else if (state.mode === "failed") {
    nextAction = {
      action: "reset-or-repair",
      reason: "Task failed; inspect state and run reset or repair missing assets.",
      executor: "repair",
      command: `zzhub-pipeline checkpoint --state "${summary.state_path}"`,
      params: {
        state_path: summary.state_path,
        on_complete: "After repair, re-run status to confirm the task is active again.",
      },
    };
  } else if (state.mode === "handoff") {
    if (state.images.body_inputs.status === "pending") {
      nextAction = {
        action: "attach-body-images",
        reason: "Body image inputs are still missing.",
        executor: "await-input",
        command: `zzhub-pipeline attach-body-images --state "${summary.state_path}" --images-file "{images_json_path}"`,
        params: {
          state_path: summary.state_path,
          required_inputs: ["images_json_path"],
          on_complete: "After user provides image inputs, call the suggested command, then re-run status.",
        },
      };
    } else {
      nextAction = {
        action: "resolve-handoff",
        reason: "Task is waiting for an external dependency or manual resolution.",
        executor: "repair",
        command: `zzhub-pipeline checkpoint --state "${summary.state_path}"`,
        params: {
          state_path: summary.state_path,
          on_complete: "After resolving the external dependency, re-run status to proceed.",
        },
      };
    }
  } else if (!state.source_body_path && !state.asset_path) {
    const hasMaterials = Boolean(state.handoff.source_materials_path);
    const requiresResearch = state.intent.requires.research;
    nextAction = {
      action: "attach-body",
      reason: hasMaterials
        ? "Upstream materials are attached; write the body from materials before continuing."
        : "No body is attached yet.",
      executor: "worker",
      command: hasMaterials
        ? null
        : `zzhub-pipeline attach-body --state "${summary.state_path}" --body-text "{body_text}"`,
      params: {
        state_path: summary.state_path,
        spawn: true,
        requires_research: requiresResearch || undefined,
        source_materials_path: state.handoff.source_materials_path ?? undefined,
        research_policy: state.handoff.research_policy,
        authoring_policy: state.handoff.authoring_policy,
        review_policy: state.handoff.review_policy,
        worker_profile: requiresResearch ? "research+editor" : "editor",
        worker_mode: hasMaterials
          ? requiresResearch
            ? "research-then-write-from-materials"
            : "write-from-materials"
          : requiresResearch
            ? "research-then-write"
            : "write",
        required_inputs: hasMaterials ? [] : ["body_text"],
        body_source: "needs_production",
        on_complete: hasMaterials
          ? "Produce body text from the upstream materials, then call: zzhub-pipeline attach-body --state ... --body-text \"...\" and re-run status."
          : "Produce the body text, then call the suggested command with --body-text to hand off, and re-run status. If the user already has a body file, use --body <path> instead.",
        handoff_alt: `zzhub-pipeline attach-body --state "${summary.state_path}" --body "{file_path}"`,
      },
    };
  } else if (state.images.body_inputs.status === "pending") {
    nextAction = {
      action: "attach-body-images",
      reason: "Body image inputs are still missing.",
      executor: "await-input",
      command: `zzhub-pipeline attach-body-images --state "${summary.state_path}" --images-file "{images_json_path}"`,
      params: {
        state_path: summary.state_path,
        required_inputs: ["images_json_path"],
        on_complete: "After user provides image inputs, call the suggested command, then re-run status.",
      },
    };
  } else if (state.redo_hint === "writer" || state.redo_hint === "style") {
    nextAction = buildRevisionAction(
      summary,
      state,
      state.redo_hint === "style" ? "style" : "revise",
    );
  } else if (state.content_review.status === "needs_revision") {
    nextAction = buildRevisionAction(summary, state, "revise");
  } else if (
    !state.metadata.title ||
    !state.metadata.slug ||
    !state.metadata.date ||
    ((state.phase.current === "prepare" || state.phase.prepare.status !== "done") &&
      !state.formatted_body_path) ||
    state.redo_hint === "format" ||
    state.redo_hint === "asset-meta" ||
    state.redo_hint === "channel-route"
  ) {
    nextAction = {
      action: "prepare",
      reason: "Body exists, but deterministic prepare output is still incomplete or invalidated.",
      executor: "cli",
      command: `zzhub-pipeline prepare --state "${summary.state_path}"`,
      params: {
        state_path: summary.state_path,
        source_body_path: state.source_body_path ?? undefined,
        source_materials_path: state.handoff.source_materials_path ?? undefined,
        authoring_policy: state.handoff.authoring_policy,
        review_policy: state.handoff.review_policy,
        on_complete: "After the command succeeds, re-run status to confirm metadata is ready.",
      },
    };
  } else if (state.phase.current === "prepare" || state.phase.prepare.status !== "done") {
    if (state.content_review.status !== "passed") {
      nextAction = {
        action: "review-content",
        reason: "Prepare data exists, but content review has not passed yet.",
        executor: "worker",
        command: `zzhub-pipeline review --state "${summary.state_path}" --status "{passed|needs_revision}"`,
        params: {
          state_path: summary.state_path,
          source_body_path: state.source_body_path ?? undefined,
          formatted_body_path: state.formatted_body_path ?? undefined,
          review_policy: state.handoff.review_policy,
          worker_profile: "editor",
          worker_mode: "review",
          required_inputs: ["review_status"],
          on_complete: "Review the content, then call the suggested command with --status passed or --status needs_revision, and re-run status.",
        },
      };
    } else {
      nextAction = {
        action: "prepare-finalize",
        reason: "Content review passed; task can be finalized into canonical assets.",
        executor: "cli",
        command:
          state.formatted_body_path
            ? `zzhub-pipeline prepare-finalize --state "${summary.state_path}"`
            : `zzhub-pipeline prepare-finalize --state "${summary.state_path}" --body "{formatted_body_path}"`,
        params: {
          state_path: summary.state_path,
          formatted_body_path: state.formatted_body_path ?? undefined,
          on_complete: "After the command succeeds, re-run status to confirm the phase advanced to render or publish.",
        },
      };
    }
  } else if (state.intent.requires.render && state.phase.render.status !== "done") {
    nextAction = {
      action: "render",
      reason: "Render phase is still pending.",
      executor: "cli",
      command: `zzhub-pipeline render --state "${summary.state_path}"`,
      params: {
        state_path: summary.state_path,
        on_complete: "After the command succeeds, re-run status to confirm the phase advanced to publish or done.",
      },
    };
  } else if (state.intent.requires.publish && state.phase.publish.status !== "done") {
    nextAction = {
      action: "publish",
      reason: "Publish phase is still pending.",
      executor: "cli",
      command: `zzhub-pipeline publish --state "${summary.state_path}"`,
      params: {
        state_path: summary.state_path,
        on_complete: "After the command succeeds, re-run status to confirm the task is complete. If publish fails, it stays retryable — re-run publish.",
      },
    };
  } else {
    nextAction = {
      action: "prepare",
      reason: "Task is active and should continue from the current phase.",
      executor: "cli",
      command: `zzhub-pipeline prepare --state "${summary.state_path}"`,
      params: {
        state_path: summary.state_path,
        on_complete: "After the command succeeds, re-run status to determine the next step.",
      },
    };
  }

  return {
    summary,
    state,
    validation: {
      phase_checked: phaseChecked,
      valid: validationErrors.length === 0,
      errors: validationErrors,
    },
    gaps,
    blockers,
    next_action: nextAction,
  };
}

async function walkFiles(
  root: string,
  matcher: (name: string) => boolean,
): Promise<string[]> {
  const matches: string[] = [];

  async function visit(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(fullPath);
        continue;
      }
      if (entry.isFile() && matcher(entry.name)) {
        matches.push(fullPath);
      }
    }
  }

  await visit(root);
  return matches;
}

function compareIsoDesc(a: string | null, b: string | null): number {
  if (a && b) {
    return b.localeCompare(a);
  }
  if (a) {
    return -1;
  }
  if (b) {
    return 1;
  }
  return 0;
}

function choosePreferredTask(a: ListedTask, b: ListedTask): ListedTask {
  const aCanonical = a.file_path === a.summary.state_path || a.source === "canonical";
  const bCanonical = b.file_path === b.summary.state_path || b.source === "canonical";
  if (aCanonical !== bCanonical) {
    return aCanonical ? a : b;
  }

  const byUpdated = compareIsoDesc(a.summary.updated_at, b.summary.updated_at);
  if (byUpdated !== 0) {
    return byUpdated < 0 ? a : b;
  }

  return a.file_path.localeCompare(b.file_path) <= 0 ? a : b;
}

export async function getTaskByStatePath(
  path: string,
  source: TaskFileSource = path.endsWith("workflow-state.json") ? "canonical" : "run",
): Promise<ListedTask> {
  const resolved = await readResolvedState(path);
  const state = resolved.state;
  const filePath = resolved.path;
  const resolvedSource = resolved.redirected
    ? (filePath.endsWith("workflow-state.json") ? "canonical" : "run")
    : source;
  await reconcileStateArtifacts(state);
  const createdAt = state.created_at || fallbackIsoFromRunId(state.run_id) || await fallbackIsoFromFile(filePath);
  const updatedAt = state.updated_at || createdAt || await fallbackIsoFromFile(filePath);
  const summary = summarizeState(state, filePath, resolvedSource, createdAt, updatedAt);
  return {
    file_path: filePath,
    source: resolvedSource,
    ...buildTaskStatus(summary, state),
  };
}

export async function listTasks(workspaceRoot?: string): Promise<ListedTask[]> {
  const config = loadConfig();
  const workspace = resolveWorkspaceRoot(workspaceRoot, config);
  const paths = resolveWorkspacePaths(workspace, config);
  const runRoot = join(workspace, ".zzhub-media", "runs");
  const runFiles = await walkFiles(runRoot, (name) => name.endsWith(".json")).catch(() => []);
  const canonicalFiles = await walkFiles(paths.postsRoot, (name) => name === "workflow-state.json");

  const candidates = [
    ...runFiles.filter((path) => path.endsWith(".json")),
    ...canonicalFiles,
  ];

  const byRunId = new Map<string, ListedTask>();
  for (const filePath of candidates) {
    try {
      const task = await getTaskByStatePath(
        filePath,
        filePath.endsWith("/workflow-state.json") ? "canonical" : "run",
      );
      const existing = byRunId.get(task.summary.run_id);
      byRunId.set(task.summary.run_id, existing ? choosePreferredTask(existing, task) : task);
    } catch {
      continue;
    }
  }

  return [...byRunId.values()].sort((a, b) => compareIsoDesc(a.summary.updated_at, b.summary.updated_at));
}

function isActiveTask(task: ListedTask): boolean {
  if (task.summary.phase.current === "done" || task.summary.phase.current === "failed") {
    return false;
  }
  return task.summary.mode === "active" || task.summary.mode === "handoff";
}

export async function findTask(workspaceRoot: string | undefined, filters: {
  run_id?: string;
  route?: string;
  account?: string;
  mode?: string;
  phase?: string;
  title_contains?: string;
  active_only?: boolean;
}): Promise<ListedTask | null> {
  const tasks = await listTasks(workspaceRoot);
  const filtered = tasks.filter((task) => {
    if (filters.run_id && task.summary.run_id !== filters.run_id) {
      return false;
    }
    if (filters.route && task.summary.route.primary !== filters.route) {
      return false;
    }
    if (filters.account && task.summary.route.account !== filters.account) {
      return false;
    }
    if (filters.mode) {
      if (task.summary.mode !== filters.mode) return false;
    } else {
      if (task.summary.mode === "abandoned") return false;
    }
    if (filters.phase && task.summary.phase.current !== filters.phase) {
      return false;
    }
    if (
      filters.title_contains &&
      !(task.summary.metadata.title || "").includes(filters.title_contains)
    ) {
      return false;
    }
    if (filters.active_only && !isActiveTask(task)) {
      return false;
    }
    return true;
  });

  if (filtered.length > 0) {
    return filtered[0];
  }

  if (!filters.run_id && !filters.route && !filters.account && !filters.mode && !filters.phase && !filters.title_contains && !filters.active_only) {
    const nonAbandoned = tasks.filter((t) => t.summary.mode !== "abandoned");
    return nonAbandoned.find((task) => isActiveTask(task)) ?? nonAbandoned[0] ?? null;
  }

  return null;
}

export function filterActiveTasks(tasks: ListedTask[]): ListedTask[] {
  return tasks.filter((task) => isActiveTask(task));
}
