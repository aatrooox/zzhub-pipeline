import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { homedir, platform } from "os";
import { dirname, isAbsolute, join, resolve } from "path";

export interface WxAccountConfig {
  pat: string;
  appId: string;
  appSecret: string;
}

export interface WxConfig {
  baseUrl: string;
  timeout: number;
  defaultAccount: string;
  accounts: Record<string, WxAccountConfig>;
}

export interface PipelinePathConfig {
  workspaceRoot: string | null;
  postsDirName: string;
  postsPathPattern: string;
  blogRoot: string | null;
  zotepadExportHtml: string | null;
}

export interface PipelineServiceConfig {
  zotepadBaseUrl: string;
  zotepadToken: string;
}

export interface PipelineCommandConfig {
  blogPublish: string[];
}

export interface CosConfig {
  pat: string;
}

export interface PipelineConfig {
  paths: PipelinePathConfig;
  services: PipelineServiceConfig;
  commands: PipelineCommandConfig;
  wx: WxConfig;
  cos: CosConfig;
}

export interface ResolvedWorkspacePaths {
  postsRoot: string;
  tempRoot: string;
  blogRoot: string;
  zotepadExportHtml: string;
}

const DEFAULT_WX_ACCOUNT_NAME = "default";
const DEFAULT_WX_ACCOUNT_CONFIG: WxAccountConfig = {
  pat: "",
  appId: "",
  appSecret: "",
};

export const DEFAULT_CONFIG: PipelineConfig = {
  paths: {
    workspaceRoot: null,
    postsDirName: "posts",
    postsPathPattern: "{date}-{slug}",
    blogRoot: null,
    zotepadExportHtml: null,
  },
  services: {
    zotepadBaseUrl: "http://127.0.0.1:54577",
    zotepadToken: "zotepad-dev-token",
  },
  commands: {
    blogPublish: ["pnpm", "publish:post"],
  },
  wx: {
    baseUrl: "https://zzao.club",
    timeout: 30000,
    defaultAccount: DEFAULT_WX_ACCOUNT_NAME,
    accounts: {
      [DEFAULT_WX_ACCOUNT_NAME]: { ...DEFAULT_WX_ACCOUNT_CONFIG },
    },
  },
  cos: {
    pat: "",
  },
};

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

export function getLegacyZCliConfigPath(): string {
  return join(getBaseConfigDir(LEGACY_ZCLI_CONFIG_DIR), PIPELINE_CONFIG_FILE);
}

function normalizeWxAccount(value: unknown): WxAccountConfig {
  const source = isPlainObject(value) ? value : {};
  return {
    pat: typeof source.pat === "string" ? source.pat : "",
    appId: typeof source.appId === "string" ? source.appId : "",
    appSecret: typeof source.appSecret === "string" ? source.appSecret : "",
  };
}

function fillWxAccount(base: WxAccountConfig, fallback: WxAccountConfig): WxAccountConfig {
  return {
    pat: base.pat || fallback.pat,
    appId: base.appId || fallback.appId,
    appSecret: base.appSecret || fallback.appSecret,
  };
}

function normalizeWxConfig(value: unknown, fallbackValue?: unknown): WxConfig {
  const source = isPlainObject(value) ? value : {};
  const fallback = isPlainObject(fallbackValue) ? fallbackValue : {};

  const baseUrl =
    (typeof source.baseUrl === "string" && source.baseUrl.trim()) ||
    (typeof fallback.baseUrl === "string" && fallback.baseUrl.trim()) ||
    DEFAULT_CONFIG.wx.baseUrl;

  const timeout =
    (typeof source.timeout === "number" && Number.isFinite(source.timeout) && source.timeout > 0
      ? source.timeout
      : undefined) ??
    (typeof fallback.timeout === "number" && Number.isFinite(fallback.timeout) && fallback.timeout > 0
      ? fallback.timeout
      : undefined) ??
    DEFAULT_CONFIG.wx.timeout;

  const defaultAccount =
    (typeof source.defaultAccount === "string" && source.defaultAccount.trim()) ||
    (typeof fallback.defaultAccount === "string" && fallback.defaultAccount.trim()) ||
    DEFAULT_WX_ACCOUNT_NAME;

  const accounts: Record<string, WxAccountConfig> = {};
  const sourceAccounts = isPlainObject(source.accounts) ? source.accounts : {};
  const fallbackAccounts = isPlainObject(fallback.accounts) ? fallback.accounts : {};
  const accountNames = new Set([
    ...Object.keys(fallbackAccounts),
    ...Object.keys(sourceAccounts),
    defaultAccount,
  ]);

  for (const name of accountNames) {
    const accountName = name.trim();
    if (!accountName) {
      continue;
    }
    const base = normalizeWxAccount(sourceAccounts[accountName]);
    const fallbackAccount = normalizeWxAccount(fallbackAccounts[accountName]);
    accounts[accountName] = fillWxAccount(base, fallbackAccount);
  }

  if (!accounts[defaultAccount]) {
    accounts[defaultAccount] = { ...DEFAULT_WX_ACCOUNT_CONFIG };
  }

  return {
    baseUrl,
    timeout,
    defaultAccount,
    accounts,
  };
}

