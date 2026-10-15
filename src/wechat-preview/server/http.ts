import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { realpath, stat } from "fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "path";
import { z } from "zod";
import {
  previewBaseUrl,
  resolvePreviewHost,
  resolvePreviewPort,
} from "./paths";
import {
  clearPreviewEntries,
  createPreviewEntry,
  getPreviewEntry,
  listPreviewEntries,
} from "./registry";
import {
  buildLock,
  clearServerLock,
  findExistingServer,
  readServerLock,
  writeServerLock,
} from "./singleton";
import {
  guessContentType,
  readLocalFile,
  resolveLocalFilePath,
  rewriteHtmlLocalAssets,
} from "./local-file";
import { renderDashboardHtml, renderFailedEntryHtml } from "./ui";
import { buildWechatPreviewShell, resolveWechatArticleTheme, rewriteRelativeImagePaths } from "../index";
import { getPluginDocs } from "@akairos/milkdown-article-plugins";
import { readArticleTheme } from "../../article-theme";
import { PipelineConfigSchema, WechatExportThemeOverridesSchema, WechatStructureOverridesSchema } from "../../schema/config";
import { loadConfig, saveConfig, getPipelineConfigPath, resolveConfigRelativePath } from "../../config";
import { DIST_DIR, WECHAT_PREVIEW_DIR } from "../../runtime-paths";
import { resolveMarkdownRenderer } from "../../adapter-loader";
import type { MarkdownStudioAssets } from "../../adapter-types";
import type { PreviewRegisterInput } from "./types";

/** 保存入口先校验完整请求，避免写入 CLI 无法加载的配置。 */
const StudioSaveSchema = z.object({
  account: z.string().trim().regex(/^[a-zA-Z0-9._-]+$/).optional(),
  editorVars: z.record(z.string(), z.string()).optional(),
  exportTheme: WechatExportThemeOverridesSchema.strict().optional(),
  syntaxPresets: z.record(z.string(), z.string()).optional(),
  structure: WechatStructureOverridesSchema.strict().optional(),
  customCss: z.string().optional(),
}).strict();

export interface StartPreviewServerOptions {
  host?: string;
  port?: number;
  open?: boolean;
  /** If true, return early when server already running instead of throwing. */
  reuseExisting?: boolean;
}

