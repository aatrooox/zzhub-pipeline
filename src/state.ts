/**
 * state.ts — TypeScript types and CRUD for workflow-state.json
 *
 * Authoritative source: state-contract.md
 * Design: body text never enters state; only recovery-essential facts are persisted.
 *
 * Types and validation are powered by Zod schemas in schema/state.ts.
 */

import { access, mkdir, open, readFile, rename, rm, stat, writeFile } from "fs/promises";
import { dirname, isAbsolute, resolve } from "path";
import {
  WorkflowStateSchema,
  NewspicRenderSpecSchema,
} from "./schema/state";

import type {
  WorkflowState,
  NewspicRenderSpec,
  PhaseName,
} from "./schema/state";

// ── Re-export types from schema ───────────────────────────────────

export type {
  Mode,
  PhaseName,
  PhaseStatus,
  PhaseEntry,
  Phase,
  TaskKind,
  ContentForm,
  ContentOrigin,
  Target,
  IntentRequires,
  Intent,
  NewspicPaginationMode,
  NewspicPageSpec,
  NewspicRenderSpec,
  RoutePrimary,
  AccountVisualParams,
  Route,
  StyleMode,
  Authoring,
  Metadata,
  Artifacts,
  ImagePlanStatus,
  ImagePlan,
  BodyInputScope,
  BodyInputStatus,
  BodyInputReceived,
  BodyInputs,
  RenderAssetKind,
  RenderAsset,
  Images,
  PublishResultStatus,
  PublishResult,
  PublishResults,
  PublishTarget,
  ContentReviewStatus,
  ContentReview,
  HandoffResearchPolicy,
  HandoffAuthoringPolicy,
  HandoffReviewPolicy,
  Handoff,
  WorkflowState,
} from "./schema/state";

export { WorkflowStateSchema, NewspicRenderSpecSchema } from "./schema/state";

// ── Defaults ──────────────────────────────────────────────────────

export function defaultState(): WorkflowState {
  return WorkflowStateSchema.parse({});
}

// Backward-compatible sub-defaults used by commands
const _defaults = defaultState();

export const defaultPhase = () => structuredClone(_defaults.phase);
export const defaultIntent = () => structuredClone(_defaults.intent);
export const defaultRoute = () => structuredClone(_defaults.route);
export const defaultAuthoring = () => structuredClone(_defaults.authoring);
export const defaultMetadata = () => structuredClone(_defaults.metadata);
export const defaultArtifacts = () => structuredClone(_defaults.artifacts);
export const defaultImagePlan = () => structuredClone(_defaults.images.plan);
export const defaultBodyInputs = () => structuredClone(_defaults.images.body_inputs);
export const defaultImages = () => structuredClone(_defaults.images);
export const defaultPublish = () => structuredClone(_defaults.publish);
export const defaultContentReview = () => structuredClone(_defaults.content_review);
export const defaultHandoff = () => structuredClone(_defaults.handoff);
export const defaultPhaseEntry = () => structuredClone(_defaults.phase.prepare);

export function defaultNewspicRenderSpec(): NewspicRenderSpec {
  return NewspicRenderSpecSchema.parse({});
}

// ── Normalize ─────────────────────────────────────────────────────

export function normalizeNewspicRenderSpec(raw: unknown): NewspicRenderSpec {
  return NewspicRenderSpecSchema.parse(raw ?? {});
}

// ── CRUD ──────────────────────────────────────────────────────────

const stateReadVersions = new WeakMap<WorkflowState, Map<string, string>>();
const heldOperationLocks = new Set<string>();
const OPERATION_LOCK_STALE_MS = 30 * 60_000;

function rememberStateVersion(
  state: WorkflowState,
  path: string,
  version: string,
): void {
  const versions = stateReadVersions.get(state) ?? new Map<string, string>();
  versions.set(resolve(path), version);
  stateReadVersions.set(state, versions);
}

