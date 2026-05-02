import { existsSync, readFileSync } from "fs";
import { basename } from "path";
import COS from "cos-nodejs-sdk-v5";

const STS_PATH = "/api/v1/upload/cos";
const STS_TIMEOUT = 30000;
const UPLOAD_TIMEOUT = 120000;
const DEFAULT_PUBLIC_BASE_URL = "https://img.zzao.club";

const EXTENSION_CONTENT_TYPES = new Map<string, string>([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
]);

export interface CosUploadResult {
  localPath: string;
  key: string;
  url: string;
}

interface StsPayload {
  TmpSecretId: string;
  TmpSecretKey: string;
  SessionToken: string;
  StartTime: number;
  ExpiredTime: number;
  Bucket: string;
  Region: string;
  Key: string;
}

interface StsApiResponse {
  code?: number;
  message?: string;
  data?: {
    TmpSecretId?: string;
    TmpSecretKey?: string;
    SessionToken?: string;
    StartTime?: number;
    ExpiredTime?: number;
    Bucket?: string;
    Region?: string;
    Key?: string;
  };
}

async function requestJson(
  url: string,
  options: { method: string; headers: Record<string, string>; body?: unknown },
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
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`COS STS request failed: HTTP ${response.status} — ${text}`);
    }
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestSts(
  baseUrl: string,
  pat: string,
  filename: string,
  folder: string,
): Promise<StsPayload> {
  const response = (await requestJson(
    `${baseUrl.replace(/\/$/, "")}${STS_PATH}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${pat}`,
      },
      body: { filename, folder: { name: folder } },
    },
    STS_TIMEOUT,
  )) as StsApiResponse;

  const d = response?.data;
  if (
    !d?.TmpSecretId ||
    !d?.TmpSecretKey ||
    !d?.SessionToken ||
    !d?.Bucket ||
    !d?.Region ||
    !d?.Key ||
    d.StartTime === undefined ||
    d.ExpiredTime === undefined
  ) {
    throw new Error(`COS STS response incomplete: ${JSON.stringify(response)}`);
  }

  return {
    TmpSecretId: d.TmpSecretId,
    TmpSecretKey: d.TmpSecretKey,
    SessionToken: d.SessionToken,
    StartTime: d.StartTime,
    ExpiredTime: d.ExpiredTime,
    Bucket: d.Bucket,
    Region: d.Region,
    Key: d.Key,
  };
}

export async function uploadFileToCos(input: {
  localPath: string;
  folder: string;
  baseUrl: string;
  cosPat: string;
  publicBaseUrl?: string;
}): Promise<CosUploadResult> {
  const { localPath, folder, baseUrl, cosPat } = input;
  const publicBaseUrl = (input.publicBaseUrl ?? DEFAULT_PUBLIC_BASE_URL).replace(/\/$/, "");

  if (!existsSync(localPath)) {
    throw new Error(`File not found: ${localPath}`);
  }

  const filename = basename(localPath);
  const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
  const contentType = EXTENSION_CONTENT_TYPES.get(ext);
  if (!contentType) {
    throw new Error(
      `Unsupported image type: ${filename}. Supported: ${[...EXTENSION_CONTENT_TYPES.keys()].join(", ")}`,
    );
  }

  const sts = await requestSts(baseUrl, cosPat, filename, folder);
  const buffer = readFileSync(localPath);

  const cos = new COS({
    SecretId: sts.TmpSecretId,
    SecretKey: sts.TmpSecretKey,
    SecurityToken: sts.SessionToken,
  });

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`COS upload timed out: ${filename}`));
    }, UPLOAD_TIMEOUT);

    cos.putObject(
      {
        Bucket: sts.Bucket,
        Region: sts.Region,
        Key: sts.Key,
        Body: buffer,
        ContentType: contentType,
      },
      (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        if (err) {
          reject(new Error(`COS upload failed: ${err.message ?? JSON.stringify(err)}`));
        } else {
          resolve();
        }
      },
    );
  });

  return {
    localPath,
    key: sts.Key,
    url: `${publicBaseUrl}/${sts.Key}`,
  };
}
