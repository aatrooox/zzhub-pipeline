/**
 * routes.ts — Channel routing table
 *
 * Replaces the LLM-based zzhub-media-channel-route skill.
 * All routing rules are deterministic lookup tables.
 */

import type {
  RoutePrimary,
  ContentForm,
  AccountVisualParams,
  Route,
  Target,
} from "./state";
import type { PipelineConfig } from "./config";
import { loadConfig } from "./config";

// ── Route keyword matching ────────────────────────────────────────

/**
 * Route keyword patterns.
 * Each entry maps user-facing keywords to a primary route.
 */
const ROUTE_PATTERNS: { keywords: string[]; route: RoutePrimary }[] = [
  {
    keywords: [
      "公众号文章",
      "公众号草稿箱",
      "草稿箱",
      "wechat-article",
      "微信文章",
    ],
    route: "wechat-article",
  },
  {
    keywords: [
      "小绿书",
      "newspic",
      "贴图",
      "公众号贴图",
      "wechat-newspic",
    ],
    route: "wechat-newspic",
  },
];

function isAmbiguousPublicRouteIntent(intentText: string): boolean {
  const text = intentText.toLowerCase();
  return (
    text.includes("公众号") &&
    !text.includes("文章") &&
    !text.includes("贴图") &&
    !text.includes("草稿") &&
    !text.includes("newspic") &&
    !text.includes("小绿书")
  );
}

/**
 * Resolve primary route from user intent text.
 * Returns null if ambiguous (e.g. just "发公众号" without specifying article vs newspic).
 */
export function resolveRoute(intentText: string): RoutePrimary | null {
  const text = intentText.toLowerCase();

  for (const { keywords, route } of ROUTE_PATTERNS) {
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) {
        return route;
      }
    }
  }

  // "发公众号" alone is ambiguous — could be article or newspic
  if (isAmbiguousPublicRouteIntent(text)) {
    return null; // Ambiguous
  }

  return null;
}

// ── Account resolution ────────────────────────────────────────────

/**
 * Account keyword patterns.
 */
const ACCOUNT_PATTERNS: { keywords: string[]; account: string }[] = [
  {
    keywords: ["大号", "早早集市", "default"],
    account: "default",
  },
  {
    keywords: ["古一", "小号", "ancientone", "storytelling", "story"],
    account: "ancientone",
  },
];

/**
 * Resolve account from user intent text.
 * Returns "default" if no explicit account specified.
 */
export function resolveAccount(intentText: string): string {
  const text = intentText.toLowerCase();

  for (const { keywords, account } of ACCOUNT_PATTERNS) {
    for (const kw of keywords) {
      if (text.toLowerCase().includes(kw.toLowerCase())) {
        return account;
      }
    }
  }

  return "default";
}

// ── Content profile registry ──────────────────────────────────────

/**
 * Account -> content profile mapping.
 */
const CONTENT_PROFILES: Record<string, string> = {
  default: "user",
  ancientone: "storytelling",
};

/**
 * Get content profile for an account.
 */
export function getContentProfile(account: string): string {
  return CONTENT_PROFILES[account] ?? "none";
}

// ── Account visual params registry ────────────────────────────────

/**
 * Account visual parameters for imgx rendering.
 * Only used by poster-3-4 template (newspic).
 * wechat-cover-split uses its own color scheme.
 */
const VISUAL_PARAMS: Record<string, AccountVisualParams> = {
  default: {
    footer: "公众号 · 早早集市",
    bg: "#e6f5ef",
    highlight: "#22a854",
    fallback_icon: "assets/icons/logo.png",
  },
  ancientone: {
    footer: "公众号 · 古一软件",
    bg: "#faf5f8",
    highlight: "#ca6093",
    fallback_icon: "assets/icons/ancientone-logo.png",
  },
};

/**
 * Get visual params for an account.
 * If config.imgx.icon is set, it overrides the default fallback_icon.
 * Returns null if account not found.
 */