async function acquireFileLock(
  lockPath: string,
  staleAfterMs: number,
): Promise<() => Promise<void>> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const handle = await open(lockPath, "wx", 0o600);
      return async () => {
        await handle.close();
        await rm(lockPath, { force: true });
      };
    } catch (error) {
      const code = error instanceof Error && "code" in error
        ? String((error as NodeJS.ErrnoException).code)
        : "";
      if (code !== "EEXIST") {
        throw error;
      }
      const lockStat = await stat(lockPath).catch(() => null);
      if (lockStat && Date.now() - lockStat.mtimeMs > staleAfterMs) {
        await rm(lockPath, { force: true });
        continue;
      }
      await new Promise((resolveWait) => setTimeout(resolveWait, 10));
    }
  }
  throw new Error(`Timed out waiting for lock: ${lockPath}`);
}

async function acquireStateWriteLock(path: string): Promise<() => Promise<void>> {
  return acquireFileLock(`${path}.lock`, 30_000);
}

export async function acquireStateOperationLock(
  path: string,
): Promise<() => Promise<void>> {
  const normalizedPath = resolve(path);
  const releaseOperationLock = await acquireFileLock(
    `${normalizedPath}.operation.lock`,
    OPERATION_LOCK_STALE_MS,
  );
  heldOperationLocks.add(normalizedPath);
  try {
    const releaseWriteLock = await acquireStateWriteLock(normalizedPath);
    await releaseWriteLock();
  } catch (error) {
    heldOperationLocks.delete(normalizedPath);
    await releaseOperationLock();
    throw error;
  }

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    heldOperationLocks.delete(normalizedPath);
    await releaseOperationLock();
  };
}

/**
 * Read and parse a workflow state JSON file.
 * Throws if file doesn't exist or JSON is malformed.
 */
export async function readState(path: string): Promise<WorkflowState> {
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw);
  const state = WorkflowStateSchema.parse(parsed);
  rememberStateVersion(state, path, state.updated_at);
  return state;
}

export interface ResolvedState {
  path: string;
  requested_path: string;
  redirected: boolean;
  state: WorkflowState;
}

/**
 * Follow state.state_path when a temporary run snapshot points at the
 * canonical workflow-state.json created by prepare-finalize.
 */
export async function readResolvedState(path: string): Promise<ResolvedState> {
  const requestedPath = resolve(path);
  let currentPath = requestedPath;
  let state = await readState(currentPath);
  const runId = state.run_id;
  const visited = new Set([currentPath]);

  while (state.state_path) {
    const nextPath = isAbsolute(state.state_path)
      ? resolve(state.state_path)
      : resolve(dirname(currentPath), state.state_path);
    if (nextPath === currentPath) {
      break;
    }
    if (visited.has(nextPath)) {
      throw new Error(`State path cycle detected: ${[...visited, nextPath].join(" -> ")}`);
    }

    try {
      await access(nextPath);
    } catch (error) {
      const code = error instanceof Error && "code" in error
        ? String((error as NodeJS.ErrnoException).code)
        : "";
      if (code === "ENOENT") {
        break;
      }
      throw error;
    }

    const nextState = await readState(nextPath);
    if (runId && nextState.run_id && nextState.run_id !== runId) {
      throw new Error(
        `State path run_id mismatch: ${runId} points to ${nextState.run_id}`,
      );
    }
    visited.add(nextPath);
    currentPath = nextPath;
    state = nextState;
  }

  if (!state.state_path) {
    state.state_path = currentPath;
  }

  return {
    path: currentPath,
    requested_path: requestedPath,
    redirected: currentPath !== requestedPath,
    state,
  };
}

/**
 * Write workflow state to JSON file (pretty-printed).
 * Creates parent directories if needed.
 */
