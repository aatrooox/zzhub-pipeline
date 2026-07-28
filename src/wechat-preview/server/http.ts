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
import { buildWechatPreviewShell } from "../index";
import type { PreviewRegisterInput } from "./types";

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

  const baseUrl = previewBaseUrl(host, port);

  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(req) {
      const url = new URL(req.url);
      const { pathname } = url;

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
