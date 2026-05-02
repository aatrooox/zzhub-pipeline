import { existsSync } from "fs";
import { cp, mkdir, readFile, rm, writeFile } from "fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "path";
import { fileURLToPath, pathToFileURL } from "url";
import {
  PACKAGE_ROOT,
  dumpHtmlDom,
  ensureParentDir,
  escapeHtml,
  findChrome,
  readUtf8,
  renderTemplate,
} from "../imgx/runtime";
import { extractFrontmatter } from "./frontmatter-handler";
import { getWechatPreviewStyleName, getWechatPreviewTheme } from "./themes";
import { stripLeadingH1 } from "../text";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WECHAT_PREVIEW_DIR = __dirname;
const TEMPLATE_PATH = join(WECHAT_PREVIEW_DIR, "assets/templates/export-shell.html");
const DIST_DIR = join(WECHAT_PREVIEW_DIR, "assets/browser-dist");
const MANIFEST_PATH = join(DIST_DIR, ".vite/manifest.json");
const VITE_CONFIG_PATH = join(PACKAGE_ROOT, "vite.wechat-preview.config.ts");

interface ViteManifestEntry {
  file: string;
  css?: string[];
}

interface BundleAssets {
  scriptPath: string;
  cssPath: string | null;
}

export interface ExportMarkdownToWechatHtmlInput {
  markdownPath: string;
  outPath: string;
  account: string;
  title?: string;
  previewShellOutPath?: string;
}

export interface ExportMarkdownToWechatHtmlResult {
  html: string;
  htmlPath: string;
  account: string;
  previewStyle: string;
  previewShellPath?: string;
}

function ensureBundle(): BundleAssets {
  if (!existsSync(MANIFEST_PATH)) {
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

  const manifestRaw = readUtf8(MANIFEST_PATH);
  const manifest = JSON.parse(manifestRaw) as Record<string, ViteManifestEntry>;
  const entry =
    manifest["src/wechat-preview/browser/editor-export.ts"] ??
    Object.values(manifest)[0];

  if (!entry?.file) {
    throw new Error("Wechat preview manifest missing editor-export entry");
  }

  return {
    scriptPath: join(DIST_DIR, entry.file),
    cssPath: entry.css?.[0]
      ? join(DIST_DIR, entry.css[0])
      : manifest["style.css"]?.file
        ? join(DIST_DIR, manifest["style.css"].file)
        : null,
  };
}

export function escapeInlineJson(value: string): string {
  return value
    .replace(/</g, "\\u003C")
    .replace(/>/g, "\\u003E")
    .replace(/&/g, "\\u0026");
}

export function isExternalUrl(value: string): boolean {
  return /^(https?:|data:|blob:|file:|\/\/)/i.test(value);
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
    .replace(/!\[([^\]]*)\]\((<)?([^)]+?)(>)?\)/g, (_match, alt, open, src) => {
      const resolved = resolveMarkdownAsset(String(src ?? ""), baseDir);
      if (!resolved || resolved === src) {
        return `![${alt}](${open ? "<" : ""}${src}${open ? ">" : ""})`;
      }
      return `![${alt}](<${resolved}>)`;
    })
    .replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (_match, prefix, src, suffix) => {
      const resolved = resolveMarkdownAsset(String(src ?? ""), baseDir);
      return `${prefix}${resolved}${suffix}`;
    });
}

function rewriteRelativeImagePathsForPreview(markdown: string, baseDir: string, previewDir: string): string {
  return markdown
    .replace(/!\[([^\]]*)\]\((<)?([^)]+?)(>)?\)/g, (_match, alt, open, src) => {
      const raw = String(src ?? "").trim();
      if (!raw || isExternalUrl(raw)) {
        return `![${alt}](${open ? "<" : ""}${src}${open ? ">" : ""})`;
      }
      const resolved = resolveMarkdownAsset(raw, baseDir);
      if (!resolved) {
        return `![${alt}](${open ? "<" : ""}${src}${open ? ">" : ""})`;
      }
      const previewRelative = relative(previewDir, resolved).replaceAll("\\", "/");
      const normalized = previewRelative.startsWith(".") ? previewRelative : `./${previewRelative}`;
      return `![${alt}](${open ? "<" : ""}${normalized}${open ? ">" : ""})`;
    })
    .replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'][^>]*>)/gi, (_match, prefix, src, suffix) => {
      const raw = String(src ?? "").trim();
      if (!raw || isExternalUrl(raw)) {
        return `${prefix}${src}${suffix}`;
      }
      const resolved = resolveMarkdownAsset(raw, baseDir);
      const previewRelative = relative(previewDir, resolved).replaceAll("\\", "/");
      const normalized = previewRelative.startsWith(".") ? previewRelative : `./${previewRelative}`;
      return `${prefix}${normalized}${suffix}`;
    });
}

async function ensurePreviewBundleDir(targetDir: string): Promise<void> {
  await mkdir(dirname(targetDir), { recursive: true });
  await rm(targetDir, { recursive: true, force: true });
  await cp(DIST_DIR, targetDir, { recursive: true, force: true });
}

