/**
 * Zod schemas for WorkflowState.
 *
 * Replaces hand-written interfaces + normalize functions + default functions.
 * - Schema.parse({}) → valid default state
 * - Schema.parse(unknownInput) → normalized state
 * - z.infer<typeof Schema> → TS type
 */

import { z } from "zod";

// ── Helpers ───────────────────────────────────────────────────────

/** Coerce string/number to int, with fallback */
const intFromUnknown = (fallback: number) =>
  z.preprocess((val) => {
    if (typeof val === "number" && Number.isFinite(val)) return Math.floor(val);
    if (typeof val === "string") {
      const n = Number.parseInt(val, 10);
      return Number.isFinite(n) ? n : undefined;
    }
    return undefined;
  }, z.number().int().default(fallback));

/** Trimmed non-empty string, or null if empty/whitespace */
const trimmedStringOrNull = z.preprocess(
  (val) => {
    if (typeof val === "string") {
      const trimmed = val.trim();
      return trimmed.length > 0 ? trimmed : null;
    }
    return val;
  },
  z.string().nullable().default(null),
);

/** Trimmed string with fallback */
const trimmedString = (fallback: string) =>
  z.preprocess(
    (val) => (typeof val === "string" && val.trim().length > 0 ? val.trim() : undefined),
    z.string().default(fallback),
  );

/** Coerce "true" string to boolean */
const booleanLike = z.preprocess(
  (val) => val === true || val === "true",
  z.boolean().default(false),
);

/**
 * Make an object schema accept undefined/missing input, filling in the
 * schema's own default (i.e. all fields with their defaults applied).
 * Works in Zod 4 where preprocess doesn't run for missing fields.
 */
function withObjectDefault<T extends z.ZodObject<any>>(schema: T) {
  // All fields in the schema have defaults, so parse({}) always succeeds.
  return schema.optional().default(() => schema.parse({}) as any);
}

// ── Enums ─────────────────────────────────────────────────────────

const ModeSchema = z.enum(["active", "handoff", "done", "failed", "abandoned"]).default("active");

const PhaseNameSchema = z.enum(["prepare", "render", "publish", "done", "failed"]).default("prepare");

const PhaseStatusSchema = z.enum(["pending", "done", "handoff", "failed"]).default("pending");

const TaskKindSchema = z.enum(["draft", "polish", "organize", "publish", "mixed"]).default("publish");

const ContentFormSchema = z.enum(["article", "newspic", "unknown"]).default("unknown");

const ContentOriginSchema = z.enum(["user", "external", "unknown"]).default("unknown");

const TargetSchema = z.enum(["wechat", "blog"]);

const RoutePrimarySchema = z.enum(["wechat-article", "wechat-newspic", "blog"]).default("wechat-article");

const StyleModeSchema = z.enum(["none", "polish", "deep_rewrite", "fact_report"]).default("none");

const ImagePlanStatusSchema = z.enum(["planned", "rendered", "skipped"]).default("skipped");

const BodyInputScopeSchema = z.enum(["article", "newspic-longform", "none"]).default("none");

const BodyInputStatusSchema = z.enum(["none", "pending", "ready"]).default("none");

const RenderAssetKindSchema = z.enum(["cover", "page"]);

const PublishResultStatusSchema = z.enum(["success", "handoff", "skipped", "failed"]);

const ContentReviewStatusSchema = z.enum(["unchecked", "passed", "needs_revision"]).default("unchecked");

const HandoffResearchPolicySchema = z.enum(["default", "need", "skip"]).default("default");

const HandoffAuthoringPolicySchema = z
  .enum(["default", "write", "write_from_materials", "revise", "format_only"])
  .default("default");

const HandoffReviewPolicySchema = z.enum(["default", "required", "trust_user"]).default("default");

const NewspicPaginationModeSchema = z.enum(["auto", "single", "multi"]).default("single");

// ── Sub-schemas ───────────────────────────────────────────────────

const PhaseEntrySchema = withObjectDefault(
  z.object({
    status: PhaseStatusSchema,
    error: z.string().nullable().default(null),
  }),
);

const PhaseSchema = withObjectDefault(
  z.object({
    current: PhaseNameSchema,
    prepare: PhaseEntrySchema,
    render: PhaseEntrySchema,
    publish: PhaseEntrySchema,
  }),
);

const IntentRequiresSchema = withObjectDefault(
  z.object({
    research: z.boolean().default(false),
    style: z.boolean().default(false),
    render: z.boolean().default(false),
    publish: z.boolean().default(false),
  }),
);

