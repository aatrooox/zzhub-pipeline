import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "fs";
import { join } from "path";
import { ensurePreviewServerDirs, getPreviewEntriesDir } from "./paths";
import type { PreviewEntry, PreviewEntryMeta, PreviewRegisterInput } from "./types";

function entryDir(id: string): string {
  return join(getPreviewEntriesDir(), id);
}

function metaPath(id: string): string {
  return join(entryDir(id), "meta.json");
}

function htmlPath(id: string): string {
  return join(entryDir(id), "article.html");
}

function newEntryId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createPreviewEntry(input: PreviewRegisterInput): PreviewEntry {
  ensurePreviewServerDirs();
  const id = newEntryId();
  const dir = entryDir(id);
  const entry: PreviewEntry = {
    id,
    title: input.title || "Untitled",
    account: input.account || "default",
    status: input.status,
    created_at: new Date().toISOString(),
    duration_ms: input.duration_ms,
    markdown_path: input.markdown_path,
    html_path: input.html_path,
    preview_style: input.preview_style,
    error: input.error,
    error_kind: input.error_kind,
    debug: input.debug,
    html: input.html,
  };

  mkdirSync(dir, { recursive: true });

  const meta: PreviewEntryMeta = {
    id: entry.id,
    title: entry.title,
    account: entry.account,
    status: entry.status,
    created_at: entry.created_at,
    duration_ms: entry.duration_ms,
    markdown_path: entry.markdown_path,
    html_path: entry.html_path,
    preview_style: entry.preview_style,
    error: entry.error,
    error_kind: entry.error_kind,
    debug: entry.debug,
  };
  writeFileSync(metaPath(id), JSON.stringify(meta, null, 2), "utf-8");
  if (entry.html) {
    writeFileSync(htmlPath(id), entry.html, "utf-8");
  }
  return entry;
}

export function listPreviewEntries(): PreviewEntryMeta[] {
  ensurePreviewServerDirs();
  const root = getPreviewEntriesDir();
  if (!existsSync(root)) return [];

  const entries: PreviewEntryMeta[] = [];
  for (const name of readdirSync(root)) {
    const path = metaPath(name);
    if (!existsSync(path)) continue;
    try {
      const meta = JSON.parse(readFileSync(path, "utf-8")) as PreviewEntryMeta;
      entries.push(meta);
    } catch {
      // skip corrupt entries
    }
  }
  entries.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return entries;
}

export function getPreviewEntry(id: string): PreviewEntry | null {
  const path = metaPath(id);
  if (!existsSync(path)) return null;
  try {
    const meta = JSON.parse(readFileSync(path, "utf-8")) as PreviewEntryMeta;
    let html: string | undefined;
    const hp = htmlPath(id);
    if (existsSync(hp)) {
      html = readFileSync(hp, "utf-8");
    }
    return { ...meta, html };
  } catch {
    return null;
  }
}

export function clearPreviewEntries(): number {
  ensurePreviewServerDirs();
  const root = getPreviewEntriesDir();
  if (!existsSync(root)) return 0;
  let count = 0;
  for (const name of readdirSync(root)) {
    rmSync(join(root, name), { recursive: true, force: true });
    count += 1;
  }
  return count;
}
