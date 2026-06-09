/**
 * Adapter interfaces for pluggable rendering.
 *
 * These define the contract between the zzp core pipeline and the
 * rendering subsystems (image rendering and markdown rendering).
 *
 * Built-in adapters wrap the existing imgx and wechat-preview modules.
 * User-provided adapters can replace them via config.plugins.
 */

import type { RenderAsset, RoutePrimary, WorkflowState } from "./state";

// ── Doctor check ──────────────────────────────────────────────────

export interface PipelinePluginDoctorCheck {
  name: string;
  ok: boolean;
  message?: string;
  detail?: unknown;
}

// ── Image renderer adapter ────────────────────────────────────────

/**
 * Input for image rendering. Maps to the parameters currently passed
 * to runRenderArticleCli and runRenderCardCli via CLI argv.
 */
export interface ImageRenderInput {
  /** Workflow state providing context (route, metadata, etc.) */
  state: WorkflowState;

  /** Markdown body text to render */
  bodyText: string;

  /** Output directory for rendered images */
  outputDir: string;

  /** Page title */
  title: string;

  /** Route determines template selection */
  route: RoutePrimary;

  /**
   * Optional explicit page specifications.
   * For wechat-newspic: page markers, image layouts, fill ratios.
   * For wechat-article: typically empty (auto-pagination).
   */
  pageSpecs?: Array<{
    page: number;
    imageMarkers?: string[];
    imageLayout?: string | null;
    targetFillRatio?: number | null;
    note?: string | null;
  }>;

  /** Body images to embed in rendered pages */
  bodyImages?: Array<{
    marker: string;
    path: string;
  }>;

  /** Minimum number of pages (for longform) */
  minPages?: number;

  /** Maximum number of pages (0 = no limit) */
  maxPages?: number;

  /** Account-specific visual params (footer text, colors, icon) */
  accountVisualParams?: {
    footer?: string;
    bg?: string;
    highlight?: string;
    fallbackIcon?: string;
  };

  /** Theme name override */
  theme?: string;

  /** Template name override */
  template?: string;
}

/**
 * Output from image rendering.
 */
export interface ImageRenderOutput {
  /** Rendered assets (cover image + page images) */
  assets: RenderAsset[];

  /** Number of pages rendered */
  pageCount: number;

  /** Per-page summary */
  pages: Array<{
    page: number;
    imageCount: number;
    imageSources: string[];
  }>;
}

export interface ImageRenderPlugin {
  name: string;
  version?: string;

  /** Environment checks (e.g., Chrome availability) */
  doctor?: () => Promise<PipelinePluginDoctorCheck[]>;

  /** Render images from markdown body */
  render: (input: ImageRenderInput) => Promise<ImageRenderOutput>;
}

// ── Markdown renderer adapter ─────────────────────────────────────

/**
 * Input for markdown-to-HTML rendering.
 * Maps to ExportMarkdownToWechatHtmlInput from wechat-preview.
 */
export interface MarkdownRenderInput {
  /** Path to the markdown source file */
  markdownPath: string;

  /** Output path for the rendered HTML */
  outPath: string;

  /** WeChat account name (for theme/style selection) */
  account: string;

  /** Article title */
  title?: string;

  /** Optional path for preview shell HTML output */
  previewShellOutPath?: string;

  /** Path to custom CSS file for style overrides */
  customCss?: string | null;

  /** Workflow state for context */
  state?: WorkflowState;

  /** Per-account theme overrides from config. Deep-merged onto hardcoded defaults. */
  themeOverrides?: {
    editorVars?: Record<string, string>;
    exportTheme?: Record<string, string>;
  };
}

/**
 * Output from markdown rendering.
 * Maps to ExportMarkdownToWechatHtmlResult from wechat-preview.
 */
export interface MarkdownRenderOutput {
  /** Rendered HTML content */
  html: string;

  /** Path to the written HTML file */
  htmlPath: string;

  /** Account used for rendering */
  account: string;

  /** CSS style used for preview */
  previewStyle: string;

  /** Path to preview shell HTML (if generated) */
  previewShellPath?: string;
}

export interface MarkdownRenderPlugin {
  name: string;
  version?: string;

  /** Environment checks */
  doctor?: () => Promise<PipelinePluginDoctorCheck[]>;

  /** Render markdown to WeChat-compatible HTML */
  render: (input: MarkdownRenderInput) => Promise<MarkdownRenderOutput>;
}
