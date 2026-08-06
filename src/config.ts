import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "fs";
import { homedir, platform } from "os";
import { dirname, isAbsolute, join, resolve } from "path";
import { PipelineConfigSchema } from "./schema/config";

import type {
  PipelineConfig,
  WxAccountConfig,
} from "./schema/config";

// ── Re-export types from schema ───────────────────────────────────

export type {
  WxAccountConfig,
  WxConfig,
  PipelinePathConfig,
  PipelineServiceConfig,
  PipelineCommandConfig,
  CosConfig,
  PluginsConfig,
  ImgxConfig,
  PipelineConfig,
  WechatExportThemeOverrides,
  WechatThemeOverrides,
} from "./schema/config";

export { PipelineConfigSchema } from "./schema/config";

export interface ResolvedWorkspacePaths {
  postsRoot: string;
  tempRoot: string;
  blogRoot: string;
  zotepadExportHtml: string;
}

const DEFAULT_WX_ACCOUNT_NAME = "default";

/**
 * Soft display names for known account keys when `name` is missing/empty.
 * Never overrides a user-set name.
 */
export const SUGGESTED_ACCOUNT_NAMES: Record<string, string> = {
  default: "大号（早早集市）",
  ancientone: "小号（古一）",
};

export const DEFAULT_CONFIG: PipelineConfig = PipelineConfigSchema.parse({});

