import { existsSync, readFileSync, statSync } from "fs";
import { homedir } from "os";
import { isAbsolute, resolve } from "path";

const HOME = homedir();

/**
 * Resolve a local filesystem path for the /local-file proxy.
 * Rejects non-absolute paths, missing files, and paths outside $HOME (unless overridden).
 */
export function resolveLocalFilePath(
  raw: string | null,
  options: { allowOutsideHome?: boolean } = {},
): { ok: true; path: string } | { ok: false; status: number; error: string } {
  if (!raw || !raw.trim()) {
    return { ok: false, status: 400, error: "missing path" };
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(raw.trim());
  } catch {
    return { ok: false, status: 400, error: "invalid path encoding" };
  }

  // Strip file:// prefix if present
  if (decoded.startsWith("file://")) {
    try {
      decoded = new URL(decoded).pathname;
      // macOS: file:///Users/... → /Users/...
    } catch {
      return { ok: false, status: 400, error: "invalid file URL" };
    }
  }

  if (!isAbsolute(decoded)) {
    return { ok: false, status: 400, error: "path must be absolute" };
  }

  const resolved = resolve(decoded);
  if (resolved.includes("\0")) {
    return { ok: false, status: 400, error: "invalid path" };
  }

  if (!options.allowOutsideHome && !resolved.startsWith(HOME + "/") && resolved !== HOME) {
    // Also allow /tmp for debug artifacts
    if (!resolved.startsWith("/tmp/") && resolved !== "/tmp") {
      return { ok: false, status: 403, error: "path outside home directory" };
    }
  }

  if (!existsSync(resolved)) {
    return { ok: false, status: 404, error: "file not found" };
  }

  try {
    const st = statSync(resolved);
    if (!st.isFile()) {
      return { ok: false, status: 400, error: "not a file" };
    }
  } catch {
    return { ok: false, status: 404, error: "file not accessible" };
  }

  return { ok: true, path: resolved };
}

export function guessContentType(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".gif")) return "image/gif";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  if (lower.endsWith(".avif")) return "image/avif";
  if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=utf-8";
  if (lower.endsWith(".css")) return "text/css; charset=utf-8";
  if (lower.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (lower.endsWith(".json")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

export function readLocalFile(path: string): Buffer {
  return readFileSync(path);
}

/**
 * Rewrite absolute / file:// image src attributes to the local-file proxy.
 */
export function rewriteHtmlLocalAssets(html: string, baseOrigin: string): string {
  const proxy = (src: string): string => {
    const trimmed = src.trim();
    if (!trimmed) return src;
    if (/^(?:https?:|data:|blob:|\/\/)/i.test(trimmed)) return src;
    if (trimmed.startsWith("/local-file")) return src;

    let abs = trimmed;
    if (trimmed.startsWith("file://")) {
      try {
        abs = new URL(trimmed).pathname;
      } catch {
        return src;
      }
    }
    if (!isAbsolute(abs)) return src;
    return `${baseOrigin}/local-file?path=${encodeURIComponent(abs)}`;
  };

  return html
    .replace(/(<img\b[^>]*\bsrc=["'])([^"']+)(["'])/gi, (_m, pre, src, post) => {
      return `${pre}${proxy(src)}${post}`;
    })
    .replace(/(<img\b[^>]*\bdata-src=["'])([^"']+)(["'])/gi, (_m, pre, src, post) => {
      return `${pre}${proxy(src)}${post}`;
    });
}
