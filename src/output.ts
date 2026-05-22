/**
 * output.ts — Unified output layer.
 *
 * - isTTY + no NO_COLOR  → pretty print (ANSI color, ASCII borders, structured layout)
 * - FORCE_COLOR=1        → force pretty even when not a TTY (e.g. pager)
 * - NO_COLOR=1 / isTTY=false → raw JSON (agent / pipe / redirect friendly)
 *
 * Each command calls `printResult(data, renderer)`.
 * When a `renderer` is provided it is called for pretty mode; otherwise a
 * generic JSON pretty-printer is used as fallback.
 */

// ── TTY detection ────────────────────────────────────────────────────────────

export function isTTY(): boolean {
  if (process.env.FORCE_COLOR === "1") return true;
  if (process.env.NO_COLOR) return false;
  return Boolean(process.stdout.isTTY);
}

// ── ANSI color primitives ────────────────────────────────────────────────────

const ESC = "\x1b[";
const RESET = "\x1b[0m";

function ansi(code: string, text: string): string {
  return isTTY() ? `${ESC}${code}m${text}${RESET}` : text;
}

export const c = {
  green: (t: string) => ansi("32", t),
  red: (t: string) => ansi("31", t),
  yellow: (t: string) => ansi("33", t),
  blue: (t: string) => ansi("34", t),
  cyan: (t: string) => ansi("36", t),
  magenta: (t: string) => ansi("35", t),
  gray: (t: string) => ansi("90", t),
  bold: (t: string) => ansi("1", t),
  dim: (t: string) => ansi("2", t),
};

// ── Layout primitives ────────────────────────────────────────────────────────

const LINE_WIDTH = 52;

/** "── label ──────────────────────────────" */
export function divider(label?: string): string {
  if (!label) {
    return c.gray("─".repeat(LINE_WIDTH));
  }
  const prefix = "── ";
  const suffix = " ";
  const remaining = Math.max(0, LINE_WIDTH - prefix.length - label.length - suffix.length);
  return c.gray(prefix) + c.bold(label) + c.gray(suffix + "─".repeat(remaining));
}

/** key-value row with aligned value column */
export function kv(key: string, val: string, indent = 2): string {
  const pad = Math.max(1, 14 - key.length);
  return " ".repeat(indent) + c.dim(key) + " ".repeat(pad) + val;
}

/** multi-line ASCII box */
export function box(lines: string[]): string {
  const innerWidth = Math.max(...lines.map(stripAnsi).map((l) => l.length), 20);
  const top = c.gray("┌─ ") + c.gray("─".repeat(innerWidth + 2)) + c.gray(" ─┐");
  const bottom = c.gray("└") + c.gray("─".repeat(innerWidth + 6)) + c.gray("┘");
  const rows = lines.map((l) => {
    const raw = stripAnsi(l);
    const pad = innerWidth - raw.length;
    return c.gray("│") + "  " + l + " ".repeat(Math.max(0, pad)) + "  " + c.gray("│");
  });
  return [top, ...rows, bottom].join("\n");
}

/** "[label]" badge — color optional */
export function badge(text: string, color: keyof typeof c = "gray"): string {
  return c[color](`[${text}]`);
}

/** strip ANSI escape codes for length calculation */
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

// ── Status helpers ───────────────────────────────────────────────────────────

export function statusBadge(status: string): string {
  switch (status) {
    case "done":
    case "success":
    case "passed":
    case "ready":
      return c.green(`✓ ${status}`);
    case "failed":
    case "needs_revision":
      return c.red(`✗ ${status}`);
    case "handoff":
      return c.yellow(`⚡ ${status}`);
    case "pending":
    case "planned":
      return c.dim(status);
    case "skipped":
      return c.gray(`– ${status}`);
    default:
      return status;
  }
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Print result to stdout.
 *
 * - Non-TTY: always raw JSON.
 * - TTY: call `renderer(data)` if provided; otherwise generic pretty print.
 */
export function printResult(data: unknown, renderer?: (data: unknown) => string): void {
  if (!isTTY()) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (renderer) {
    process.stdout.write(renderer(data) + "\n");
    return;
  }
  process.stdout.write(colorizeJson(JSON.stringify(data, null, 2)) + "\n");
}

/** Print help text (always raw, no transformation) */
export function printHelp(text: string): void {
  process.stdout.write(text + "\n");
}

/** Print to stderr (not affected by TTY mode) */
export function printError(msg: string): void {
  process.stderr.write(msg + "\n");
}

// ── Generic JSON colorizer (TTY fallback) ────────────────────────────────────

function colorizeJson(json: string): string {
  return json
    .replace(/"([^"]+)":/g, (_, k: string) => c.cyan(`"${k}"`) + ":")
    .replace(/: "([^"]*)"/g, (_, v: string) => ": " + c.green(`"${v}"`))
    .replace(/: (true|false)/g, (_, v: string) => ": " + c.yellow(v))
    .replace(/: (null)/g, (_, v: string) => ": " + c.dim(v))
    .replace(/: (-?\d+(\.\d+)?)/g, (_, v: string) => ": " + c.magenta(v));
}

