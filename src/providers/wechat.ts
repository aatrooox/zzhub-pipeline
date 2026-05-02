import { existsSync, readFileSync } from "fs";
import { basename, extname } from "path";
import { PipelineConfig, WxAccountConfig } from "../config";

const TOKEN_PATH = "/api/v1/wx/cgi-bin/token";
const MATERIAL_PATH = "/api/v1/wx/cgi-bin/material/add_material";
const DRAFT_PATH = "/api/v1/wx/cgi-bin/draft/add";
const TOKEN_TIMEOUT = 10000;
const UPLOAD_TIMEOUT = 60000;
const DRAFT_TIMEOUT = 30000;
const TOKEN_FETCH_RETRY_MAX_ATTEMPTS = 3;
const TOKEN_FETCH_RETRY_DELAY_MS = 500;

const IMAGE_EXTENSIONS = new Map<string, string>([
  ["image/jpeg", "jpg"],
  ["image/jpg", "jpg"],
  ["image/png", "png"],
  ["image/gif", "gif"],
  ["image/webp", "webp"],
  ["image/bmp", "bmp"],
]);

const EXTENSION_CONTENT_TYPES = new Map<string, string>([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".bmp", "image/bmp"],
]);

interface TokenResponse {
  code?: number;
  data?: {
    accessToken?: string;
    expiresIn?: number;
  };
  accessToken?: string;
}

interface UploadApiResponse {
  code?: number;
  message?: string;
  data?: { media_id?: string; url?: string };
  media_id?: string;
  url?: string;
  errcode?: number;
  errmsg?: string;
}

interface UploadedMedia {
  originalUrl: string;
  mediaId: string;
  wxUrl: string;
  index: number;
}

interface UploadResult {
  uploadedMedia: UploadedMedia[];
  imageUrlMap: Record<string, string>;
  coverMediaId: string;
  totalUploaded: number;
  photos: string[];
}

interface WxRuntimeConfig {
  accountName: string;
  baseUrl: string;
  timeout: number;
  pat: string;
  appId: string;
  appSecret: string;
}

interface BaseWechatPublishInput {
  account?: string;
  title: string;
  photos?: string[];
  timeout?: number;
  config: PipelineConfig;
}

export interface WechatDraftInput extends BaseWechatPublishInput {
  html: string;
}

export interface WechatNewspicInput extends BaseWechatPublishInput {
  content: string;
}

