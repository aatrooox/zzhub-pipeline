import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { dirname, isAbsolute, join, resolve } from "path";
import { pathToFileURL } from "url";
import {
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
} from "../runtime-paths";
import { extractFrontmatter } from "./frontmatter-handler";
import { getWechatPreviewStyleName, getWechatPreviewTheme } from "./themes";
import { stripLeadingH1 } from "../text";

interface ViteManifestEntry {
  file: string;
}

interface BundleAssets {
  scriptPath: string;
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
    throw new Error(
      "Chrome/Chromium not found. Required for WeChat HTML export.\n" +
      "Install one of:\n" +
      "  macOS:   brew install --cask chromium\n" +
      "  Ubuntu:  sudo apt install chromium-browser\n" +
      "  Or install Google Chrome from https://www.google.com/chrome/\n" +
      "  Or set CHROME_PATH environment variable to the binary path.",
    );
  }

  const bundle = ensureBundle();
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
    "{{PAGE_TITLE}}": escapeHtml(input.title ?? "Wechat Preview Export"),
    "{{CSS_LINK}}": "",
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
    previewShellPath = await writePreviewShell(
      input.previewShellOutPath,
      input.title ?? "Wechat Preview Export",
      result.html,
    );
  }

  return {
    html: result.html,
    htmlPath: input.outPath,
    account: input.account,
    previewStyle: getWechatPreviewStyleName(input.account),
    previewShellPath,
  };
}