// ── Per-command pretty renderers ─────────────────────────────────────────────

// ---------- init -------------------------------------------------------------

interface InitOutput {
  run_id: string;
  state_path: string;
  mode: string;
  phase: string;
}

export function renderInit(data: unknown): string {
  const d = data as InitOutput;
  return [
    box([
      c.bold("run created"),
      "",
      kv("id", c.cyan(d.run_id), 0),
      kv("phase", statusBadge(d.phase), 0),
      kv("mode", d.mode, 0),
    ]),
    kv("state", c.dim(d.state_path)),
  ].join("\n");
}

// ---------- prepare ----------------------------------------------------------

interface PrepareOutput {
  state_path: string;
  route: { primary: string; extras: string[]; account: string; content_profile: string };
  authoring: { rewrite_allowed: boolean; style_mode: string };
  metadata: { title: string; slug: string; date: string; description: string | null };
  requires_style: boolean;
  body_formatted_path: string;
  illustration_markers: string[];
}

export function renderPrepare(data: unknown): string {
  const d = data as PrepareOutput;
  const extras = d.route.extras.length > 0 ? `  ${c.dim("+")}  ${d.route.extras.join(", ")}` : "";
  const lines: string[] = [
    divider("prepare"),
    kv("title", c.bold(d.metadata.title)),
    kv("slug", c.dim(d.metadata.slug)),
    kv("date", d.metadata.date),
    kv("route", `${c.cyan(d.route.primary)}${extras}  ${c.dim(`@${d.route.account}`)}`),
    kv("style", d.requires_style ? c.yellow("requested") : c.dim("none")),
    kv("rewrite", d.authoring.rewrite_allowed ? c.yellow("allowed") : c.dim("no")),
  ];
  if (d.illustration_markers.length > 0) {
    lines.push(kv("markers", d.illustration_markers.join(", ")));
  }
  lines.push(kv("body →", c.dim(d.body_formatted_path)));
  return lines.join("\n");
}

// ---------- prepare-finalize -------------------------------------------------

interface PrepareFinalizeOutput {
  asset_path: string;
  state_path: string;
  post_path: string;
  highlight_words: string[];
  phase: string;
  content_version: number;
}

export function renderPrepareFinalize(data: unknown): string {
  const d = data as PrepareFinalizeOutput;
  return [
    divider("prepare-finalize"),
    kv("phase", statusBadge(d.phase)),
    kv("version", `content:${d.content_version}`),
    kv("highlight", d.highlight_words.join(", ") || c.dim("(none)")),
    kv("asset →", c.dim(d.asset_path)),
    kv("post →", c.dim(d.post_path)),
  ].join("\n");
}

// ---------- render -----------------------------------------------------------

interface RenderPlan {
  needed: boolean;
  template: string | null;
  cover_template: string | null;
  cover_title: string | null;
  output_dir: string | null;
  status: string;
}

interface RenderAsset {
  kind: string;
  route: string;
  path: string;
  index?: number;
}

interface RenderOutput {
  plan: RenderPlan;
  render_assets?: RenderAsset[];
  render_version?: number;
  phase?: string;
  // waiting for user branch
  body_inputs?: unknown;
  waiting_for_user?: boolean;
  message?: string;
  // skip-render branch
  skip_render?: boolean;
  newspic_render?: unknown;
}

