/**
 * profiles.ts — Author selection decision tree
 *
 * Replaces the older LLM-based author-selection step with deterministic rules.
 * Deterministic rules for rewrite_allowed and style_mode.
 */

import type {
  ContentOrigin,
  Authoring,
} from "./state";

// ── Decision tree ─────────────────────────────────────────────────

/**
 * Resolve authoring rules based on content_origin, style_hint, and user signals.
 *
 * Decision table used by prepare/orchestrator:
 *
 * | content_origin | user signal            | rewrite_allowed | style_mode    |
 * |---------------|------------------------|-----------------|---------------|
 * | user          | 润色/改一下/按我风格    | yes             | polish        |
 * | user          | no style request       | no              | none          |
 * | external      | any                    | yes (forced)    | deep_rewrite  |
 * | user          | style_hint=fact_report | yes             | fact_report   |
 * | external      | style_hint=fact_report | yes             | fact_report   |
 * | unknown       | —                      | ERROR           | ERROR         |
 */
export function resolveAuthoring(params: {
  contentOrigin: ContentOrigin;
  styleHint: string | null;
  hasStyleRequest: boolean;
}): Authoring {
  const { contentOrigin, styleHint, hasStyleRequest } = params;

  // fact_report overrides everything when explicitly requested
  if (styleHint === "fact_report") {
    return {
      rewrite_allowed: true,
      style_mode: "fact_report",
    };
  }

  // external content always requires deep_rewrite
  if (contentOrigin === "external") {
    return {
      rewrite_allowed: true,
      style_mode: "deep_rewrite",
    };
  }

  // user content with explicit style request
  if (contentOrigin === "user" && hasStyleRequest) {
    return {
      rewrite_allowed: true,
      style_mode: "polish",
    };
  }

  // user content without style request
  if (contentOrigin === "user") {
    return {
      rewrite_allowed: false,
      style_mode: "none",
    };
  }

  // unknown content_origin — should not proceed
  // Caller (orchestrator) must confirm with user first
  throw new Error(
    "content_origin is unknown; orchestrator must confirm ownership before prepare",
  );
}

// ── Style request detection ───────────────────────────────────────

/**
 * Check if user text contains a style processing request.
 * Keywords: 润色, 改一下, 用我的口吻, 按我的风格, etc.
 */
const STYLE_KEYWORDS = [
  "润色",
  "改一下",
  "用我的口吻",
  "按我的风格",
  "用我的写法",
  "改写",
  "重写",
  "转成我的风格",
];

export function hasStyleRequest(text: string): boolean {
  return STYLE_KEYWORDS.some((kw) => text.includes(kw));
}

// ── Profile path resolution ───────────────────────────────────────

/**
 * Resolve the rules profile path for a content_profile name.
 * These are the constraint files loaded by the style skill.
 */
const PROFILE_PATHS: Record<string, string> = {
  user: "zzhub-media-style/references/user-profile.md",
  storytelling: "zzhub-media-style/references/storytelling-profile.md",
};

export function getProfilePath(
  contentProfile: string,
): string | null {
  return PROFILE_PATHS[contentProfile] ?? null;
}

// ── Requires derivation ───────────────────────────────────────────

/**
 * Derive intent.requires flags from intent fields.
 *
 * Rules (from orchestrator prompt):
 * - research: user asked "先搜/查资料" or material insufficient
 * - style: content_origin=external OR style_hint=fact_report OR style request
 * - render: content_form=newspic OR route.primary=wechat-article
 * - publish: task_kind=publish
 */
export function deriveRequires(params: {
  taskKind: string;
  contentForm: string;
  contentOrigin: ContentOrigin;
  styleHint: string | null;
  routePrimary: string;
  hasResearchRequest: boolean;
  hasStyleRequest: boolean;
}): {
  research: boolean;
  style: boolean;
  render: boolean;
  publish: boolean;
} {
  return {
    research: params.hasResearchRequest,
    style:
      params.contentOrigin === "external" ||
      params.styleHint === "fact_report" ||
      params.hasStyleRequest,
    render:
      params.contentForm === "newspic" ||
      params.routePrimary === "wechat-article",
    publish: params.taskKind === "publish",
  };
}
