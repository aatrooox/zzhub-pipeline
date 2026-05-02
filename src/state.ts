/**
 * state.ts — TypeScript types and CRUD for workflow-state.json
 *
 * Authoritative source: state-contract.md
 * Design: body text never enters state; only recovery-essential facts are persisted.
 */

import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname } from "path";

// ── Type definitions ──────────────────────────────────────────────

export type Mode = "active" | "handoff" | "done" | "failed" | "abandoned";

export type PhaseName = "prepare" | "render" | "publish" | "done" | "failed";

export type PhaseStatus = "pending" | "done" | "handoff" | "failed";

export interface PhaseEntry {
  status: PhaseStatus;
  error: string | null;
}

export interface Phase {
  current: PhaseName;
  prepare: PhaseEntry;
  render: PhaseEntry;
  publish: PhaseEntry;
}

export type TaskKind = "draft" | "polish" | "organize" | "publish" | "mixed";
export type ContentForm = "article" | "newspic" | "unknown";
export type ContentOrigin = "user" | "external" | "unknown";
export type Target = "wechat" | "blog";

export interface IntentRequires {
  research: boolean;
  style: boolean;
  render: boolean;
  publish: boolean;
}

export interface Intent {
  task_kind: TaskKind;
  content_form: ContentForm;
  targets: Target[];
  content_origin: ContentOrigin;
  intent_text: string | null;
  explicit_constraints: string[];
  style_hint: string | null;
  newspic_render: NewspicRenderSpec | null;
  requires: IntentRequires;
}

export type NewspicPaginationMode = "auto" | "single" | "multi";

export interface NewspicPageSpec {
  page: number;
  image_markers: string[];
  image_layout: string | null;
  target_fill_ratio: number | null;
  note: string | null;
}

export interface NewspicRenderSpec {
  pagination_mode: NewspicPaginationMode;
  min_pages: number;
  max_pages: number; // 0 = no upper limit
  require_image_every_page: boolean;
  default_image_layout: string;
  target_fill_ratio: number;
  page_specs: NewspicPageSpec[];
}

export type RoutePrimary = "wechat-article" | "wechat-newspic" | "blog";

export interface AccountVisualParams {
  footer: string;
  bg: string;
  highlight: string;
  fallback_icon: string;
}

export interface Route {
  primary: RoutePrimary;
  extras: RoutePrimary[];
  account: string;
  content_profile: string;
  account_visual_params: AccountVisualParams | null;
  highlight_words: string[];
}

export type StyleMode = "none" | "polish" | "deep_rewrite" | "fact_report";

export interface Authoring {
  rewrite_allowed: boolean;
  style_mode: StyleMode;
}

export interface Metadata {
  title: string;
  slug: string;
  date: string;
  description: string | null;
  tags: string[];
}

export interface Artifacts {
  content_version: number;
  render_version: number;
}

export type ImagePlanStatus = "planned" | "rendered" | "skipped";

export interface ImagePlan {
  needed: boolean;
  template: string | null;
  cover_template: string | null;
  cover_title: string | null;
  output_dir: string | null;
  preview_required: boolean;
  status: ImagePlanStatus;
}

export type BodyInputScope = "article" | "newspic-longform" | "none";
export type BodyInputStatus = "none" | "pending" | "ready";

export interface BodyInputReceived {
  marker: string;
  path: string;
}

export interface BodyInputs {
  scope: BodyInputScope;
  expected: number;
  received: BodyInputReceived[];
  status: BodyInputStatus;
  layout: string;
}

export type RenderAssetKind = "cover" | "page";

export interface RenderAsset {
  kind: RenderAssetKind;
  route: RoutePrimary;
  path: string;
  index?: number;
}

export interface Images {
  plan: ImagePlan;
  body_inputs: BodyInputs;
  render_assets: RenderAsset[];
}

export type PublishResultStatus = "success" | "handoff" | "skipped" | "failed";

export interface PublishResult {
  route: RoutePrimary;
  status: PublishResultStatus;
  detail: string | null;
  published_at: string | null;
  content_version: number;
  render_version: number;
}

export interface PublishResults {
  results: PublishResult[];
}

export type ContentReviewStatus =
  | "unchecked"
  | "passed"
  | "needs_revision";

export interface ContentReview {
  status: ContentReviewStatus;
  feedback: string | null;
}

export type HandoffResearchPolicy = "default" | "need" | "skip";
export type HandoffAuthoringPolicy =
  | "default"
  | "write"
  | "write_from_materials"
  | "revise"
  | "format_only";
export type HandoffReviewPolicy = "default" | "required" | "trust_user";

export interface Handoff {
  source_materials_path: string | null;
  research_policy: HandoffResearchPolicy;
  authoring_policy: HandoffAuthoringPolicy;
  review_policy: HandoffReviewPolicy;
}