export function getVisualParams(
  account: string,
  config?: PipelineConfig,
): AccountVisualParams | null {
  const base = VISUAL_PARAMS[account] ?? null;
  if (!base) return null;
  if (config?.imgx?.icon) {
    return { ...base, fallback_icon: config.imgx.icon };
  }
  return base;
}

// ── Theme registry (for longform-3-4) ─────────────────────────────

const LONGFORM_THEMES: Record<string, string> = {
  default: "paper-sage",
  ancientone: "linen-news",
};

/**
 * Get longform-3-4 theme for an account.
 */
export function getLongformTheme(account: string): string {
  return LONGFORM_THEMES[account] ?? "paper-sage";
}

// ── Content-form → route mapping ──────────────────────────────────

/**
 * Derive primary route from content_form when keyword matching fails.
 * Returns null for "unknown" — caller should fall back to default.
 */
const CONTENT_FORM_ROUTE: Record<ContentForm, RoutePrimary | null> = {
  article: "wechat-article",
  newspic: "wechat-newspic",
  unknown: null,
};

export function routeFromContentForm(form: ContentForm): RoutePrimary | null {
  return CONTENT_FORM_ROUTE[form] ?? null;
}

export function routePlanFromTargets(
  form: ContentForm,
  targets: Target[],
): { primary: RoutePrimary; extras: RoutePrimary[] } | null {
  const uniqueTargets = [...new Set(targets)];
  const wantsWechat = uniqueTargets.includes("wechat");
  const wantsBlog = uniqueTargets.includes("blog");

  if (form === "article") {
    if (wantsWechat) {
      return {
        primary: "wechat-article",
        extras: wantsBlog ? ["blog"] : [],
      };
    }
  }

  if (form === "newspic" && wantsWechat) {
    return {
      primary: "wechat-newspic",
      extras: wantsBlog ? ["blog"] : [],
    };
  }

  if (wantsBlog) {
    return {
      primary: "blog",
      extras: [],
    };
  }

  return null;
}

// ── Full route resolution ─────────────────────────────────────────

/**
 * Resolve the complete Route object from intent text and explicit overrides.
 * highlight_words are NOT set here — they come from prepare-finalize after title is known.
 *
 * Fallback chain for primary route:
 *   1. Explicit --route override
 *   2. Keyword matching from intent text
 *   3. content_form from state (article→wechat-article, newspic→wechat-newspic)
 *   4. Default: "wechat-article"
 */
export function resolveFullRoute(
  intentText: string,
  overrides?: {
    primary?: RoutePrimary;
    extras?: RoutePrimary[];
    account?: string;
    contentForm?: ContentForm;
    targets?: Target[];
  },
  config?: PipelineConfig,
): Route {
  const resolvedConfig = config ?? loadConfig();
  const routeFromIntent = resolveRoute(intentText);
  const routePlan = overrides?.contentForm && overrides?.targets
    ? routePlanFromTargets(overrides.contentForm, overrides.targets)
    : null;
  const routeFromForm = overrides?.contentForm
    ? routeFromContentForm(overrides.contentForm)
    : null;

  let primary =
    overrides?.primary ??
    routeFromIntent ??
    routePlan?.primary ??
    routeFromForm;
  if (!primary) {
    if (intentText.trim() && isAmbiguousPublicRouteIntent(intentText)) {
      throw new Error(
        "Ambiguous route: user requested 公众号 but did not specify article or newspic",
      );
    }
    throw new Error(
      "Unable to resolve route from intent or content_form; orchestrator must classify first",
    );
  }
  const account = overrides?.account ?? resolveAccount(intentText);
  const contentProfile = getContentProfile(account);
  const visualParams = getVisualParams(account, resolvedConfig);

  return {
    primary,
    extras: overrides?.extras ?? routePlan?.extras ?? [],
    account,
    content_profile: contentProfile,
    account_visual_params: visualParams,
    highlight_words: [], // Set later by prepare-finalize
  };
}