export function renderRender(data: unknown): string {
  const d = data as RenderOutput;
  const lines: string[] = [divider("render")];

  if (d.waiting_for_user) {
    lines.push(kv("status", c.yellow("waiting for user")));
    if (d.message) lines.push(kv("message", d.message));
    return lines.join("\n");
  }

  if (d.skip_render) {
    lines.push(kv("status", c.dim("plan only (skip-render)")));
    lines.push(kv("template", d.plan.template ?? c.dim("n/a")));
    return lines.join("\n");
  }

  lines.push(kv("template", d.plan.template ?? c.dim("n/a")));
  lines.push(kv("plan", statusBadge(d.plan.status)));
  if (d.phase) lines.push(kv("phase", statusBadge(d.phase)));
  if (d.render_version !== undefined) lines.push(kv("version", `render:${d.render_version}`));

  if (d.render_assets && d.render_assets.length > 0) {
    lines.push(c.gray("  ─────"));
    for (const asset of d.render_assets) {
      const label = asset.kind === "page" ? `page ${asset.index ?? ""}` : asset.kind;
      lines.push(kv(label, c.dim(asset.path)));
    }
  }

  return lines.join("\n");
}

// ---------- publish ----------------------------------------------------------

interface PublishResult {
  route: string;
  status: string;
  detail?: string | null;
  published_at?: string | null;
  content_version?: number;
  render_version?: number;
}

interface PublishOutput {
  publish_results: PublishResult[];
  mode: string;
  phase: string;
}

export function renderPublish(data: unknown): string {
  const d = data as PublishOutput;
  const lines: string[] = [divider("publish")];
  for (const r of d.publish_results) {
    const ts = r.published_at ? c.dim(`  ${r.published_at}`) : "";
    lines.push(kv(r.route, `${statusBadge(r.status)}${ts}`));
    if (r.detail && r.status === "failed") {
      lines.push(kv("", c.red(r.detail)));
    }
  }
  lines.push(c.gray("  ─────"));
  lines.push(kv("mode", d.mode));
  lines.push(kv("phase", statusBadge(d.phase)));
  return lines.join("\n");
}

// ---------- review -----------------------------------------------------------

interface ReviewOutput {
  state_path: string;
  content_review: { status: string; feedback: string | null };
}

export function renderReview(data: unknown): string {
  const d = data as ReviewOutput;
  const lines: string[] = [
    divider("review"),
    kv("status", statusBadge(d.content_review.status)),
  ];
  if (d.content_review.feedback) {
    lines.push(kv("feedback", d.content_review.feedback));
  }
  return lines.join("\n");
}

// ---------- task shape (reconcile / attach-body / attach-body-images / attach-newspic-spec / status / checkpoint) ──

interface TaskSummaryNested {
  run_id?: string;
  mode?: string;
  phase?: { current?: string } | string;
  route?: { primary?: string; extras?: string[]; account?: string } | string;
  metadata?: { title?: string } | null;
  content_review?: { status?: string } | string | null;
  [key: string]: unknown;
}

interface TaskNextAction {
  action?: string;
  reason?: string;
}

interface TaskGap {
  code?: string;
  field?: string;
  message?: string;
}

interface TaskShapeOutput {
  summary?: TaskSummaryNested;
  validation?: { phase_checked?: string; valid?: boolean; errors?: string[] };
  gaps?: TaskGap[];
  blockers?: TaskGap[];
  next_action?: TaskNextAction | string;
  [key: string]: unknown;
}

function extractPhase(phase: TaskSummaryNested["phase"]): string | undefined {
  if (!phase) return undefined;
  if (typeof phase === "string") return phase;
  return phase.current;
}

function extractRoute(route: TaskSummaryNested["route"]): { primary?: string; account?: string } {
  if (!route) return {};
  if (typeof route === "string") return { primary: route };
  return { primary: route.primary, account: route.account };
}

function extractTitle(meta: TaskSummaryNested["metadata"]): string | undefined {
  if (!meta) return undefined;
  if (typeof meta === "object" && "title" in meta) return meta.title ?? undefined;
  return undefined;
}

function extractReviewStatus(cr: TaskSummaryNested["content_review"]): string | undefined {
  if (!cr) return undefined;
  if (typeof cr === "string") return cr;
  if (typeof cr === "object" && "status" in cr) return cr.status ?? undefined;
  return undefined;
}

