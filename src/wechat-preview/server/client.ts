import { spawn } from "child_process";
import { resolve } from "path";
import { PACKAGE_ROOT } from "../../runtime-paths";
import {
  DEFAULT_PREVIEW_HOST,
  DEFAULT_PREVIEW_PORT,
  previewBaseUrl,
  resolvePreviewHost,
  resolvePreviewPort,
} from "./paths";
import { findExistingServer, probeHealth } from "./singleton";
import type { PreviewEntryMeta, PreviewRegisterInput } from "./types";

export interface RegisterPreviewResult {
  ok: boolean;
  preview_url?: string;
  dashboard_url?: string;
  id?: string;
  error?: string;
}

export interface EnsurePreviewServerOptions {
  host?: string;
  port?: number;
  autoStart?: boolean;
  /** Max wait for auto-started server readiness. */
  waitMs?: number;
}

/**
 * Ensure a preview server is reachable. Optionally spawn one in the background.
 */
export async function ensurePreviewServer(
  options: EnsurePreviewServerOptions = {},
): Promise<{ url: string; started: boolean }> {
  const host = resolvePreviewHost(options.host);
  const port = resolvePreviewPort(options.port);
  const existing = await findExistingServer(host, port);
  if (existing.kind === "running") {
    return { url: existing.lock.url, started: false };
  }

  if (!options.autoStart) {
    throw new Error(
      `WeChat preview server is not running at ${previewBaseUrl(host, port)}. ` +
        `Start it with: bun run src/cli.ts wechat-preview serve`,
    );
  }

  const args = [
    resolve(PACKAGE_ROOT, "src/cli.ts"),
    "wechat-preview",
    "serve",
    "--host",
    host,
    "--port",
    String(port),
  ];

  const child = spawn(process.execPath, args, {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      ZZHUB_WECHAT_PREVIEW_HOST: host,
      ZZHUB_WECHAT_PREVIEW_PORT: String(port),
    },
  });
  child.unref();

  const url = previewBaseUrl(host, port);
  const deadline = Date.now() + (options.waitMs ?? 8000);
  while (Date.now() < deadline) {
    if (await probeHealth(url, 400)) {
      return { url, started: true };
    }
    await Bun.sleep(150);
  }

  throw new Error(
    `Timed out waiting for WeChat preview server at ${url} (spawned pid ${child.pid ?? "?"})`,
  );
}

export async function registerPreviewEntry(
  input: PreviewRegisterInput,
  options: EnsurePreviewServerOptions = {},
): Promise<RegisterPreviewResult> {
  try {
    const { url } = await ensurePreviewServer({
      autoStart: options.autoStart ?? true,
      host: options.host,
      port: options.port,
      waitMs: options.waitMs,
    });

    const res = await fetch(`${url.replace(/\/$/, "")}/api/entries`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: `register failed (${res.status}): ${text}` };
    }
    const body = (await res.json()) as PreviewEntryMeta & {
      preview_url?: string;
      dashboard_url?: string;
    };
    return {
      ok: true,
      id: body.id,
      preview_url: body.preview_url ?? `${url}/e/${body.id}`,
      dashboard_url: body.dashboard_url ?? url,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function getPreviewServerStatus(options: {
  host?: string;
  port?: number;
} = {}): Promise<{
  running: boolean;
  url?: string;
  host?: string;
  port?: number;
  entries?: number;
}> {
  const host = resolvePreviewHost(options.host);
  const port = resolvePreviewPort(options.port);
  const existing = await findExistingServer(host, port);
  if (existing.kind !== "running") {
    return { running: false, host, port };
  }
  let entries: number | undefined;
  try {
    const res = await fetch(`${existing.lock.url}/api/entries`);
    if (res.ok) {
      const list = (await res.json()) as unknown[];
      entries = Array.isArray(list) ? list.length : undefined;
    }
  } catch {
    // ignore
  }
  return {
    running: true,
    url: existing.lock.url,
    host: existing.lock.host,
    port: existing.lock.port,
    entries,
  };
}

export function defaultPreviewListen(): { host: string; port: number } {
  return {
    host: DEFAULT_PREVIEW_HOST,
    port: DEFAULT_PREVIEW_PORT,
  };
}