export interface StartPreviewServerResult {
  url: string;
  host: string;
  port: number;
  reused: boolean;
  stop?: () => void;
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function startPreviewServer(
  options: StartPreviewServerOptions = {},
): Promise<StartPreviewServerResult> {
  const host = resolvePreviewHost(options.host);
  const port = resolvePreviewPort(options.port);
  const existing = await findExistingServer(host, port);

  if (existing.kind === "running") {
    if (options.reuseExisting !== false) {
      return {
        url: existing.lock.url,
        host: existing.lock.host,
        port: existing.lock.port,
        reused: true,
      };
    }
    throw new Error(
      `WeChat preview server already running at ${existing.lock.url} (pid ${existing.lock.pid})`,
    );
  }

  if (existing.kind === "stale_lock") {
    clearServerLock();
  }

  // 工作台与导出使用同一个插件；没有工作台能力时给出明确提示。
  const pluginConfig = loadConfig();
  const externalMarkdown = Boolean(pluginConfig.plugins.markdownRenderer);
  let studioAssets: Promise<MarkdownStudioAssets | undefined> | undefined;
  /** 按需加载工作台，故障插件不影响预览登记和历史页面。 */
  function getStudio() {
    return studioAssets ??= resolveMarkdownRenderer(pluginConfig).then(async renderer => {
      const studio = await renderer.studio?.();
      return studio ? { ...studio, root: await realpath(studio.root) } : undefined;
    });
  }

  /** 插件静态资源独立挂载，真实路径也必须留在插件资源目录内。 */
  async function studioFile(name: string): Promise<string | null> {
    try {
      if (!externalMarkdown) return null;
      const studioRoot = (await getStudio())?.root;
      if (!studioRoot) return null;
      const target = await realpath(resolve(studioRoot, name));
      const rel = relative(studioRoot, target);
      return rel && !isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`) && (await stat(target)).isFile() ? target : null;
    } catch {
      return null;
    }
  }

  let server: ReturnType<typeof Bun.serve>;
  server = Bun.serve({
    hostname: host,
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;
      const baseUrl = previewBaseUrl(host, server?.port ?? port);

      // 拒绝其他网页跨站修改本地配置或预览记录。
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method) &&
          req.headers.has("origin") && req.headers.get("origin") !== url.origin) {
        return json({ error: "cross-origin writes are not allowed" }, 403);
      }

      if (pathname === "/api/health") {
        return json({ ok: true, service: "wechat-preview", url: baseUrl, pid: process.pid });
      }

      if (pathname === "/api/entries" && req.method === "GET") {
        return json(listPreviewEntries());
      }

      if (pathname === "/api/entries" && req.method === "POST") {
        let body: PreviewRegisterInput;
        try {
          body = (await req.json()) as PreviewRegisterInput;
        } catch {
          return json({ error: "invalid JSON body" }, 400);
        }
        if (!body || typeof body !== "object") {
          return json({ error: "body required" }, 400);
        }
        const entry = createPreviewEntry({
          title: String(body.title ?? "Untitled"),
          account: String(body.account ?? "default"),
          status: body.status === "failed" ? "failed" : "success",
          duration_ms: Number(body.duration_ms) || 0,
          markdown_path: body.markdown_path,
          html_path: body.html_path,
          preview_style: body.preview_style,
          html: body.html,
          error: body.error,
          error_kind: body.error_kind,
          debug: body.debug,
        });
        return json({
          ...entry,
          html: undefined,
          preview_url: `${baseUrl}/e/${entry.id}`,
          dashboard_url: baseUrl,
        }, 201);
      }

      if (pathname === "/api/entries" && req.method === "DELETE") {
        const cleared = clearPreviewEntries();
        return json({ cleared });
      }

      const entryApiMatch = pathname.match(/^\/api\/entries\/([^/]+)$/);
      if (entryApiMatch && req.method === "GET") {
        const id = decodeURIComponent(entryApiMatch[1] ?? "");
        const entry = getPreviewEntry(id);
        if (!entry) return json({ error: "not found" }, 404);
        return json(entry);
      }

      const entryPageMatch = pathname.match(/^\/e\/([^/]+)$/);
      if (entryPageMatch && req.method === "GET") {
        const id = decodeURIComponent(entryPageMatch[1] ?? "");
        const entry = getPreviewEntry(id);
        if (!entry) return html("<h1>Not found</h1>", 404);
        if (entry.status === "failed" || !entry.html) {
          return html(renderFailedEntryHtml(entry));
        }
        const rewritten = rewriteHtmlLocalAssets(entry.html, baseUrl);
        return html(buildWechatPreviewShell(rewritten, entry.title));
      }

      if (pathname === "/local-file" && req.method === "GET") {
        const resolved = resolveLocalFilePath(url.searchParams.get("path"));
        if (!resolved.ok) {
          return json({ error: resolved.error }, resolved.status);
        }
        try {
          const buf = readLocalFile(resolved.path);
          return new Response(new Uint8Array(buf), {
            headers: {
              "content-type": guessContentType(resolved.path),
              "cache-control": "private, max-age=60",
            },
          });
        } catch (error) {
          return json({
            error: error instanceof Error ? error.message : String(error),
          }, 500);
        }
      }

      if (pathname === "/api/studio/config" && req.method === "GET") {
        const config = loadConfig();
        const configPath = getPipelineConfigPath();
        const accountsData: Record<string, unknown> = {};

        for (const [key, account] of Object.entries(config.wx.accounts)) {
          const articleThemePath = resolveConfigRelativePath(account.articleTheme, configPath);
          const articleTheme = articleThemePath ? await readArticleTheme(articleThemePath) : null;
          let customCssContent = "";
          if (account.customCss && articleTheme?.manifest.css === undefined) {
            const resolved = resolveConfigRelativePath(account.customCss, configPath);
            if (resolved) {
              try {
                customCssContent = readFileSync(resolved, "utf-8");
              } catch (error) {
                return json({ error: `Failed to read custom CSS for ${key}: ${String(error)}` }, 500);
              }
            }
          }

          const { theme, structure, syntaxPresets } = resolveWechatArticleTheme(key, account.theme, articleTheme);

          accountsData[key] = {
            name: account.name || key,
            customCssPath: account.customCss,
            customCssContent,
            theme: {
              editorVars: theme.editorVars,
              exportTheme: theme.exportTheme,
              syntaxPresets: syntaxPresets || {},
              structure: structure || {},
            },
            articleThemeCss: articleTheme?.css || "",
            articleTheme: account.articleTheme ?? null,
            articleThemeStandalone: articleTheme?.manifest.css !== undefined,
          };
        }

        let sampleMarkdown = "";
        const fixturePath = join(WECHAT_PREVIEW_DIR, "fixtures/all-nodes.md");
        if (existsSync(fixturePath)) {
          try {
            sampleMarkdown = rewriteRelativeImagePaths(readFileSync(fixturePath, "utf-8"), dirname(fixturePath));
          } catch {
            // ignore
          }
        }

        return json({
          defaultAccount: config.wx.defaultAccount || "default",
          accounts: accountsData,
          plugins: getPluginDocs(),
          sampleMarkdown,
        });
      }

      if (pathname === "/api/studio/save-config" && req.method === "POST") {
        let rawBody: unknown;
        try {
          rawBody = await req.json();
        } catch {
          return json({ error: "invalid JSON body" }, 400);
        }
        const parsed = StudioSaveSchema.safeParse(rawBody);
        if (!parsed.success) return json({ error: parsed.error.message }, 400);
        const body = parsed.data;

        const config = loadConfig();
        const accountKey = body.account ?? config.wx.defaultAccount;
        if (!Object.hasOwn(config.wx.accounts, accountKey)) return json({ error: "account not found" }, 404);

        const account = config.wx.accounts[accountKey];
        if (body.editorVars) {
          account.theme.editorVars = { ...account.theme.editorVars, ...body.editorVars };
        }
        if (body.exportTheme) {
          account.theme.exportTheme = { ...account.theme.exportTheme, ...body.exportTheme };
        }
        if (body.syntaxPresets) {
          account.theme.syntaxPresets = body.syntaxPresets;
        }
        if (body.structure) {
          account.theme.structure = { ...account.theme.structure, ...body.structure };
        }

        if (typeof body.customCss === "string") {
          const configPath = getPipelineConfigPath();
          let cssPath = account.customCss
            ? resolveConfigRelativePath(account.customCss, configPath)
            : null;

          if (!cssPath) {
            cssPath = join(dirname(configPath), `custom-css-${accountKey}.css`);
            account.customCss = `custom-css-${accountKey}.css`;
          }

          try {
            mkdirSync(dirname(cssPath), { recursive: true });
            writeFileSync(cssPath, body.customCss, "utf-8");
          } catch (err) {
            return json({ error: `Failed to write custom CSS: ${String(err)}` }, 500);
          }
        }

        try {
          saveConfig(PipelineConfigSchema.parse(config));
          return json({ ok: true, account: accountKey, message: "Configuration saved successfully" });
        } catch (err) {
          return json({ error: `Failed to save config: ${String(err)}` }, 500);
        }
      }

      if (pathname === "/studio" || pathname === "/studio/" || pathname === "/studio/index.html") {
        if (externalMarkdown) {
          let studio: MarkdownStudioAssets | undefined;
          try { studio = await getStudio(); }
          catch (error) { return json({ error: error instanceof Error ? error.message : String(error) }, 500); }
          if (!studio) return html("<h1>当前 Markdown 渲染插件未提供 Studio 工作台。</h1>", 404);
          const entry = await studioFile(studio.entry);
          if (!entry) return html("<h1>插件 Studio 入口不存在或超出资源目录。</h1>", 500);
          // 相对资源按插件入口解析，统一放入命名空间且保留页面导航链接。
          return html(readFileSync(entry, "utf8").replace(/<(?:script|link)\b[^>]*>/g,
            tag => tag.replace(/\b(src|href)=(["'])([^"']+)\2/g, (attribute, name, quote, value: string) => {
              if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i.test(value)) return attribute;
              const asset = new URL(value, `http://studio/${studio.entry}`);
              return `${name}=${quote}/studio-assets${asset.pathname}${asset.search}${quote}`;
            })));
        }
        const studioHtmlPath = join(DIST_DIR, "src/wechat-preview/browser/studio/studio.html");
        const fallbackPath = join(DIST_DIR, "studio.html");
        const targetHtmlPath = existsSync(studioHtmlPath) ? studioHtmlPath : fallbackPath;
        if (existsSync(targetHtmlPath)) {
          return html(readFileSync(targetHtmlPath, "utf-8"));
        }
        return html("<h1>Studio not built. Run bun run build:wechat-preview first.</h1>", 500);
      }

      if (pathname.startsWith("/studio-assets/")) {
        let name: string;
        try { name = decodeURIComponent(pathname.slice("/studio-assets/".length)); }
        catch { return json({ error: "invalid asset path" }, 400); }
        const target = await studioFile(name);
        if (!target) return json({ error: "Studio asset not found" }, 404);
        return new Response(new Uint8Array(readFileSync(target)), {
          headers: { "content-type": guessContentType(target), "cache-control": "no-cache" },
        });
      }

      if (pathname === "/studio.js" || pathname === "/editor-export.js") {
        const filePath = join(DIST_DIR, pathname.slice(1));
        if (existsSync(filePath)) {
          return new Response(readFileSync(filePath), {
            headers: {
              "content-type": "application/javascript; charset=utf-8",
              "cache-control": "no-cache",
            },
          });
        }
      }

      if (pathname.startsWith("/assets/")) {
        const filePath = join(DIST_DIR, pathname.slice(1));
        if (existsSync(filePath)) {
          return new Response(readFileSync(filePath), {
            headers: {
              "content-type": guessContentType(filePath),
              "cache-control": "public, max-age=3600",
            },
          });
        }
      }

      if (pathname === "/" || pathname === "/index.html") {
        return html(renderDashboardHtml(baseUrl));
      }

      return json({ error: "not found" }, 404);
    },
  });

  const boundPort = server.port;
  if (typeof boundPort !== "number") {
    server.stop(true);
    throw new Error("WeChat preview server failed to bind a port");
  }

  const lock = buildLock(host, boundPort, process.pid);
  writeServerLock(lock);

  const stop = () => {
    try {
      server.stop(true);
    } catch {
      // ignore
    }
    const existingLock = readServerLock();
    if (existingLock && existingLock.pid === process.pid) {
      clearServerLock();
    }
  };

  process.on("exit", stop);
  process.on("SIGINT", () => {
    stop();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    stop();
    process.exit(0);
  });

  return {
    url: lock.url,
    host: lock.host,
    port: lock.port,
    reused: false,
    stop,
  };
}