export function renderTaskShape(data: unknown): string {
  const d = data as TaskShapeOutput;
  const s = d.summary ?? (data as TaskSummaryNested);

  const runId = s.run_id ?? "status";
  const phase = extractPhase(s.phase);
  const { primary: routePrimary, account } = extractRoute(s.route);
  const title = extractTitle(s.metadata);
  const reviewStatus = extractReviewStatus(s.content_review);

  const lines: string[] = [divider(runId)];

  if (title) lines.push(kv("title", c.bold(title)));
  if (phase) lines.push(kv("phase", statusBadge(phase)));
  if (s.mode) lines.push(kv("mode", String(s.mode)));
  if (routePrimary) lines.push(kv("route", `${c.cyan(routePrimary)}${account ? c.dim(`  @${account}`) : ""}`));
  if (reviewStatus) lines.push(kv("review", statusBadge(reviewStatus)));

  if (d.validation && !d.validation.valid && d.validation.errors && d.validation.errors.length > 0) {
    lines.push(c.gray("  ─────"));
    lines.push(kv("errors", c.red(`${d.validation.errors.length}`)));
    for (const err of d.validation.errors) {
      lines.push("    " + c.red(`✗ ${err}`));
    }
  }

  if (d.blockers && d.blockers.length > 0) {
    lines.push(c.gray("  ─────"));
    for (const b of d.blockers) {
      const msg = typeof b === "string" ? b : (b.message ?? b.field ?? String(b));
      lines.push("  " + c.yellow(`⚠ ${msg}`));
    }
  }

  if (d.gaps && d.gaps.length > 0) {
    lines.push(c.gray("  ─────"));
    for (const g of d.gaps) {
      const msg = typeof g === "string" ? g : (g.message ?? g.field ?? String(g));
      lines.push("  " + c.dim(`· ${msg}`));
    }
  }

  if (d.next_action) {
    const na = d.next_action;
    const naStr = typeof na === "string" ? na : `${na.action ?? "?"}  ${c.dim(na.reason ?? "")}`;
    lines.push(c.gray("  ─────"));
    lines.push(kv("next", naStr));
  }

  return lines.join("\n");
}

// ---------- tasks (array) ----------------------------------------------------

interface TaskEntry {
  summary?: TaskSummaryNested;
  validation?: unknown;
  blockers?: TaskGap[];
  next_action?: TaskNextAction | string;
}

export function renderTasks(data: unknown): string {
  const arr = data as TaskEntry[];
  if (arr.length === 0) {
    return c.dim("  (no tasks)");
  }
  const lines: string[] = [divider(`tasks (${arr.length})`)];
  for (const task of arr) {
    const s = task.summary ?? {};
    const phase = extractPhase(s.phase);
    const title = extractTitle(s.metadata);
    const phaseStr = phase ? `  ${statusBadge(phase)}` : "";
    const titleStr = title ? `  ${c.dim(title.slice(0, 32))}` : "";
    lines.push(`  ${c.cyan(s.run_id ?? "?")}${phaseStr}${titleStr}`);
    if (task.next_action) {
      const na = task.next_action;
      const naStr = typeof na === "string" ? na : (na.action ?? "?");
      lines.push(`  ${c.dim("→")} ${naStr}`);
    }
  }
  return lines.join("\n");
}

// ---------- sync-blog --------------------------------------------------------

interface SyncBlogOutput {
  route: string;
  status: string;
  detail?: string | null;
  published_at?: string | null;
  content_version?: number;
  render_version?: number;
}

export function renderSyncBlog(data: unknown): string {
  const d = data as SyncBlogOutput;
  const lines: string[] = [
    divider("sync-blog"),
    kv("status", statusBadge(d.status)),
  ];
  if (d.published_at) lines.push(kv("published", d.published_at));
  if (d.content_version !== undefined || d.render_version !== undefined) {
    lines.push(kv("versions", `content:${d.content_version ?? "?"}  render:${d.render_version ?? "?"}`));
  }
  if (d.detail && d.status !== "success") lines.push(kv("detail", c.yellow(d.detail)));
  return lines.join("\n");
}

// ---------- reset ------------------------------------------------------------

interface ResetOutput {
  state_path: string;
  reset_mode: string;
  mode: string;
  phase: { current: string; prepare: string; render: string; publish: string };
  start_step: string | null;
}