function normalizeConfig(value: unknown, legacyValue?: unknown): PipelineConfig {
  const source = isPlainObject(value) ? value : {};
  const legacy = isPlainObject(legacyValue) ? legacyValue : {};
  const sourcePaths = isPlainObject(source.paths) ? source.paths : {};
  const sourceServices = isPlainObject(source.services) ? source.services : {};
  const sourceCommands = isPlainObject(source.commands) ? source.commands : {};
  const sourceCos = isPlainObject(source.cos) ? source.cos : {};

  return {
    paths: {
      workspaceRoot:
        typeof sourcePaths.workspaceRoot === "string" && sourcePaths.workspaceRoot.trim()
          ? sourcePaths.workspaceRoot
          : null,
      postsDirName:
        (typeof sourcePaths.postsDirName === "string" && sourcePaths.postsDirName.trim()) ||
        DEFAULT_CONFIG.paths.postsDirName,
      postsPathPattern:
        (typeof sourcePaths.postsPathPattern === "string" && sourcePaths.postsPathPattern.trim()) ||
        DEFAULT_CONFIG.paths.postsPathPattern,
      blogRoot:
        typeof sourcePaths.blogRoot === "string" && sourcePaths.blogRoot.trim()
          ? sourcePaths.blogRoot
          : null,
      zotepadExportHtml:
        typeof sourcePaths.zotepadExportHtml === "string" &&
        sourcePaths.zotepadExportHtml.trim()
          ? sourcePaths.zotepadExportHtml
          : null,
    },
    services: {
      zotepadBaseUrl:
        (typeof sourceServices.zotepadBaseUrl === "string" &&
          sourceServices.zotepadBaseUrl.trim()) ||
        DEFAULT_CONFIG.services.zotepadBaseUrl,
      zotepadToken:
        (typeof sourceServices.zotepadToken === "string" &&
          sourceServices.zotepadToken.trim()) ||
        DEFAULT_CONFIG.services.zotepadToken,
    },
    commands: {
      blogPublish:
        Array.isArray(sourceCommands.blogPublish) &&
        sourceCommands.blogPublish.every((item) => typeof item === "string" && item.trim())
          ? sourceCommands.blogPublish
          : [...DEFAULT_CONFIG.commands.blogPublish],
    },
    wx: normalizeWxConfig(source.wx, legacy.wx),
    cos: {
      pat: typeof sourceCos.pat === "string" ? sourceCos.pat : "",
    },
  };
}

function readJsonFile(path: string): unknown {
  if (!existsSync(path)) {
    return {};
  }

  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return {};
  }
}

export function loadConfig(): PipelineConfig {
  const config = readJsonFile(getPipelineConfigPath());
  const legacy = readJsonFile(getLegacyZCliConfigPath());
  return normalizeConfig(config, legacy);
}

export function saveConfig(config: PipelineConfig): void {
  const configPath = getPipelineConfigPath();
  const configDir = dirname(configPath);
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }
  writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
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
      ["blog.zzao.club"],
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
    .replace(/[\/\\:*?"<>|\u0000-\u001F]/g, "-")
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
  for (const account of Object.values(next.wx.accounts)) {
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
