#!/usr/bin/env bun
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getArg, getArgs, parseArgs, requireArg } from "./cli";
import {
  escapeHtml,
  findChrome,
  FONTS_DIR,
  ICONS_DIR,
  printSaved,
  readUtf8,
  renderTemplate,
  resolveInputPath,
  screenshotHtml,
  TEMPLATES_DIR,
} from "./runtime";

const WIDTH = 900;
const MIN_HEIGHT = 1200;
const MAX_HEIGHT = 16000;
const TEXT_WIDTH_CHARS = 26;

type PostRecord = {
  text: string;
  created_at?: string;
  url?: string;
  favorite_count?: number;
  retweet_count?: number;
};

function weightedLength(text: string): number {
  let total = 0;
  for (const ch of text) {
    if (ch === "\n") total += 8;
    else if (ch.charCodeAt(0) < 128) total += 0.55;
    else total += 1;
  }
  return total;
}

function estimatePostHeight(text: string): number {
  const paragraphs = text.split(/\r?\n/).filter(block => block.trim().length > 0);
  const blocks = paragraphs.length > 0 ? paragraphs : [text];
  let wrappedLines = 0;
  for (const block of blocks) {
    wrappedLines += Math.max(1, Math.ceil(weightedLength(block) / TEXT_WIDTH_CHARS));
  }
  wrappedLines += Math.max(0, blocks.length - 1);
  return 120 + wrappedLines * 48;
}

function estimateCanvasHeight(posts: PostRecord[]): number {
  let total = 210;
  for (const post of posts) {
    total += estimatePostHeight(post.text) + 20;
  }
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, total + 120));
}

function loadPosts(parsed: ReturnType<typeof parseArgs>): PostRecord[] {
  const posts: PostRecord[] = [];

  for (const text of [...getArgs(parsed, "post"), ...getArgs(parsed, "tweet")]) {
    if (text.trim().length > 0) posts.push({ text: text.trim() });
  }

  const inputFile = getArg(parsed, "posts-file") || getArg(parsed, "tweets-file");
  if (inputFile.length > 0) {
    const raw = readFileSync(inputFile, "utf8");
    const parsedJson = JSON.parse(raw);
    if (!Array.isArray(parsedJson)) {
      throw new Error("posts file must be a JSON array");
    }

    for (const item of parsedJson) {
      if (typeof item === "string" && item.trim().length > 0) {
        posts.push({ text: item.trim() });
        continue;
      }
      if (typeof item === "object" && item !== null) {
        const text = String((item as Record<string, unknown>).text ?? "").trim();
        if (text.length === 0) continue;
        posts.push({
          text,
          created_at: String((item as Record<string, unknown>).created_at ?? "").trim() || undefined,
          url: String((item as Record<string, unknown>).url ?? "").trim() || undefined,
          favorite_count: toInt((item as Record<string, unknown>).favorite_count),
          retweet_count: toInt((item as Record<string, unknown>).retweet_count),
        });
      }
    }
  }

  if (posts.length === 0) {
    throw new Error("需要至少一条帖子：传 --post/--tweet 或 --posts-file/--tweets-file");
  }
  return posts;
}

function toInt(value: unknown): number {
  const num = Number.parseInt(String(value ?? "0"), 10);
  return Number.isFinite(num) ? num : 0;
}

function textToHtml(text: string): string {
  const paragraphs = text
    .split(/\r?\n/)
    .map(block => block.trim())
    .filter(Boolean)
    .map(block => `<p>${escapeHtml(block)}</p>`);
  return paragraphs.length > 0 ? paragraphs.join("") : `<p>${escapeHtml(text)}</p>`;
}