const PIPELINE_CONFIG_DIR = "zzhub-pipeline";
const PIPELINE_CONFIG_FILE = "config.json";
const LEGACY_ZCLI_CONFIG_DIR = "zzclub-z-cli";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getBaseConfigDir(appDir: string): string {
  const home = homedir();
  const currentPlatform = platform();

  if (currentPlatform === "win32") {
    const appData = process.env.APPDATA;
    if (appData) {
      return join(appData, appDir);
    }
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

export function getPipelineConfigPath(): string {
  const override = process.env.ZZHUB_PIPELINE_CONFIG;
  if (override && override.trim()) {
    return resolve(override);
  }
  return join(getBaseConfigDir(PIPELINE_CONFIG_DIR), PIPELINE_CONFIG_FILE);
}

/** Resolve a file path stored in config relative to the config file directory. */
export function resolveConfigRelativePath(
  value: string | null | undefined,
  configPath: string = getPipelineConfigPath(),
): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return isAbsolute(trimmed)
    ? resolve(trimmed)
    : resolve(dirname(configPath), trimmed);
}

export function getLegacyZCliConfigPath(): string {
  return join(getBaseConfigDir(LEGACY_ZCLI_CONFIG_DIR), PIPELINE_CONFIG_FILE);
}

/**
 * Merge source config with legacy config, then normalize through Zod schema.
 * Legacy values fill gaps where source has nothing.
 * Soft-fills known account display `name` only when missing/empty.
 */
export function normalizeConfig(value: unknown, legacyValue?: unknown): PipelineConfig {
  const source = isPlainObject(value) ? value : {};
  const legacy = isPlainObject(legacyValue) ? legacyValue : {};

  // Merge wx accounts: source wins, legacy fills gaps
  const sourceWx = isPlainObject(source.wx) ? source.wx : {};
  const legacyWx = isPlainObject(legacy.wx) ? legacy.wx : {};
  const sourceAccounts = isPlainObject(sourceWx.accounts) ? sourceWx.accounts : {};
  const legacyAccounts = isPlainObject(legacyWx.accounts) ? legacyWx.accounts : {};
  const mergedAccounts: Record<string, unknown> = {};

  // Start with legacy accounts, then overlay source
  for (const name of new Set([...Object.keys(legacyAccounts), ...Object.keys(sourceAccounts), DEFAULT_WX_ACCOUNT_NAME])) {
    const accountName = name.trim();
    if (!accountName) continue;
    const legacyAccount = isPlainObject(legacyAccounts[accountName]) ? legacyAccounts[accountName] : {};
    const sourceAccount = isPlainObject(sourceAccounts[accountName]) ? sourceAccounts[accountName] : {};
    const merged = { ...legacyAccount, ...sourceAccount };
    // Trim + soft-fill display name for known keys only when missing/empty (never override user-set name).
    if (typeof merged.name === "string") {
      merged.name = merged.name.trim();
    }
    const existingName = typeof merged.name === "string" ? merged.name : "";
    if (!existingName && SUGGESTED_ACCOUNT_NAMES[accountName]) {
      merged.name = SUGGESTED_ACCOUNT_NAMES[accountName];
    }
    mergedAccounts[accountName] = merged;
  }

  // Merge wx config: source wins, legacy fills gaps
  const mergedWx = {
    ...legacyWx,
    ...sourceWx,
    accounts: mergedAccounts,
  };

  // Merge paths: source wins, legacy fills gaps
  const mergedPaths = {
    ...(isPlainObject(legacy.paths) ? legacy.paths : {}),
    ...(isPlainObject(source.paths) ? source.paths : {}),
  };

  // Merge services
  const mergedServices = {
    ...(isPlainObject(legacy.services) ? legacy.services : {}),
    ...(isPlainObject(source.services) ? source.services : {}),
  };

  // Merge commands
  const mergedCommands = {
    ...(isPlainObject(legacy.commands) ? legacy.commands : {}),
    ...(isPlainObject(source.commands) ? source.commands : {}),
  };

  // Merge cos
  const mergedCos = {
    ...(isPlainObject(legacy.cos) ? legacy.cos : {}),
    ...(isPlainObject(source.cos) ? source.cos : {}),
  };

  // Merge plugins: source wins, legacy fills gaps
  const mergedPlugins = {
    ...(isPlainObject(legacy.plugins) ? legacy.plugins : {}),
    ...(isPlainObject(source.plugins) ? source.plugins : {}),
  };

  // Merge imgx: source wins, legacy fills gaps
  const mergedImgx = {
    ...(isPlainObject(legacy.imgx) ? legacy.imgx : {}),
    ...(isPlainObject(source.imgx) ? source.imgx : {}),
  };

  // Parse through Zod schema — applies defaults and validation
  return PipelineConfigSchema.parse({
    paths: mergedPaths,
    services: mergedServices,
    commands: mergedCommands,
    wx: mergedWx,
    cos: mergedCos,
    plugins: mergedPlugins,
    imgx: mergedImgx,
  });
}

function readJsonFile(path: string, label: string): unknown {
  if (!existsSync(path)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch (error) {
    throw new Error(
      `Failed to read ${label} at ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export function loadConfig(): PipelineConfig {
  const config = readJsonFile(getPipelineConfigPath(), "pipeline config");
  const legacy = readJsonFile(getLegacyZCliConfigPath(), "legacy pipeline config");
  return normalizeConfig(config, legacy);
}

export function saveConfig(config: PipelineConfig): void {
  const configPath = getPipelineConfigPath();
  const configDir = dirname(configPath);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  const tempPath = `${configPath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    writeFileSync(tempPath, JSON.stringify(config, null, 2), {
      encoding: "utf-8",
      mode: 0o600,
    });
    renameSync(tempPath, configPath);
    chmodSync(configPath, 0o600);
  } catch (error) {
    try {
      rmSync(tempPath, { force: true });
    } catch {
      // Preserve the original write/rename error.
    }
    throw error;
  }
}

function resolveMaybeRelative(
  workspaceRoot: string,
  value: string | null | undefined,
  fallbackRelative: string[],
): string {
  if (!value) {
    return join(workspaceRoot, ...fallbackRelative);
  }
  return isAbsolute(value) ? value : join(workspaceRoot, value);
}

function resolveRootPath(value: string): string {
  return isAbsolute(value) ? value : resolve(value);
}

export function resolveWorkspaceRoot(
  workspaceRoot: string | null | undefined,
  config: PipelineConfig = loadConfig(),
): string {
  const env = process.env;
  const configured =
    env.ZZHUB_PIPELINE_WORKSPACE_ROOT?.trim() ||
    config.paths.workspaceRoot?.trim() ||
    "";
  const fallback = process.cwd();
  const candidate = workspaceRoot?.trim() || configured || fallback;
  return resolveRootPath(candidate);
}

export function resolveWorkspacePaths(
  workspaceRoot: string,
  config: PipelineConfig = loadConfig(),
): ResolvedWorkspacePaths {
  const env = process.env;
  const postsDirName =
    env.ZZHUB_PIPELINE_POSTS_DIR?.trim() || config.paths.postsDirName;

  return {
    postsRoot: join(workspaceRoot, postsDirName),
    tempRoot: join(workspaceRoot, ".zzhub-media", "tmp"),
    blogRoot: resolveMaybeRelative(
      workspaceRoot,
      env.ZZHUB_PIPELINE_BLOG_ROOT ?? config.paths.blogRoot,
      ["blog"],
    ),
    zotepadExportHtml: resolveMaybeRelative(
      workspaceRoot,
      env.ZZHUB_PIPELINE_ZOTEPAD_EXPORT_HTML ?? config.paths.zotepadExportHtml,
      ["zotepad-exports", "html", "post.html"],
    ),
  };
}

function sanitizePathSegment(value: string): string {
  const sanitized = value
    .replace(/[\/\\:*?"<>|\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/g, "");
  return sanitized || "untitled";
}

export function renderPostsRelativePath(
  config: PipelineConfig,
  metadata: { date: string; slug: string; title: string },
): string {
  const month = metadata.date.match(/^\d{4}-\d{2}/)?.[0] || metadata.date;
  const tokens = {
    "{date}": sanitizePathSegment(metadata.date),
    "{yyyy-MM}": sanitizePathSegment(month),
    "{slug}": sanitizePathSegment(metadata.slug),
    "{title}": sanitizePathSegment(metadata.title),
  };
  const raw = config.paths.postsPathPattern
    .replaceAll("{date}", tokens["{date}"])
    .replaceAll("{yyyy-MM}", tokens["{yyyy-MM}"])
    .replaceAll("{slug}", tokens["{slug}"])
    .replaceAll("{title}", tokens["{title}"]);
  const segments = raw
    .split(/[\\/]+/)
    .map((segment) => sanitizePathSegment(segment))
    .filter(Boolean);
  return segments.join("/");
}

export function getConfigValue(config: PipelineConfig, key: string): unknown {
  return key.split(".").reduce<unknown>((current, segment) => {
    if (!segment) {
      return current;
    }
    if (!isPlainObject(current) && !Array.isArray(current)) {
      return undefined;
    }
    return (current as Record<string, unknown>)[segment];
  }, config as unknown);
}

function redactSecret(value: string): string {
  if (!value) {
    return value;
  }
  if (value.length <= 6) {
    return "***";
  }
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

function redactIfSensitive(key: string, value: unknown): unknown {
  if (
    typeof value === "string" &&
    /(pat|secret|token)$/i.test(key)
  ) {
    return redactSecret(value);
  }
  return value;
}

export function redactConfig(config: PipelineConfig): PipelineConfig {
  const next = JSON.parse(JSON.stringify(config)) as PipelineConfig;
  for (const account of Object.values(next.wx.accounts) as WxAccountConfig[]) {
    account.pat = redactSecret(account.pat);
    account.appSecret = redactSecret(account.appSecret);
  }
  next.services.zotepadToken = redactSecret(next.services.zotepadToken);
  next.cos.pat = redactSecret(next.cos.pat);
  return next;
}

export function redactConfigValue(key: string, value: unknown): unknown {
  return redactIfSensitive(key, value);
}

function parseScalarValue(rawValue: string): unknown {
  const trimmed = rawValue.trim();
  if (trimmed === "true") return true;
  if (trimmed === "false") return false;
  if (trimmed === "null") return null;
  if (trimmed && /^-?\d+(\.\d+)?$/.test(trimmed)) {
    return Number(trimmed);
  }
  if (
    (trimmed.startsWith("{") && trimmed.endsWith("}")) ||
    (trimmed.startsWith("[") && trimmed.endsWith("]"))
  ) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return rawValue;
    }
  }
  return rawValue;
}

export function setConfigValue(
  config: PipelineConfig,
  key: string,
  rawValue: string,
): PipelineConfig {
  const next = JSON.parse(JSON.stringify(config)) as PipelineConfig;
  const segments = key.split(".").filter(Boolean);
  if (segments.length === 0) {
    throw new Error("config key cannot be empty");
  }

  let current: Record<string, unknown> = next as unknown as Record<string, unknown>;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (!isPlainObject(existing)) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }

  current[segments[segments.length - 1] as string] = parseScalarValue(rawValue);
  return normalizeConfig(next);
}

export function configSummary(config: PipelineConfig): Record<string, unknown> {
  return {
    config_path: getPipelineConfigPath(),
    legacy_config_path: getLegacyZCliConfigPath(),
    config: redactConfig(config),
  };
}
