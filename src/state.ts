/**
 * state.ts — TypeScript types and CRUD for workflow-state.json
 *
 * Authoritative source: state-contract.md
 * Design: body text never enters state; only recovery-essential facts are persisted.
 *
 * Types and validation are powered by Zod schemas in schema/state.ts.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";
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

/**
 * Read and parse a workflow state JSON file.
 * Throws if file doesn't exist or JSON is malformed.
 */
export async function readState(path: string): Promise<WorkflowState> {
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw);
  return WorkflowStateSchema.parse(parsed);
}

/**
 * Write workflow state to JSON file (pretty-printed).
 * Creates parent directories if needed.
 */
export async function writeState(
  path: string,
  state: WorkflowState,
): Promise<void> {
  const now = new Date().toISOString();
  if (!state.created_at) {
    state.created_at = now;
  }
  state.updated_at = now;
  await mkdir(dirname(path), { recursive: true });
  const json = JSON.stringify(state, null, 2) + "\n";
  await writeFile(path, json, "utf-8");
}

/**
 * Read state, apply a mutation function, write back.
 * Returns the updated state.
 */
export async function updateState(
  path: string,
  mutate: (state: WorkflowState) => void,
): Promise<WorkflowState> {
  const state = await readState(path);
  mutate(state);
  await writeState(path, state);
  return state;
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
  const publishRoutes = [state.route.primary, ...state.route.extras];
  const needsWechatArticle = publishRoutes.includes("wechat-article");

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
    if (
      state.route.primary !== "blog" &&
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