function requireValue(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing required value: ${name}`);
  }
  return value;
}

export function normalizeAccountName(value: string): string {
  const account = value.trim();
  if (!account) {
    throw new Error("wx account cannot be empty");
  }
  if (!/^[a-zA-Z0-9_.-]+$/.test(account)) {
    throw new Error(`invalid wx account: ${value}`);
  }
  return account;
}

function fillWxAccountConfig(source?: WxAccountConfig): WxAccountConfig {
  return {
    pat: source?.pat ?? "",
    appId: source?.appId ?? "",
    appSecret: source?.appSecret ?? "",
  };
}

function trimTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function getWxRuntimeConfig(
  config: PipelineConfig,
  accountOverride?: string,
): WxRuntimeConfig {
  const accountName = normalizeAccountName(
    accountOverride || config.wx.defaultAccount,
  );
  const accountConfig = fillWxAccountConfig(config.wx.accounts[accountName]);
  return {
    accountName,
    baseUrl: trimTrailingSlash(process.env.ZZHUB_WX_BASE_URL || config.wx.baseUrl),
    timeout: config.wx.timeout,
    pat: requireValue(
      "ZZCLUB_PAT",
      process.env.ZZCLUB_PAT || accountConfig.pat,
    ),
    appId: requireValue(
      "WX_APPID",
      process.env.WX_APPID || accountConfig.appId,
    ),
    appSecret: requireValue(
      "WX_APPSECRET",
      process.env.WX_APPSECRET || accountConfig.appSecret,
    ),
  };
}

export function resolveTimeout(defaultTimeout: number, configTimeout: number, override?: number): number {
  if (override && Number.isFinite(override) && override > 0) {
    return override;
  }
  if (configTimeout && Number.isFinite(configTimeout) && configTimeout > 0) {
    return configTimeout;
  }
  return defaultTimeout;
}

export function parsePhotos(photos?: string[]): string[] {
  return (photos ?? []).map((item) => item.trim()).filter(Boolean);
}

export function mergePhotoLists(...lists: string[][]): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const item of list) {
      const normalized = item.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      merged.push(normalized);
    }
  }
  return merged;
}

export function extractImageUrls(input: string): string[] {
  const urls = new Set<string>();
  const markdownImageRegex = /!\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const htmlImageRegex = /<img[^>]+src=["']([^"']+)["'][^>]*>/g;
  let match = markdownImageRegex.exec(input);
  while (match) {
    if (match[1]) {
      urls.add(match[1]);
    }
    match = markdownImageRegex.exec(input);
  }
  match = htmlImageRegex.exec(input);
  while (match) {
    if (match[1]) {
      urls.add(match[1]);
    }
    match = htmlImageRegex.exec(input);
  }
  return [...urls];
}

export function replaceImageUrls(html: string, imageUrlMap: Record<string, string>): string {
  let replaced = html;
  for (const [orig, wx] of Object.entries(imageUrlMap)) {
    if (!orig || !wx) {
      continue;
    }
    const escaped = orig.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
    replaced = replaced.replace(new RegExp(escaped, "g"), wx);
  }
  return replaced;
}

async function requestJson(
  url: string,
  options: { method: string; headers?: Record<string, string>; body?: unknown },
  timeout: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}: ${responseText}`);
    }
    return responseText ? JSON.parse(responseText) : {};
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestFormData(
  url: string,
  options: { method: string; headers?: Record<string, string>; body: FormData },
  timeout: number,
): Promise<unknown> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      method: options.method,
      headers: options.headers,
      body: options.body,
      signal: controller.signal,
    });
    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}: ${responseText}`);
    }
    return responseText ? JSON.parse(responseText) : {};
  } finally {
    clearTimeout(timeoutId);
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableTokenFetchError(error: unknown): boolean {
  return error instanceof Error && error.message.toLowerCase().includes("fetch failed");
}

async function requestToken(
  runtime: WxRuntimeConfig,
  timeout: number,
): Promise<TokenResponse> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= TOKEN_FETCH_RETRY_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await requestJson(
        `${runtime.baseUrl}${TOKEN_PATH}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${runtime.pat}`,
          },
          body: { appId: runtime.appId, appSecret: runtime.appSecret },
        },
        timeout,
      );
      return response as TokenResponse;
    } catch (error) {
      lastError = error;
      if (!isRetryableTokenFetchError(error) || attempt >= TOKEN_FETCH_RETRY_MAX_ATTEMPTS) {
        throw error;
      }
      await sleep(TOKEN_FETCH_RETRY_DELAY_MS * attempt);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("failed to fetch access_token");
}

async function fetchAccessToken(runtime: WxRuntimeConfig, timeout: number): Promise<string> {
  const response = await requestToken(runtime, timeout);
  const accessToken = response.data?.accessToken || response.accessToken;
  if (!accessToken) {
    throw new Error("Access token not found in wx token response");
  }
  return accessToken;
}

async function resolvePhotoPayload(
  photoUrl: string,
  index: number,
): Promise<{ blob: Blob; filename: string }> {
  if (photoUrl.startsWith("data:")) {
    const matches = photoUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      throw new Error("Invalid data URL format");
    }
    const contentType = matches[1] || "image/png";
    const buffer = Buffer.from(matches[2] || "", "base64");
    const extension = IMAGE_EXTENSIONS.get(contentType.toLowerCase()) || "png";
    return {
      blob: new Blob([buffer], { type: contentType }),
      filename: `image_${index + 1}.${extension}`,
    };
  }

  if (photoUrl.startsWith("http://") || photoUrl.startsWith("https://")) {
    const response = await fetch(photoUrl);
    if (!response.ok) {
      throw new Error(`Failed to download image: HTTP ${response.status}`);
    }
    const contentType = response.headers.get("content-type") || "image/jpeg";
    const buffer = Buffer.from(await response.arrayBuffer());
    return {
      blob: new Blob([buffer], { type: contentType }),
      filename: resolveFilenameFromUrl(photoUrl, contentType, index),
    };
  }

  if (photoUrl.startsWith("file://")) {
    const url = new URL(photoUrl);
    return resolveFilePayload(url.pathname, index);
  }

  return resolveFilePayload(photoUrl, index);
}

function resolveFilePayload(
  filePath: string,
  index: number,
): { blob: Blob; filename: string } {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }
  const buffer = readFileSync(filePath);
  const ext = extname(filePath).toLowerCase();
  const contentType = EXTENSION_CONTENT_TYPES.get(ext) || "image/jpeg";
  const extension = IMAGE_EXTENSIONS.get(contentType.toLowerCase()) || ext.replace(".", "") || "jpg";
  const baseName = basename(filePath, ext) || `image_${index + 1}`;
  return {
    blob: new Blob([buffer], { type: contentType }),
    filename: ext ? `${baseName}${ext}` : `${baseName}.${extension}`,
  };
}

export function resolveFilenameFromUrl(url: string, contentType: string, index: number): string {
  const urlParts = url.split("/");
  let filename = urlParts[urlParts.length - 1] || `image_${index + 1}`;
  filename = filename.split("?")[0] || filename;
  const expectedExt = IMAGE_EXTENSIONS.get(contentType.toLowerCase()) || "jpg";
  const hasExtension = /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(filename);

  if (!hasExtension) {
    return `${filename}.${expectedExt}`;
  }

  const urlExt = filename.split(".").pop()?.toLowerCase();
  if (urlExt && urlExt !== expectedExt) {
    return filename.replace(/\.[^.]+$/, `.${expectedExt}`);
  }

  return filename;
}

async function uploadPhotos(
  runtime: WxRuntimeConfig,
  accessToken: string,
  photos: string[],
  timeout: number,
): Promise<UploadResult> {
  const uploadedMedia: UploadedMedia[] = [];
  const imageUrlMap: Record<string, string> = {};

  for (let index = 0; index < photos.length; index += 1) {
    const photoUrl = photos[index];
    if (!photoUrl) {
      continue;
    }

    const payload = await resolvePhotoPayload(photoUrl, index);
    const formData = new FormData();
    formData.append("access_token", accessToken);
    formData.append("type", "image");
    formData.append("media", payload.blob, payload.filename);

    const response = await requestFormData(
      `${runtime.baseUrl}${MATERIAL_PATH}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${runtime.pat}` },
        body: formData,
      },
      timeout,
    );

    const result = response as UploadApiResponse;
    if (result.errcode && result.errcode !== 0) {
      throw new Error(`WeChat API error: ${result.errcode} - ${result.errmsg || "Unknown"}`);
    }

    const mediaId = result.data?.media_id || result.media_id;
    const wxUrl = result.data?.url || result.url || "";
    if (!mediaId) {
      throw new Error(`Upload API error: No media_id in response. Raw: ${JSON.stringify(result)}`);
    }

    uploadedMedia.push({
      originalUrl: photoUrl,
      mediaId,
      wxUrl,
      index,
    });
    imageUrlMap[photoUrl] = wxUrl || photoUrl;
  }

  return {
    uploadedMedia,
    imageUrlMap,
    coverMediaId: uploadedMedia[0]?.mediaId || "",
    totalUploaded: uploadedMedia.length,
    photos: photos.map((url) => imageUrlMap[url] || url),
  };
}

export async function createWechatDraft(input: WechatDraftInput): Promise<Record<string, unknown>> {
  const runtime = getWxRuntimeConfig(input.config, input.account);
  const fallbackPhotos = extractImageUrls(input.html);
  const photos = parsePhotos(input.photos);
  const finalPhotos = mergePhotoLists(photos, fallbackPhotos);
  if (finalPhotos.length === 0) {
    throw new Error("No photos available for wx draft upload");
  }

  const tokenTimeout = resolveTimeout(TOKEN_TIMEOUT, runtime.timeout, input.timeout);
  const uploadTimeout = resolveTimeout(UPLOAD_TIMEOUT, runtime.timeout, input.timeout);
  const draftTimeout = resolveTimeout(DRAFT_TIMEOUT, runtime.timeout, input.timeout);
  const accessToken = await fetchAccessToken(runtime, tokenTimeout);
  const uploadResult = await uploadPhotos(runtime, accessToken, finalPhotos, uploadTimeout);
  const replacedHtml = replaceImageUrls(input.html, uploadResult.imageUrlMap);

  const response = await requestJson(
    `${runtime.baseUrl}${DRAFT_PATH}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runtime.pat}`,
      },
      body: {
        access_token: accessToken,
        articles: [
          {
            article_type: "news",
            title: input.title,
            content: replacedHtml,
            thumb_media_id: uploadResult.coverMediaId,
          },
        ],
      },
    },
    draftTimeout,
  );

  return {
    account: runtime.accountName,
    articleType: "news",
    title: input.title,
    photosCount: finalPhotos.length,
    totalUploaded: uploadResult.totalUploaded,
    coverMediaId: uploadResult.coverMediaId,
    response,
  };
}

export async function createWechatNewspic(input: WechatNewspicInput): Promise<Record<string, unknown>> {
  const runtime = getWxRuntimeConfig(input.config, input.account);
  const fallbackPhotos = extractImageUrls(input.content);
  const photos = parsePhotos(input.photos);
  const finalPhotos = mergePhotoLists(photos, fallbackPhotos);
  if (finalPhotos.length === 0) {
    throw new Error("No photos available for wx newspic upload");
  }

  const tokenTimeout = resolveTimeout(TOKEN_TIMEOUT, runtime.timeout, input.timeout);
  const uploadTimeout = resolveTimeout(UPLOAD_TIMEOUT, runtime.timeout, input.timeout);
  const draftTimeout = resolveTimeout(DRAFT_TIMEOUT, runtime.timeout, input.timeout);
  const accessToken = await fetchAccessToken(runtime, tokenTimeout);
  const uploadResult = await uploadPhotos(runtime, accessToken, finalPhotos, uploadTimeout);

  const imageInfo = {
    image_list: uploadResult.uploadedMedia.map((item) => ({ image_media_id: item.mediaId })),
  };

  const response = await requestJson(
    `${runtime.baseUrl}${DRAFT_PATH}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${runtime.pat}`,
      },
      body: {
        access_token: accessToken,
        articles: [
          {
            article_type: "newspic",
            title: input.title,
            content: input.content,
            thumb_media_id: uploadResult.coverMediaId,
            image_info: imageInfo,
          },
        ],
      },
    },
    draftTimeout,
  );

  return {
    account: runtime.accountName,
    articleType: "newspic",
    title: input.title,
    photosCount: finalPhotos.length,
    totalUploaded: uploadResult.totalUploaded,
    coverMediaId: uploadResult.coverMediaId,
    response,
  };
}