const NewspicPageSpecSchema = z.object({
  page: intFromUnknown(1).pipe(z.number().min(1)),
  image_markers: z
    .array(z.string())
    .default([])
    .transform((arr) =>
      arr
        .map((s) => s.trim())
        .filter(Boolean),
    ),
  image_layout: trimmedStringOrNull,
  target_fill_ratio: z.preprocess(
    (val) => {
      if (typeof val === "number" && Number.isFinite(val)) return Math.min(0.95, Math.max(0.35, val));
      if (typeof val === "string") {
        const n = Number.parseFloat(val);
        return Number.isFinite(n) ? Math.min(0.95, Math.max(0.35, n)) : null;
      }
      return null;
    },
    z.number().nullable().default(null),
  ),
  note: trimmedStringOrNull,
});

export const NewspicRenderSpecSchema = z.object({
  pagination_mode: NewspicPaginationModeSchema,
  min_pages: intFromUnknown(1).pipe(z.number().min(1)),
  max_pages: intFromUnknown(0).pipe(z.number().min(0)),
  require_image_every_page: booleanLike,
  default_image_layout: trimmedString("staggered"),
  target_fill_ratio: z.preprocess(
    (val) => {
      if (typeof val === "number" && Number.isFinite(val)) return Math.min(0.95, Math.max(0.35, val));
      if (typeof val === "string") {
        const n = Number.parseFloat(val);
        return Number.isFinite(n) ? Math.min(0.95, Math.max(0.35, n)) : undefined;
      }
      return undefined;
    },
    z.number().default(0.8),
  ),
  page_specs: z
    .array(NewspicPageSpecSchema)
    .default([])
    .transform((arr) => [...arr].sort((a, b) => a.page - b.page)),
});

const AccountVisualParamsSchema = z.object({
  footer: z.string().default(""),
  bg: z.string().default(""),
  highlight: z.string().default(""),
  fallback_icon: z.string().default(""),
});

const RouteSchema = withObjectDefault(
  z.object({
    primary: RoutePrimarySchema,
    extras: z.array(RoutePrimarySchema).default([]),
    account: trimmedString("default"),
    content_profile: trimmedString("user"),
    account_visual_params: AccountVisualParamsSchema.nullable().default(null),
    highlight_words: z.array(z.string()).default([]),
  }),
);

const AuthoringSchema = withObjectDefault(
  z.object({
    rewrite_allowed: z.boolean().default(false),
    style_mode: StyleModeSchema,
  }),
);

const MetadataSchema = withObjectDefault(
  z.object({
    title: z.string().default(""),
    slug: z.string().default(""),
    date: z.string().default(""),
    description: z.string().nullable().default(null),
    tags: z.array(z.string()).default([]),
  }),
);

const ArtifactsSchema = withObjectDefault(
  z.object({
    content_version: z.number().int().default(0),
    render_version: z.number().int().default(0),
  }),
);

const ImagePlanSchema = withObjectDefault(
  z.object({
    needed: z.boolean().default(false),
    template: z.string().nullable().default(null),
    cover_template: z.string().nullable().default(null),
    cover_title: z.string().nullable().default(null),
    output_dir: z.string().nullable().default(null),
    preview_required: z.boolean().default(false),
    status: ImagePlanStatusSchema,
  }),
);

const BodyInputReceivedSchema = z.object({
  marker: z.string().default(""),
  path: z.string().default(""),
});

const BodyInputsSchema = withObjectDefault(
  z.object({
    scope: BodyInputScopeSchema,
    expected: z.number().int().default(0),
    received: z.array(BodyInputReceivedSchema).default([]),
    status: BodyInputStatusSchema,
    layout: trimmedString("staggered"),
  }),
);

const RenderAssetSchema = z.object({
  kind: RenderAssetKindSchema,
  route: RoutePrimarySchema,
  path: z.string().default(""),
  index: z.number().int().optional(),
});

const ImagesSchema = withObjectDefault(
  z.object({
    plan: ImagePlanSchema,
    body_inputs: BodyInputsSchema,
    render_assets: z.array(RenderAssetSchema).default([]),
  }),
);

const PublishResultSchema = z.object({
  route: RoutePrimarySchema,
  status: PublishResultStatusSchema,
  detail: z.string().nullable().default(null),
  published_at: z.string().nullable().default(null),
  content_version: z.number().int().default(0),
  render_version: z.number().int().default(0),
});

const PublishResultsSchema = withObjectDefault(
  z.object({
    results: z.array(PublishResultSchema).default([]),
  }),
);

const ContentReviewSchema = withObjectDefault(
  z.object({
    status: ContentReviewStatusSchema,
    feedback: z.string().nullable().default(null),
  }),
);

const HandoffSchema = withObjectDefault(
  z.object({
    source_materials_path: trimmedStringOrNull,
    research_policy: HandoffResearchPolicySchema,
    authoring_policy: HandoffAuthoringPolicySchema,
    review_policy: HandoffReviewPolicySchema,
  }),
);