export function renderReset(data: unknown): string {
  const d = data as ResetOutput;
  return [
    divider("reset"),
    kv("mode", d.reset_mode),
    kv("result", d.mode),
    kv("phase", `current: ${statusBadge(d.phase.current)}`),
    kv("phases", `prepare:${d.phase.prepare}  render:${d.phase.render}  publish:${d.phase.publish}`),
    ...(d.start_step ? [kv("start_step", c.yellow(d.start_step))] : []),
  ].join("\n");
}

// ---------- config -----------------------------------------------------------

export function renderConfig(data: unknown): string {
  if (typeof data === "string" || typeof data === "number" || typeof data === "boolean") {
    // scalar read
    return String(data);
  }
  if (data && typeof data === "object" && "key" in data) {
    // single key read/write
    const d = data as { key: string; value: unknown };
    return [
      divider("config"),
      kv(d.key, String(d.value ?? c.dim("(unset)"))),
    ].join("\n");
  }
  // full summary
  const lines: string[] = [divider("config")];
  for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
    lines.push(kv(k, typeof v === "object" ? JSON.stringify(v) : String(v ?? c.dim("(unset)"))));
  }
  return lines.join("\n");
}

// ---------- doctor -----------------------------------------------------------

export function renderDoctor(data: unknown): string {
  const d = data as Record<string, unknown>;
  const lines: string[] = [divider("doctor")];

  const configPath = d.config_path as string | undefined;
  const exists = d.config_path_exists as boolean | undefined;
  if (configPath) {
    lines.push(kv("config", `${c.dim(configPath)}  ${exists ? c.green("✓") : c.red("✗ missing")}`));
  }

  const workspace = d.workspace as string | undefined;
  if (workspace) lines.push(kv("workspace", c.dim(workspace)));

  const bun = d.bun_binary as string | null | undefined;
  const bunErr = d.bun_error as string | null | undefined;
  if (bun) {
    lines.push(kv("bun", `${c.dim(bun)}  ${c.green("✓")}`));
  } else if (bunErr) {
    lines.push(kv("bun", c.red(`✗ ${bunErr}`)));
  }

  const providers = d.publish_providers as string[] | undefined;
  if (providers && providers.length > 0) {
    lines.push(kv("providers", providers.join("  ")));
  }

  const resolvedPaths = d.resolved_paths as Record<string, string> | undefined;
  const pathExist = d.resolved_paths_exist as Record<string, boolean> | undefined;
  if (resolvedPaths && pathExist) {
    lines.push(c.gray("  ─────"));
    for (const [key, val] of Object.entries(resolvedPaths)) {
      const ok = pathExist[key];
      const indicator = ok === undefined ? "" : ok ? c.green("  ✓") : c.red("  ✗");
      lines.push(kv(key, c.dim(val) + indicator));
    }
  }

  const pluginChecks = d.plugin_checks as Array<{ name: string; ok: boolean; message?: string }> | undefined;
  if (pluginChecks && pluginChecks.length > 0) {
    lines.push(c.gray("  ─────"));
    for (const check of pluginChecks) {
      const indicator = check.ok ? c.green("✓") : c.red("✗");
      const msg = check.message ? `  ${c.dim(check.message)}` : "";
      lines.push(kv(check.name, `${indicator}${msg}`));
    }
  }

  return lines.join("\n");
}

// ---------- abandon ----------------------------------------------------------

export function renderAbandon(data: unknown): string {
  const results = data as Array<{ run_id: string; state_path: string; ok: boolean; error?: string }>;
  const lines: string[] = [divider("abandon")];
  for (const r of results) {
    const status = r.ok ? c.green("✓ abandoned") : c.red(`✗ ${r.error ?? "failed"}`);
    lines.push(kv(r.run_id, status));
    if (!r.ok) {
      lines.push(kv("path", c.dim(r.state_path)));
    }
  }
  return lines.join("\n");
}

// ---------- wechat-export ----------------------------------------------------

export function renderWechatExport(data: unknown): string {
  const d = data as Record<string, unknown>;
  const lines: string[] = [divider("wechat-export")];
  for (const [k, v] of Object.entries(d)) {
    lines.push(kv(k, typeof v === "object" ? JSON.stringify(v) : String(v ?? "")));
  }
  return lines.join("\n");
}
