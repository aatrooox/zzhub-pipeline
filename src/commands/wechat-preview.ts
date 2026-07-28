import { spawn } from "child_process";
import { flagArg, optionalArg, parseArgs } from "../args";
import { printResult } from "../output";
import {
  clearPreviewEntries,
  getPreviewServerStatus,
  listPreviewEntries,
  resolvePreviewHost,
  resolvePreviewPort,
  startPreviewServer,
} from "../wechat-preview/server";

async function openUrl(url: string): Promise<void> {
  const opener =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "cmd"
        : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  try {
    spawn(opener, args, { detached: true, stdio: "ignore" }).unref();
  } catch {
    // non-fatal
  }
}

function printHelp(): void {
  console.log(`
Usage: zzhub-pipeline wechat-preview <subcommand> [options]

Subcommands:
  serve     Start the singleton local preview server (or print existing URL)
  status    Show whether the preview server is running
  open      Open the dashboard in a browser
  list      List registered preview entries
  clear     Clear all preview entries

serve options:
  --host    Bind host (default: 127.0.0.1, env ZZHUB_WECHAT_PREVIEW_HOST)
  --port    Bind port (default: 18765, env ZZHUB_WECHAT_PREVIEW_PORT)
  --open    Open the dashboard after start
  --force   Fail if a server is already running (default: reuse existing)

Environment:
  ZZHUB_WECHAT_PREVIEW_DIR   Data/lock directory override
`.trim());
}

export async function wechatPreview(args: string[]): Promise<void> {
  const sub = args[0];
  const rest = args.slice(1);
  const parsed = parseArgs(rest);

  if (!sub || sub === "help" || sub === "--help" || parsed.help) {
    printHelp();
    return;
  }

  if (sub === "serve") {
    const host = optionalArg(parsed, "host");
    const portRaw = optionalArg(parsed, "port");
    const port = portRaw ? Number(portRaw) : undefined;
    const open = flagArg(parsed, "open");
    const force = flagArg(parsed, "force");

    const result = await startPreviewServer({
      host,
      port: port !== undefined && Number.isFinite(port) ? port : undefined,
      open,
      reuseExisting: !force,
    });

    if (open) {
      await openUrl(result.url);
    }

    printResult({
      action: "serve",
      url: result.url,
      host: result.host,
      port: result.port,
      reused: result.reused,
      message: result.reused
        ? `Already running at ${result.url}`
        : `Listening on ${result.url}`,
    });

    // Keep process alive when we own the server
    if (!result.reused) {
      await new Promise<void>(() => {
        // blocked until SIGINT/SIGTERM
      });
    }
    return;
  }

  if (sub === "status") {
    const host = optionalArg(parsed, "host");
    const portRaw = optionalArg(parsed, "port");
    const port = portRaw ? Number(portRaw) : undefined;
    const status = await getPreviewServerStatus({
      host: host ?? resolvePreviewHost(),
      port: port !== undefined && Number.isFinite(port) ? port : resolvePreviewPort(),
    });
    printResult({ action: "status", ...status });
    return;
  }

  if (sub === "open") {
    const status = await getPreviewServerStatus();
    if (!status.running || !status.url) {
      throw new Error(
        "WeChat preview server is not running. Start with: wechat-preview serve",
      );
    }
    await openUrl(status.url);
    printResult({ action: "open", url: status.url });
    return;
  }

  if (sub === "list") {
    const status = await getPreviewServerStatus();
    if (status.running) {
      // Prefer live server list
      try {
        const res = await fetch(`${status.url}/api/entries`);
        if (res.ok) {
          printResult({ action: "list", entries: await res.json() });
          return;
        }
      } catch {
        // fall through to disk
      }
    }
    printResult({ action: "list", entries: listPreviewEntries(), source: "disk" });
    return;
  }

  if (sub === "clear") {
    const status = await getPreviewServerStatus();
    if (status.running && status.url) {
      try {
        const res = await fetch(`${status.url}/api/entries`, { method: "DELETE" });
        if (res.ok) {
          const body = (await res.json()) as { cleared?: number };
          printResult({ action: "clear", cleared: body.cleared ?? 0, via: "server" });
          return;
        }
      } catch {
        // fall through
      }
    }
    const cleared = clearPreviewEntries();
    printResult({ action: "clear", cleared, via: "disk" });
    return;
  }

  throw new Error(`Unknown wechat-preview subcommand: ${sub}`);
}