async function writePreviewShell(options: {
  previewShellOutPath: string;
  pageTitle: string;
  sourceMarkdown: string;
  sourceMarkdownDir: string;
  theme: ReturnType<typeof getWechatPreviewTheme>;
  bundle: BundleAssets;
}): Promise<string> {
  const previewDir = dirname(options.previewShellOutPath);
  await mkdir(previewDir, { recursive: true });
  const previewBundleDir = join(previewDir, "browser-dist");
  await ensurePreviewBundleDir(previewBundleDir);

  const previewMarkdown = rewriteRelativeImagePathsForPreview(
    options.sourceMarkdown,
    options.sourceMarkdownDir,
    previewDir,
  );
  const shell = readUtf8(TEMPLATE_PATH);
  const payloadJson = escapeInlineJson(
    JSON.stringify({
      markdown: previewMarkdown,
      editorVars: options.theme.editorVars,
      exportTheme: options.theme.exportTheme,
    }),
  );
  const relativeScriptPath = relative(previewDir, join(previewBundleDir, "editor-export.js")).replaceAll("\\", "/");
  const relativeCssPath = options.bundle.cssPath
    ? relative(previewDir, join(previewBundleDir, relative(DIST_DIR, options.bundle.cssPath))).replaceAll("\\", "/")
    : null;

  const shellHtml = renderTemplate(shell, {
    "{{PAGE_TITLE}}": escapeHtml(options.pageTitle),
    "{{CSS_LINK}}": relativeCssPath ? `<link rel="stylesheet" href="${relativeCssPath.startsWith(".") ? relativeCssPath : `./${relativeCssPath}`}">` : "",
    "{{PAYLOAD_JSON}}": payloadJson,
    "{{SCRIPT_URL}}": relativeScriptPath.startsWith(".") ? relativeScriptPath : `./${relativeScriptPath}`,
  });

  await writeFile(options.previewShellOutPath, shellHtml, "utf-8");
  return options.previewShellOutPath;
}

export function extractRenderResult(
  dom: string,
): { status: "success"; html: string } | { status: "error"; error: string } | { status: string } {
  const match = dom.match(
    /<script id="zzhub-wechat-export-result" type="application\/json">([\s\S]*?)<\/script>/,
  );

  if (!match?.[1]) {
    throw new Error("Wechat preview result script not found");
  }

  return JSON.parse(match[1]) as
    | { status: "success"; html: string }
    | { status: "error"; error: string }
    | { status: string };
}

export async function exportMarkdownToWechatHtml(
  input: ExportMarkdownToWechatHtmlInput,
): Promise<ExportMarkdownToWechatHtmlResult> {
  const chromePath = findChrome();
  if (chromePath === null) {
    throw new Error("Chrome/Chromium not found");
  }

  const bundle = ensureBundle();
  const sourceMarkdown = await readFile(input.markdownPath, "utf-8");
  const stripped = extractFrontmatter(sourceMarkdown).content;
  const bodyMarkdown = stripLeadingH1(stripped);
  const markdown = rewriteRelativeImagePaths(bodyMarkdown, dirname(input.markdownPath));
  const theme = getWechatPreviewTheme(input.account);
  const shell = readUtf8(TEMPLATE_PATH);
  const payloadJson = escapeInlineJson(
    JSON.stringify({
      markdown,
      editorVars: theme.editorVars,
      exportTheme: theme.exportTheme,
    }),
  );

  const shellHtml = renderTemplate(shell, {
    "{{PAGE_TITLE}}": escapeHtml(input.title ?? "Wechat Preview Export"),
    "{{CSS_LINK}}": bundle.cssPath
      ? `<link rel="stylesheet" href="${pathToFileURL(bundle.cssPath).href}">`
      : "",
    "{{PAYLOAD_JSON}}": payloadJson,
    "{{SCRIPT_URL}}": pathToFileURL(bundle.scriptPath).href,
  });

  const dom = dumpHtmlDom({
    chromePath,
    html: shellHtml,
    virtualTimeBudgetMs: 15000,
  });
  const result = extractRenderResult(dom);
  if (result.status === "error" && "error" in result) {
    throw new Error(`Wechat preview export failed: ${result.error}`);
  }
  if (result.status !== "success" || !("html" in result)) {
    throw new Error(`Wechat preview export did not finish before timeout (status=${result.status})`);
  }

  ensureParentDir(input.outPath);
  await writeFile(input.outPath, result.html, "utf-8");

  let previewShellPath: string | undefined;
  if (input.previewShellOutPath) {
    previewShellPath = await writePreviewShell({
      previewShellOutPath: input.previewShellOutPath,
      pageTitle: input.title ?? "Wechat Preview Export",
      sourceMarkdown: bodyMarkdown,
      sourceMarkdownDir: dirname(input.markdownPath),
      theme,
      bundle,
    });
  }

  return {
    html: result.html,
    htmlPath: input.outPath,
    account: input.account,
    previewStyle: getWechatPreviewStyleName(input.account),
    previewShellPath,
  };
}