export async function writeState(
  path: string,
  state: WorkflowState,
): Promise<void> {
  const currentUpdatedAt = Date.parse(state.updated_at);
  const nextTimestamp = Number.isFinite(currentUpdatedAt)
    ? Math.max(Date.now(), currentUpdatedAt + 1)
    : Date.now();
  const now = new Date(nextTimestamp).toISOString();
  if (!state.created_at) {
    state.created_at = now;
  }
  state.updated_at = now;
  const validated = WorkflowStateSchema.parse(state);
  const json = JSON.stringify(validated, null, 2) + "\n";
  const normalizedPath = resolve(path);
  await mkdir(dirname(normalizedPath), { recursive: true });
  const releaseLock = await acquireStateWriteLock(normalizedPath);
  const tempPath = `${normalizedPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    if (!heldOperationLocks.has(normalizedPath)) {
      const operationLockPath = `${normalizedPath}.operation.lock`;
      const operationLockStat = await stat(operationLockPath).catch(() => null);
      if (
        operationLockStat &&
        Date.now() - operationLockStat.mtimeMs > OPERATION_LOCK_STALE_MS
      ) {
        await rm(operationLockPath, { force: true });
      } else if (operationLockStat) {
        throw new Error(
          `State has another operation in progress: ${normalizedPath}`,
        );
      }
    }
    const expectedVersion = stateReadVersions.get(state)?.get(normalizedPath);
    if (expectedVersion !== undefined) {
      const currentRaw = await readFile(normalizedPath, "utf-8");
      const current = WorkflowStateSchema.parse(JSON.parse(currentRaw));
      if (current.updated_at !== expectedVersion) {
        throw new Error(
          `State changed since it was read: ${normalizedPath}. Re-run the command with fresh status.`,
        );
      }
    }
    await writeFile(tempPath, json, { encoding: "utf-8", mode: 0o600 });
    await rename(tempPath, normalizedPath);
    rememberStateVersion(state, normalizedPath, validated.updated_at);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    await releaseLock();
  }
}

/**
 * Read state, apply a mutation function, write back.
 * Returns the updated state.
 */
export async function updateState(
  path: string,
  mutate: (state: WorkflowState) => void,
): Promise<WorkflowState> {
  const resolved = await readResolvedState(path);
  const state = resolved.state;
  mutate(state);
  await writeState(resolved.path, state);
  return state;
}

export function reenterPrepare(
  state: WorkflowState,
  options: {
    redoHint?: string | null;
    resetReview?: boolean;
    clearFormattedBody?: boolean;
  } = {},
): void {
  state.mode = "active";
  state.phase.prepare = { status: "pending", error: null };
  state.phase.render = { status: "pending", error: null };
  state.phase.publish = { status: "pending", error: null };
  state.phase.current = "prepare";
  state.redo_hint = options.redoHint ?? null;
  if (options.resetReview) {
    state.content_review = defaultContentReview();
  }
  if (options.clearFormattedBody) {
    state.formatted_body_path = null;
  }
  state.images.plan = defaultImagePlan();
  state.images.render_assets = [];
}

export function reenterRender(state: WorkflowState): void {
  state.mode = "active";
  state.phase.render = { status: "pending", error: null };
  state.phase.publish = { status: "pending", error: null };
  state.phase.current = "render";
  state.redo_hint = null;
  state.images.render_assets = [];
  if (state.images.plan.needed) {
    state.images.plan.status = "planned";
  }
}

export function reenterPublish(state: WorkflowState): void {
  state.mode = "active";
  state.phase.publish = { status: "pending", error: null };
  state.phase.current = "publish";
  state.redo_hint = null;
}

/**
 * Put the workflow into handoff while a remote renderer produces images.
 * The render phase is marked "handoff" (a valid PhaseStatus) and the broker
 * job id is recorded so the result can be correlated on submission.
 */
export function waitForRemoteRender(state: WorkflowState, jobId: string): void {
  state.mode = "handoff";
  state.phase.render = { status: "handoff", error: null };
  state.phase.current = "render";
  state.render_job_id = jobId;
  state.redo_hint = null;
}

/**
 * Reset every derived artifact when the core inputs (body, title, route, intent,
 * explicit constraints) have changed. The run identity (run_id/workspace_root/
 * state_path) and the current title are preserved; everything produced by
 * prepare/render/publish is wiped so the workflow re-runs from prepare.
 *
 * Used by ingest-handoff resume when it detects an upstream input change.
 */
export function resetDerivedState(state: WorkflowState): void {
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

// ── Run ID ────────────────────────────────────────────────────────

/**
 * Generate a run ID in the format YYYYMMDD-HHmmss.
 */
export function generateRunId(): string {
  const now = new Date();
  const pad2 = (n: number) => String(n).padStart(2, "0");
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const h = pad2(now.getHours());
  const mi = pad2(now.getMinutes());
  const s = pad2(now.getSeconds());
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 6);
  return `${y}${m}${d}-${h}${mi}${s}-${random}`;
}

// ── Validation helpers ────────────────────────────────────────────

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate essential state fields for a given phase.
 * Returns an array of validation errors (empty = valid).
 */
export function validateForPhase(
  state: WorkflowState,
  phase: PhaseName,
): ValidationError[] {
  const errors: ValidationError[] = [];
  const publishRoutes = state.publish_targets.length > 0
    ? state.publish_targets.map((target) => target.route)
    : [state.route.primary, ...state.route.extras];
  const needsWechatArticle = publishRoutes.includes("wechat-article");
  const needsWechatNewspic = publishRoutes.includes("wechat-newspic");

  if (!state.run_id) {
    errors.push({ field: "run_id", message: "Missing run_id" });
  }
  if (!state.workspace_root) {
    errors.push({
      field: "workspace_root",
      message: "Missing workspace_root",
    });
  }

  if (phase === "render" || phase === "publish") {
    if (!state.asset_path) {
      errors.push({ field: "asset_path", message: "Missing asset_path" });
    }
    if (!state.state_path) {
      errors.push({ field: "state_path", message: "Missing state_path" });
    }
    if (!state.metadata.title) {
      errors.push({ field: "metadata.title", message: "Missing title" });
    }
    if (!state.metadata.slug) {
      errors.push({ field: "metadata.slug", message: "Missing slug" });
    }
    if (!state.metadata.date) {
      errors.push({ field: "metadata.date", message: "Missing date" });
    }
    if (!state.route.primary) {
      errors.push({
        field: "route.primary",
        message: "Missing primary route",
      });
    }
    if (state.content_review.status !== "passed") {
      errors.push({
        field: "content_review.status",
        message: `Content review must pass before ${phase}; current status is ${state.content_review.status}`,
      });
    }
  }

  if (phase === "publish") {
    if (state.intent.requires.render && state.phase.render.status !== "done") {
      errors.push({
        field: "phase.render.status",
        message: `Render phase must be done before publish; current status is ${state.phase.render.status}`,
      });
    }
    if (
      publishRoutes.some((route) => route !== "blog") &&
      state.images.plan.needed &&
      state.images.plan.status !== "rendered" &&
      state.images.plan.status !== "skipped"
    ) {
      errors.push({
        field: "images.plan.status",
        message: `Images needed but status is ${state.images.plan.status}`,
      });
    }
    if (
      needsWechatArticle &&
      state.images.body_inputs.scope === "article" &&
      state.images.body_inputs.status === "pending"
    ) {
      errors.push({
        field: "images.body_inputs.status",
        message: "Wechat article body images are still pending user input",
      });
    }
    if (
      state.images.plan.needed &&
      needsWechatArticle &&
      !state.images.render_assets.some(
        (asset) => asset.route === "wechat-article" && asset.kind === "cover",
      )
    ) {
      errors.push({
        field: "images.render_assets",
        message: "Wechat article cover asset is missing",
      });
    }
    if (
      state.images.plan.needed &&
      needsWechatNewspic &&
      !state.images.render_assets.some((asset) => asset.route === "wechat-newspic")
    ) {
      errors.push({
        field: "images.render_assets",
        message: "Wechat newspic render assets are missing",
      });
    }
  }

  return errors;
}

// ── State path helpers ────────────────────────────────────────────

/**
 * Get temporary run state path.
 */
export function getRunStatePath(workspaceRoot: string, runId: string): string {
  return `${workspaceRoot}/.zzhub-media/runs/${runId}.json`;
}

/**
 * Get canonical state path from asset path.
 */
export function getCanonicalStatePath(assetPath: string): string {
  return `${assetPath}/workflow-state.json`;
}