export interface WorkflowState {
  run_id: string;
  created_at: string;
  updated_at: string;
  workspace_root: string;
  asset_path: string;
  state_path: string;
  source_body_path: string | null;
  formatted_body_path: string | null;
  handoff: Handoff;
  mode: Mode;
  phase: Phase;
  intent: Intent;
  route: Route;
  authoring: Authoring;
  metadata: Metadata;
  artifacts: Artifacts;
  images: Images;
  publish: PublishResults;
  content_review: ContentReview;
  /**
   * Set by `reset --mode redo.*` to indicate the starting step for the next
   * prepare sub-sequence. Cleared by `prepare-finalize` after assets are saved.
   * Values: "writer" | "style" | "format" | "asset-meta" | "channel-route" | null
   */
  redo_hint: string | null;
}

// ── Defaults ──────────────────────────────────────────────────────

export function defaultPhaseEntry(): PhaseEntry {
  return { status: "pending", error: null };
}

export function defaultPhase(): Phase {
  return {
    current: "prepare",
    prepare: defaultPhaseEntry(),
    render: defaultPhaseEntry(),
    publish: defaultPhaseEntry(),
  };
}

export function defaultIntent(): Intent {
  return {
    task_kind: "publish",
    content_form: "unknown",
    targets: [],
    content_origin: "unknown",
    intent_text: null,
    explicit_constraints: [],
    style_hint: null,
    newspic_render: null,
    requires: {
      research: false,
      style: false,
      render: false,
      publish: false,
    },
  };
}

export function defaultRoute(): Route {
  return {
    primary: "wechat-article",
    extras: [],
    account: "default",
    content_profile: "user",
    account_visual_params: null,
    highlight_words: [],
  };
}

export function defaultAuthoring(): Authoring {
  return {
    rewrite_allowed: false,
    style_mode: "none",
  };
}

export function defaultMetadata(): Metadata {
  return {
    title: "",
    slug: "",
    date: "",
    description: null,
    tags: [],
  };
}

export function defaultArtifacts(): Artifacts {
  return {
    content_version: 0,
    render_version: 0,
  };
}

export function defaultImagePlan(): ImagePlan {
  return {
    needed: false,
    template: null,
    cover_template: null,
    cover_title: null,
    output_dir: null,
    preview_required: false,
    status: "skipped",
  };
}

export function defaultBodyInputs(): BodyInputs {
  return {
    scope: "none",
    expected: 0,
    received: [],
    status: "none",
    layout: "staggered",
  };
}

export function defaultImages(): Images {
  return {
    plan: defaultImagePlan(),
    body_inputs: defaultBodyInputs(),
    render_assets: [],
  };
}

export function defaultPublish(): PublishResults {
  return { results: [] };
}

export function defaultContentReview(): ContentReview {
  return { status: "unchecked", feedback: null };
}

export function defaultHandoff(): Handoff {
  return {
    source_materials_path: null,
    research_policy: "default",
    authoring_policy: "default",
    review_policy: "default",
  };
}

export function defaultState(): WorkflowState {
  return {
    run_id: "",
    created_at: "",
    updated_at: "",
    workspace_root: "",
    asset_path: "",
    state_path: "",
    source_body_path: null,
    formatted_body_path: null,
    handoff: defaultHandoff(),
    mode: "active",
    phase: defaultPhase(),
    intent: defaultIntent(),
    route: defaultRoute(),
    authoring: defaultAuthoring(),
    metadata: defaultMetadata(),
    artifacts: defaultArtifacts(),
    images: defaultImages(),
    publish: defaultPublish(),
    content_review: defaultContentReview(),
    redo_hint: null,
  };
}

export function defaultNewspicRenderSpec(): NewspicRenderSpec {
  return {
    pagination_mode: "auto",
    min_pages: 1,
    max_pages: 0,
    require_image_every_page: false,
    default_image_layout: "staggered",
    target_fill_ratio: 0.8,
    page_specs: [],
  };
}