const IntentSchema = withObjectDefault(
  z.object({
    task_kind: TaskKindSchema,
    content_form: ContentFormSchema,
    targets: z.array(TargetSchema).default([]),
    content_origin: ContentOriginSchema,
    intent_text: trimmedStringOrNull,
    explicit_constraints: z
      .array(z.string())
      .default([])
      .transform((arr) => arr.filter((s) => s.trim().length > 0)),
    style_hint: z.string().nullable().default(null),
    newspic_render: NewspicRenderSpecSchema.nullable().default(null),
    requires: IntentRequiresSchema,
    existing_draft_media_id: z.string().nullable().default(null),
    note_id: z.string().nullable().default(null),
  }),
);

// ── Top-level schema ──────────────────────────────────────────────

export const WorkflowStateSchema = z.object({
  run_id: z.string().default(""),
  created_at: z.string().default(""),
  updated_at: z.string().default(""),
  workspace_root: z.string().default(""),
  asset_path: z.string().default(""),
  state_path: z.string().default(""),
  source_body_path: z.string().nullable().default(null),
  formatted_body_path: trimmedStringOrNull,
  handoff: HandoffSchema,
  mode: ModeSchema,
  phase: PhaseSchema,
  intent: IntentSchema,
  route: RouteSchema,
  authoring: AuthoringSchema,
  metadata: MetadataSchema,
  artifacts: ArtifactsSchema,
  images: ImagesSchema,
  publish: PublishResultsSchema,
  content_review: ContentReviewSchema,
  redo_hint: z.string().nullable().default(null),
});

export type WorkflowState = z.infer<typeof WorkflowStateSchema>;

// ── Sub-type exports ──────────────────────────────────────────────

export type Mode = z.infer<typeof ModeSchema>;
export type PhaseName = z.infer<typeof PhaseNameSchema>;
export type PhaseStatus = z.infer<typeof PhaseStatusSchema>;
export type PhaseEntry = z.infer<typeof PhaseEntrySchema>;
export type Phase = z.infer<typeof PhaseSchema>;
export type TaskKind = z.infer<typeof TaskKindSchema>;
export type ContentForm = z.infer<typeof ContentFormSchema>;
export type ContentOrigin = z.infer<typeof ContentOriginSchema>;
export type Target = z.infer<typeof TargetSchema>;
export type IntentRequires = z.infer<typeof IntentRequiresSchema>;
export type Intent = z.infer<typeof IntentSchema>;
export type NewspicPaginationMode = z.infer<typeof NewspicPaginationModeSchema>;
export type NewspicPageSpec = z.infer<typeof NewspicPageSpecSchema>;
export type NewspicRenderSpec = z.infer<typeof NewspicRenderSpecSchema>;
export type RoutePrimary = z.infer<typeof RoutePrimarySchema>;
export type AccountVisualParams = z.infer<typeof AccountVisualParamsSchema>;
export type Route = z.infer<typeof RouteSchema>;
export type StyleMode = z.infer<typeof StyleModeSchema>;
export type Authoring = z.infer<typeof AuthoringSchema>;
export type Metadata = z.infer<typeof MetadataSchema>;
export type Artifacts = z.infer<typeof ArtifactsSchema>;
export type ImagePlanStatus = z.infer<typeof ImagePlanStatusSchema>;
export type ImagePlan = z.infer<typeof ImagePlanSchema>;
export type BodyInputScope = z.infer<typeof BodyInputScopeSchema>;
export type BodyInputStatus = z.infer<typeof BodyInputStatusSchema>;
export type BodyInputReceived = z.infer<typeof BodyInputReceivedSchema>;
export type BodyInputs = z.infer<typeof BodyInputsSchema>;
export type RenderAssetKind = z.infer<typeof RenderAssetKindSchema>;
export type RenderAsset = z.infer<typeof RenderAssetSchema>;
export type Images = z.infer<typeof ImagesSchema>;
export type PublishResultStatus = z.infer<typeof PublishResultStatusSchema>;
export type PublishResult = z.infer<typeof PublishResultSchema>;
export type PublishResults = z.infer<typeof PublishResultsSchema>;
export type ContentReviewStatus = z.infer<typeof ContentReviewStatusSchema>;
export type ContentReview = z.infer<typeof ContentReviewSchema>;
export type HandoffResearchPolicy = z.infer<typeof HandoffResearchPolicySchema>;
export type HandoffAuthoringPolicy = z.infer<typeof HandoffAuthoringPolicySchema>;
export type HandoffReviewPolicy = z.infer<typeof HandoffReviewPolicySchema>;
export type Handoff = z.infer<typeof HandoffSchema>;
