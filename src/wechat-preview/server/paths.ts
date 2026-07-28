/**
 * Data directory for the singleton WeChat preview server.
 * Mirrors config base-dir resolution in src/config.ts.
 */

import { existsSync, mkdirSync } from "fs";
import { homedir, platform } from "os";
import { join } from "path";

const APP_DIR = "zzhub-pipeline";
const SERVER_DIR = "wechat-preview";

export const DEFAULT_PREVIEW_HOST = "127.0.0.1";
export const DEFAULT_PREVIEW_PORT = 18765;

function getBaseConfigDir(appDir: string): string {
  const home = homedir();
  const currentPlatform = platform();

  if (currentPlatform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) return join(appData, appDir);
    return join(home, "AppData", "Roaming", appDir);
  }

  if (currentPlatform === "darwin") {
    return join(home, "Library", "Application Support", appDir);
  }

  const xdgConfigHome = process.env.XDG_CONFIG_HOME;
  if (xdgConfigHome && xdgConfigHome.trim().length > 0) {
    return join(xdgConfigHome, appDir);
  }

  return join(home, ".config", appDir);
}

export function getPreviewServerDir(): string {
  const override = process.env.ZZHUB_WECHAT_PREVIEW_DIR?.trim();
  if (override) return override;
  return join(getBaseConfigDir(APP_DIR), SERVER_DIR);
}

export function getPreviewServerLockPath(): string {
  return join(getPreviewServerDir(), "server.json");
}

export function getPreviewEntriesDir(): string {
  return join(getPreviewServerDir(), "entries");
}

export function ensurePreviewServerDirs(): void {
  const root = getPreviewServerDir();
  const entries = getPreviewEntriesDir();
  if (!existsSync(root)) mkdirSync(root, { recursive: true });
  if (!existsSync(entries)) mkdirSync(entries, { recursive: true });
}

export function resolvePreviewPort(port?: number): number {
  if (typeof port === "number" && Number.isFinite(port) && port > 0) {
    return Math.floor(port);
  }
  const env = process.env.ZZHUB_WECHAT_PREVIEW_PORT?.trim();
  if (env) {
    const n = Number(env);
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return DEFAULT_PREVIEW_PORT;
}

export function resolvePreviewHost(host?: string): string {
  if (host && host.trim()) return host.trim();
  const env = process.env.ZZHUB_WECHAT_PREVIEW_HOST?.trim();
  if (env) return env;
  return DEFAULT_PREVIEW_HOST;
}

export function previewBaseUrl(host: string, port: number): string {
  return `http://${host}:${port}`;
}