function parseCreatedAt(value: string | undefined): Date | null {
  if (value === undefined || value.length === 0) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCreatedAt(value: string | undefined): string {
  const date = parseCreatedAt(value);
  if (date === null) return value ?? "";
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${formatter.format(date).replace(/\//g, "-")} UTC+8`;
}

function buildDateLabel(posts: PostRecord[]): string {
  const dates = posts
    .map(post => parseCreatedAt(post.created_at))
    .filter((date): date is Date => date !== null)
    .sort((a, b) => b.getTime() - a.getTime());
  if (dates.length === 0) return "日期未知";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(dates[0]);
}

function buildStats(post: PostRecord): string {
  const parts: string[] = [];
  const createdAt = formatCreatedAt(post.created_at);
  if (createdAt.length > 0) {
    parts.push(`<span class="stat">${escapeHtml(createdAt)}</span>`);
  }

  if ((post.retweet_count ?? 0) > 0) {
    parts.push(`<span class="stat"><strong>${post.retweet_count}</strong> RT</span>`);
  }
  if ((post.favorite_count ?? 0) > 0) {
    parts.push(`<span class="stat"><strong>${post.favorite_count}</strong> Likes</span>`);
  }
  if ((post.url ?? "").length > 0) {
    parts.push('<span class="stat">x.com</span>');
  }
  return parts.length > 0 ? parts.join("") : '<span class="stat">Forwarded from X</span>';
}

function buildPostItems(posts: PostRecord[], author: string, handle: string, avatarPath: string): string {
  return posts
    .map((post, index) => {
      return `
<article class="tweet">
  <div class="avatar-wrap">
    <img src="${avatarPath}" alt="avatar">
  </div>
  <div class="tweet-main">
    <div class="tweet-top">
      <span class="name">${escapeHtml(author)}</span>
      <span class="handle">${escapeHtml(handle)}</span>
      <span class="meta">· Post</span>
    </div>
    <div class="tweet-text">${textToHtml(post.text)}</div>
    <div class="tweet-footer">
      <span class="tweet-index">${index + 1} / ${posts.length}</span>
      <span class="tweet-stats">${buildStats(post)}</span>
    </div>
  </div>
</article>`.trim();
    })
    .join("\n");
}

export function runRenderXLikePostsCli(argv: string[]): void {
  const parsed = parseArgs(argv);
  const chromePath = findChrome();
  if (chromePath === null) throw new Error("Chrome/Chromium not found");

  const posts = loadPosts(parsed);
  const author = getArg(parsed, "author", "Unknown Author");
  const handle = getArg(parsed, "handle", "@twitter");
  const avatarPath = resolveInputPath(getArg(parsed, "avatar") || join(ICONS_DIR, "logo.svg"));
  const template = readUtf8(join(TEMPLATES_DIR, "x-like-posts.html"));
  const html = renderTemplate(template, {
    "{{BG_COLOR}}": getArg(parsed, "bg", "#f5f8fa"),
    "{{CARD_BG}}": getArg(parsed, "card-bg", "#ffffff"),
    "{{TEXT_COLOR}}": getArg(parsed, "text", "#0f1419"),
    "{{MUTED_COLOR}}": getArg(parsed, "muted", "#536471"),
    "{{BORDER_COLOR}}": getArg(parsed, "border", "#e6ecf0"),
    "{{ACCENT_COLOR}}": getArg(parsed, "accent", "#1d9bf0"),
    "{{AUTHOR_NAME}}": escapeHtml(author),
    "{{AUTHOR_HANDLE}}": escapeHtml(handle),
    "{{AUTHOR_AVATAR}}": avatarPath,
    "{{HEADER_LABEL}}": escapeHtml(getArg(parsed, "header-label", "X-like 帖子分享图")),
    "{{TIME_RANGE_LABEL}}": escapeHtml(buildDateLabel(posts)),
    "{{FOOTER_TEXT}}": escapeHtml(getArg(parsed, "footer", "整理转发 · via zzhub-media-imgx")),
    "{{FONT_PATH}}": join(FONTS_DIR, "AlimamaShuHeiTi-Bold.ttf"),
    "{{TWEET_ITEMS}}": buildPostItems(posts, author, handle, avatarPath),
  });

  const outPath = requireArg(parsed, "out");
  screenshotHtml({
    chromePath,
    html,
    outPath,
    width: WIDTH,
    height: estimateCanvasHeight(posts),
    hideScrollbars: true,
  });
  printSaved(outPath);
}

if (import.meta.main) {
  runRenderXLikePostsCli(process.argv.slice(2));
}