export function normalizeNewspicRenderSpec(raw: unknown): NewspicRenderSpec {
  const defaults = defaultNewspicRenderSpec();
  if (!raw || typeof raw !== "object") {
    return defaults;
  }

  const input = raw as Record<string, unknown>;
  const paginationMode =
    input.pagination_mode === "single" ||
    input.pagination_mode === "multi" ||
    input.pagination_mode === "auto"
      ? input.pagination_mode
      : defaults.pagination_mode;

  const minPagesRaw =
    typeof input.min_pages === "number"
      ? input.min_pages
      : typeof input.min_pages === "string"
        ? Number.parseInt(input.min_pages, 10)
        : defaults.min_pages;
  const minPages = Number.isFinite(minPagesRaw)
    ? Math.max(1, Math.floor(minPagesRaw))
    : defaults.min_pages;

  const maxPagesRaw =
    typeof input.max_pages === "number"
      ? input.max_pages
      : typeof input.max_pages === "string"
        ? Number.parseInt(input.max_pages, 10)
        : defaults.max_pages;
  const maxPages = Number.isFinite(maxPagesRaw) ? Math.max(0, Math.floor(maxPagesRaw)) : defaults.max_pages;

  const defaultImageLayout =
    typeof input.default_image_layout === "string" && input.default_image_layout.trim().length > 0
      ? input.default_image_layout.trim()
      : defaults.default_image_layout;

  const targetFillRatioRaw =
    typeof input.target_fill_ratio === "number"
      ? input.target_fill_ratio
      : typeof input.target_fill_ratio === "string"
        ? Number.parseFloat(input.target_fill_ratio)
        : defaults.target_fill_ratio;
  const targetFillRatio = Number.isFinite(targetFillRatioRaw)
    ? Math.min(0.95, Math.max(0.35, targetFillRatioRaw))
    : defaults.target_fill_ratio;

  const pageSpecs = Array.isArray(input.page_specs)
    ? input.page_specs
        .map((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }
          const pageInput = item as Record<string, unknown>;
          const pageRaw =
            typeof pageInput.page === "number"
              ? pageInput.page
              : typeof pageInput.page === "string"
                ? Number.parseInt(pageInput.page, 10)
                : NaN;
          if (!Number.isFinite(pageRaw) || pageRaw < 1) {
            return null;
          }
          const imageMarkers = Array.isArray(pageInput.image_markers)
            ? pageInput.image_markers
                .filter((value): value is string => typeof value === "string")
                .map((value) => value.trim())
                .filter(Boolean)
            : [];
          const pageTargetFillRatioRaw =
            typeof pageInput.target_fill_ratio === "number"
              ? pageInput.target_fill_ratio
              : typeof pageInput.target_fill_ratio === "string"
                ? Number.parseFloat(pageInput.target_fill_ratio)
                : NaN;
          return {
            page: Math.floor(pageRaw),
            image_markers: imageMarkers,
            image_layout:
              typeof pageInput.image_layout === "string" && pageInput.image_layout.trim().length > 0
                ? pageInput.image_layout.trim()
                : null,
            target_fill_ratio: Number.isFinite(pageTargetFillRatioRaw)
              ? Math.min(0.95, Math.max(0.35, pageTargetFillRatioRaw))
              : null,
            note:
              typeof pageInput.note === "string" && pageInput.note.trim().length > 0
                ? pageInput.note.trim()
                : null,
          } satisfies NewspicPageSpec;
        })
        .filter((item): item is NewspicPageSpec => item !== null)
        .sort((a, b) => a.page - b.page)
    : defaults.page_specs;

  return {
    pagination_mode: paginationMode,
    min_pages: minPages,
    max_pages: maxPages,
    require_image_every_page: input.require_image_every_page === true || input.require_image_every_page === "true",
    default_image_layout: defaultImageLayout,
    target_fill_ratio: targetFillRatio,
    page_specs: pageSpecs,
  };
}

// ── CRUD ──────────────────────────────────────────────────────────

/**
 * Read and parse a workflow state JSON file.
 * Throws if file doesn't exist or JSON is malformed.
 */
export async function readState(path: string): Promise<WorkflowState> {
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw);
  const defaultIntentValue = defaultIntent();
  const defaultHandoffValue = defaultHandoff();
  const state = {
    ...defaultState(),
    ...parsed,
    handoff: {
      ...defaultHandoffValue,
      ...(parsed.handoff ?? {}),
    },
    intent: {
      ...defaultIntentValue,
      ...(parsed.intent ?? {}),
      requires: {
        ...defaultIntentValue.requires,
        ...(parsed.intent?.requires ?? {}),
      },
    },
  } as WorkflowState;
  state.created_at = typeof state.created_at === "string" ? state.created_at : "";
  state.updated_at = typeof state.updated_at === "string" ? state.updated_at : state.created_at;
  state.formatted_body_path =
    typeof state.formatted_body_path === "string" && state.formatted_body_path.trim().length > 0
      ? state.formatted_body_path
      : null;
  state.handoff.source_materials_path =
    typeof state.handoff.source_materials_path === "string" &&
    state.handoff.source_materials_path.trim().length > 0
      ? state.handoff.source_materials_path
      : null;
  state.handoff.research_policy =
    state.handoff.research_policy === "need" || state.handoff.research_policy === "skip"
      ? state.handoff.research_policy
      : "default";
  state.handoff.authoring_policy =
    state.handoff.authoring_policy === "write" ||
    state.handoff.authoring_policy === "write_from_materials" ||
    state.handoff.authoring_policy === "revise" ||
    state.handoff.authoring_policy === "format_only"
      ? state.handoff.authoring_policy
      : "default";
  state.handoff.review_policy =
    state.handoff.review_policy === "required" || state.handoff.review_policy === "trust_user"
      ? state.handoff.review_policy
      : "default";
  state.intent.intent_text =
    typeof state.intent.intent_text === "string" && state.intent.intent_text.trim().length > 0
      ? state.intent.intent_text
      : null;
  state.intent.explicit_constraints = Array.isArray(state.intent.explicit_constraints)
    ? state.intent.explicit_constraints.filter(
        (item): item is string => typeof item === "string" && item.trim().length > 0,
      )
    : [];
  return state;
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
