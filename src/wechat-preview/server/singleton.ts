import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import {
  ensurePreviewServerDirs,
  getPreviewServerLockPath,
  previewBaseUrl,
  resolvePreviewHost,
  resolvePreviewPort,
} from "./paths";
import type { PreviewServerLock } from "./types";

function isProcessAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function readServerLock(): PreviewServerLock | null {
  const path = getPreviewServerLockPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PreviewServerLock;
  } catch {
    return null;
  }
}

export function writeServerLock(lock: PreviewServerLock): void {
  ensurePreviewServerDirs();
  writeFileSync(getPreviewServerLockPath(), JSON.stringify(lock, null, 2), "utf-8");
}

export function clearServerLock(): void {
  const path = getPreviewServerLockPath();
  if (existsSync(path)) {
    try {
      unlinkSync(path);
    } catch {
      // ignore
    }
  }
}

export async function probeHealth(url: string, timeoutMs = 800): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/api/health`, {
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { ok?: boolean; service?: string };
    return body.ok === true && body.service === "wechat-preview";
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export type ExistingServerResult =
  | { kind: "running"; lock: PreviewServerLock }
  | { kind: "stale_lock"; lock: PreviewServerLock | null }
  | { kind: "none" };

/**
 * Check if a live singleton server is already serving.
 */
export async function findExistingServer(
  host = resolvePreviewHost(),
  port = resolvePreviewPort(),
): Promise<ExistingServerResult> {
  const lock = readServerLock();
  if (lock) {
    const url = lock.url || previewBaseUrl(lock.host, lock.port);
    if (isProcessAlive(lock.pid) && (await probeHealth(url))) {
      return { kind: "running", lock: { ...lock, url } };
    }
    // try health even if pid check fails (different user namespaces)
    if (await probeHealth(url)) {
      return { kind: "running", lock: { ...lock, url } };
    }
  }

  // Probe default/requested address without lock
  const url = previewBaseUrl(host, port);
  if (await probeHealth(url)) {
    return {
      kind: "running",
      lock: {
        pid: lock?.pid ?? 0,
        host,
        port,
        url,
        started_at: lock?.started_at ?? new Date().toISOString(),
      },
    };
  }

  if (lock && !isProcessAlive(lock.pid)) {
    return { kind: "stale_lock", lock };
  }

  return { kind: "none" };
}

export function buildLock(host: string, port: number, pid = process.pid): PreviewServerLock {
  return {
    pid,
    host,
    port,
    url: previewBaseUrl(host, port),
    started_at: new Date().toISOString(),
  };
}
