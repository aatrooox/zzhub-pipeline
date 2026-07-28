import { existsSync, statSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { createRequire } from "module";
import { dirname, isAbsolute, join, resolve } from "path";
import { pathToFileURL } from "url";
import {
  ChromeDumpError,
  dumpHtmlDom,
  ensureParentDir,
  escapeHtml,
  findChrome,
  readUtf8,
  renderTemplate,
} from "../imgx/runtime";
import {
  PACKAGE_ROOT,
  TEMPLATE_PATH,
  DIST_DIR,
  MANIFEST_PATH,
  VITE_CONFIG_PATH,
  WECHAT_PREVIEW_DIR,
} from "../runtime-paths";
import { extractFrontmatter } from "./frontmatter-handler";
import { getWechatPreviewStyleName, getWechatPreviewTheme } from "./themes";
import { stripLeadingH1 } from "../text";

interface ViteManifestEntry {
  file: string;
}

interface BundleAssets {
  scriptPath: string;
  rebuilt: boolean;
  stale: boolean;
}

export type WechatExportErrorKind =
  | "chrome_missing"
  | "chrome_failed"
  | "timeout"
  | "render_error"
  | "bundle"
  | "other";

export interface WechatExportDebugInfo {
  chrome_path?: string;
  virtual_time_budget_ms?: number;
  bundle_stale?: boolean;
  bundle_rebuilt?: boolean;
  shell_path?: string;
  stderr_tail?: string;
  debug_dir?: string;
  semantic_html?: string;
}

export class WechatExportError extends Error {
  readonly kind: WechatExportErrorKind;
  readonly durationMs: number;
  readonly debug: WechatExportDebugInfo;
  readonly account: string;
  readonly title?: string;
  readonly markdownPath?: string;

  constructor(
    message: string,
    options: {
      kind: WechatExportErrorKind;
      durationMs: number;
      debug?: WechatExportDebugInfo;
      account: string;
      title?: string;
      markdownPath?: string;
    },
  ) {
    super(message);
    this.name = "WechatExportError";
    this.kind = options.kind;
    this.durationMs = options.durationMs;
    this.debug = options.debug ?? {};
    this.account = options.account;
    this.title = options.title;
    this.markdownPath = options.markdownPath;
  }
}

export interface ExportMarkdownToWechatHtmlInput {
  markdownPath: string;
  outPath: string;
  account: string;
  title?: string;
  previewShellOutPath?: string;
  customCss?: string | null;
  themeOverrides?: {
    editorVars?: Record<string, string>;
    exportTheme?: Record<string, string>;
  };
  /** Chrome virtual-time-budget in ms (default 15000). */
  timeoutMs?: number;
  /** Write intermediate artifacts for debugging. */
  debugDir?: string;
}

export interface ExportMarkdownToWechatHtmlResult {
  html: string;
  htmlPath: string;
  account: string;
  previewStyle: string;
  previewShellPath?: string;
  durationMs: number;
  bundleRebuilt: boolean;
  bundleStale: boolean;
  debugDir?: string;
  semanticHtml?: string;
}

const requireFromHere = createRequire(import.meta.url);

/** Absolute path to shared article.css (@zzhub/milkdown-article-style). */
export function resolveMilkdownArticleStylePath(): string {
  try {
    return requireFromHere.resolve("@zzhub/milkdown-article-style/article.css");
  } catch {
    // Bun / Node may need package root + relative when exports are CSS-only.
    const pkgRoot = dirname(requireFromHere.resolve("@zzhub/milkdown-article-style/package.json"));
    return join(pkgRoot, "article.css");
  }
}

/** Source files that feed the browser Vite bundle. */
export function getWechatPreviewBundleSources(): string[] {
  return [
    join(WECHAT_PREVIEW_DIR, "browser/editor-export.ts"),
    resolveMilkdownArticleStylePath(),
    join(WECHAT_PREVIEW_DIR, "wechat-renderer.ts"),
  ];
}

export function isWechatPreviewBundleStale(
  sources: string[] = getWechatPreviewBundleSources(),
  manifestPath: string = MANIFEST_PATH,
): boolean {
  if (!existsSync(manifestPath)) return true;
  let distMtime: number;
  try {
    distMtime = statSync(manifestPath).mtimeMs;
  } catch {
    return true;
  }
  for (const src of sources) {
    if (!existsSync(src)) continue;
    try {
      if (statSync(src).mtimeMs > distMtime) return true;
    } catch {
      // ignore unreadable sources
    }
  }
  return false;
}

function buildBundle(): void {
  const result = Bun.spawnSync({
    cmd: ["bun", "x", "vite", "build", "--config", VITE_CONFIG_PATH],
    cwd: PACKAGE_ROOT,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0) {
    const stderr = new TextDecoder().decode(result.stderr);
    throw new Error(`Failed to build wechat preview bundle:\n${stderr}`);
  }
}

function readBundleScriptPath(): string {
  const manifestRaw = readUtf8(MANIFEST_PATH);
  const manifest = JSON.parse(manifestRaw) as Record<string, ViteManifestEntry>;
  const entry =
    manifest["src/wechat-preview/browser/editor-export.ts"] ??
    Object.values(manifest)[0];

  if (!entry?.file) {
    throw new Error("Wechat preview manifest missing editor-export entry");
  }

  return join(DIST_DIR, entry.file);
}

function ensureBundle(): BundleAssets {
  const stale = isWechatPreviewBundleStale();
  let rebuilt = false;
  if (!existsSync(MANIFEST_PATH) || stale) {
    try {
      buildBundle();
      rebuilt = true;
    } catch (error) {
      // Fall back to existing dist when rebuild tooling is unavailable (e.g. missing juice).
      if (!existsSync(MANIFEST_PATH)) {
        throw error;
      }
    }
  }

  return {
    scriptPath: readBundleScriptPath(),
    rebuilt,
    stale: stale && !rebuilt,
  };
}

export function escapeInlineJson(value: string): string {
  return value
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026");
}

export function isExternalUrl(value: string): boolean {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(value);
}

export function resolveMarkdownAsset(rawPath: string, baseDir: string): string {
  const trimmed = rawPath.trim();
  if (!trimmed || isExternalUrl(trimmed) || isAbsolute(trimmed)) {
    return trimmed;
  }
  return resolve(baseDir, trimmed);
}

export function rewriteRelativeImagePaths(markdown: string, baseDir: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\((?:<([^>]+)>|([^)]+?))(?:\s+(["'])([^"']*)\4)?\)/g, (_match, alt, angleUrl, plainUrl, _quote, title) => {
      const src = angleUrl ?? plainUrl ?? "";
      const hasAngleBrackets = angleUrl !== undefined;
      const resolved = resolveMarkdownAsset(src, baseDir);
      const needsBrackets = resolved ? resolved.includes(" ") : src.includes(" ");
      const titleStr = title ? ` "${title}"` : "";
      if (!resolved || resolved === src) {
        const wrap = !!(hasAngleBrackets || needsBrackets);
        return `![${alt}](${wrap ? "<" : ""}${src}${wrap ? ">" : ""}${titleStr})`;
      }
      return `![${alt}](${needsBrackets ? "<" : ""}${resolved}${needsBrackets ? ">" : ""}${titleStr})`;
    })
    .replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (_match, prefix, src, suffix) => {
      const resolved = resolveMarkdownAsset(String(src ?? ""), baseDir);
      return `${prefix}${resolved}${suffix}`;
    });
}

export function buildWechatPreviewShell(articleHtml: string, pageTitle: string): string {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(pageTitle)}</title>
    <style>
      html { background: #f3f1f2; }
      body { margin: 0; padding: 32px 16px 64px; background: #f3f1f2; }
      #wechat-preview-content { width: 100%; max-width: 430px; margin: 0 auto; padding: 18px 16px; box-sizing: border-box; background: #fff; box-shadow: 0 12px 36px rgba(38, 30, 34, 0.10); }
      @media (max-width: 462px) {
        body { padding: 0; background: #fff; }
        #wechat-preview-content { max-width: none; padding: 16px; box-shadow: none; }
      }
    </style>
  </head>
  <body>
    <main id="wechat-preview-content">${articleHtml}</main>
  </body>
</html>`;
}

async function writePreviewShell(
  previewShellOutPath: string,
  pageTitle: string,
  articleHtml: string,
): Promise<string> {
  await mkdir(dirname(previewShellOutPath), { recursive: true });
  await writeFile(
    previewShellOutPath,
    buildWechatPreviewShell(articleHtml, pageTitle),
    "utf-8",
  );
  return previewShellOutPath;
}

export type ExtractedRenderResult =
  | { status: "success"; html: string; semanticHtml?: string }
  | { status: "error"; error: string }
  | { status: string };

export function extractRenderResult(dom: string): ExtractedRenderResult {
  const match = dom.match(
    /<script id="zzhub-wechat-export-result" type="application\/json">([\s\S]*?)<\/script>/,
  );

  if (!match?.[1]) {
    throw new Error("Wechat preview result script not found");
  }

  return JSON.parse(match[1]) as ExtractedRenderResult;
}

function stderrTail(stderr: string, max = 2000): string {
  const trimmed = stderr.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(-max);
}

async function writeDebugArtifacts(
  debugDir: string,
  files: Record<string, string | undefined>,
): Promise<void> {
  await mkdir(debugDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    if (content === undefined) continue;
    await writeFile(join(debugDir, name), content, "utf-8");
  }
}

export async function exportMarkdownToWechatHtml(
  input: ExportMarkdownToWechatHtmlInput,
): Promise<ExportMarkdownToWechatHtmlResult> {
  const started = Date.now();
  const timeoutMs = input.timeoutMs ?? 15_000;
  const title = input.title ?? "Wechat Preview Export";
  let chromePath: string | undefined;
  let bundleRebuilt = false;
  let bundleStale = false;

  const makeError = (
    kind: WechatExportErrorKind,
    message: string,
    debug: WechatExportDebugInfo = {},
  ): WechatExportError =>
    new WechatExportError(message, {
      kind,
      durationMs: Date.now() - started,
      account: input.account,
      title,
      markdownPath: input.markdownPath,
      debug: {
        chrome_path: chromePath,
        virtual_time_budget_ms: timeoutMs,
        bundle_stale: bundleStale,
        bundle_rebuilt: bundleRebuilt,
        debug_dir: input.debugDir,
        ...debug,
      },
    });

  try {
    const foundChrome = findChrome();
    if (!foundChrome) {
      throw makeError(
        "chrome_missing",
        "Chrome/Chromium not found. Required for WeChat HTML export.\n" +
          "Install one of:\n" +
          "  macOS:   brew install --cask chromium\n" +
          "  Ubuntu:  sudo apt install chromium-browser\n" +
          "  Or install Google Chrome from https://www.google.com/chrome/\n" +
          "  Or set CHROME_PATH environment variable to the binary path.",
      );
    }
    chromePath = foundChrome;

    let bundle: BundleAssets;
    try {
      bundle = ensureBundle();
      bundleRebuilt = bundle.rebuilt;
      bundleStale = bundle.stale;
    } catch (error) {
      throw makeError(
        "bundle",
        error instanceof Error ? error.message : String(error),
      );
    }

    const sourceMarkdown = await readFile(input.markdownPath, "utf-8");
    const stripped = extractFrontmatter(sourceMarkdown).content;
    const bodyMarkdown = stripLeadingH1(stripped).trimStart();
    const markdown = rewriteRelativeImagePaths(bodyMarkdown, dirname(input.markdownPath));
    const theme = getWechatPreviewTheme(input.account, input.themeOverrides);
    const customCss = input.customCss
      ? await readFile(input.customCss, "utf-8")
      : undefined;
    const shell = readUtf8(TEMPLATE_PATH);
    const payloadJson = escapeInlineJson(
      JSON.stringify({
        markdown,
        editorVars: theme.editorVars,
        exportTheme: theme.exportTheme,
        customCss,
      }),
    );

    const shellHtml = renderTemplate(shell, {
      "{{PAGE_TITLE}}": escapeHtml(title),
      "{{CSS_LINK}}": "",
      "{{PAYLOAD_JSON}}": payloadJson,
      "{{SCRIPT_URL}}": pathToFileURL(bundle.scriptPath).href,
    });

    let dumpedDom: string;
    try {
      dumpedDom = dumpHtmlDom({
        chromePath,
        html: shellHtml,
        virtualTimeBudgetMs: timeoutMs,
        keepTempOnError: Boolean(input.debugDir),
      });
    } catch (error) {
      if (error instanceof ChromeDumpError) {
        if (input.debugDir) {
          await writeDebugArtifacts(input.debugDir, {
            "00-payload-markdown.md": markdown,
            "01-export-shell.html": shellHtml,
            "meta.json": JSON.stringify({
              status: "failed",
              kind: "chrome_failed",
              error: error.message,
              stderr: error.stderr,
              duration_ms: Date.now() - started,
            }, null, 2),
          });
        }
        throw makeError("chrome_failed", error.message, {
          shell_path: error.tempHtmlPath,
          stderr_tail: stderrTail(error.stderr),
          debug_dir: input.debugDir,
        });
      }
      throw makeError(
        "chrome_failed",
        error instanceof Error ? error.message : String(error),
      );
    }

    let result: ExtractedRenderResult;
    try {
      result = extractRenderResult(dumpedDom);
    } catch (error) {
      if (input.debugDir) {
        await writeDebugArtifacts(input.debugDir, {
          "00-payload-markdown.md": markdown,
          "01-export-shell.html": shellHtml,
          "02-dump-dom.html": dumpedDom,
          "meta.json": JSON.stringify({
            status: "failed",
            kind: "timeout",
            error: error instanceof Error ? error.message : String(error),
            duration_ms: Date.now() - started,
          }, null, 2),
        });
      }
      throw makeError(
        "timeout",
        `Wechat preview export did not finish before timeout (${timeoutMs}ms): ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }

    if (result.status === "error" && "error" in result) {
      if (input.debugDir) {
        await writeDebugArtifacts(input.debugDir, {
          "00-payload-markdown.md": markdown,
          "01-export-shell.html": shellHtml,
          "02-dump-dom.html": dumpedDom,
          "meta.json": JSON.stringify({
            status: "failed",
            kind: "render_error",
            error: result.error,
            duration_ms: Date.now() - started,
          }, null, 2),
        });
      }
      throw makeError("render_error", `Wechat preview export failed: ${result.error}`);
    }
    if (result.status !== "success" || !("html" in result)) {
      if (input.debugDir) {
        await writeDebugArtifacts(input.debugDir, {
          "00-payload-markdown.md": markdown,
          "01-export-shell.html": shellHtml,
          "02-dump-dom.html": dumpedDom,
          "meta.json": JSON.stringify({
            status: "failed",
            kind: "timeout",
            status_value: result.status,
            duration_ms: Date.now() - started,
          }, null, 2),
        });
      }
      throw makeError(
        "timeout",
        `Wechat preview export did not finish before timeout (status=${result.status}, budget=${timeoutMs}ms)`,
      );
    }

    const html = result.html;
    const semanticHtml =
      "semanticHtml" in result && typeof result.semanticHtml === "string"
        ? result.semanticHtml
        : undefined;

    ensureParentDir(input.outPath);
    await writeFile(input.outPath, html, "utf-8");

    let previewShellPath: string | undefined;
    if (input.previewShellOutPath) {
      previewShellPath = await writePreviewShell(
        input.previewShellOutPath,
        title,
        html,
      );
    }

    const durationMs = Date.now() - started;
    if (input.debugDir) {
      await writeDebugArtifacts(input.debugDir, {
        "00-payload-markdown.md": markdown,
        "01-export-shell.html": shellHtml,
        "02-dump-dom.html": dumpedDom,
        "03-article.html": html,
        "03-semantic.html": semanticHtml,
        "04-preview-shell.html": previewShellPath
          ? await readFile(previewShellPath, "utf-8")
          : buildWechatPreviewShell(html, title),
        "meta.json": JSON.stringify({
          status: "success",
          account: input.account,
          duration_ms: durationMs,
          bundle_rebuilt: bundleRebuilt,
          bundle_stale: bundleStale,
          timeout_ms: timeoutMs,
          html_path: input.outPath,
        }, null, 2),
      });
    }

    return {
      html,
      htmlPath: input.outPath,
      account: input.account,
      previewStyle: getWechatPreviewStyleName(input.account),
      previewShellPath,
      durationMs,
      bundleRebuilt,
      bundleStale,
      debugDir: input.debugDir,
      semanticHtml,
    };
  } catch (error) {
    if (error instanceof WechatExportError) throw error;
    throw makeError("other", error instanceof Error ? error.message : String(error));
  }
}
