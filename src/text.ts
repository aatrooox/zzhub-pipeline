/**
 * text.ts — Deterministic text formatting utilities
 *
 * Replaces the LLM-based zzhub-media-format skill.
 * Rules sourced from: md-style.md + state-contract.md
 *
 * All functions operate on string buffers — they never mutate files directly.
 */

// ── Frontmatter ───────────────────────────────────────────────────

/**
 * Strip YAML frontmatter from markdown content.
 * Only triggers when content starts with "---\n".
 * Returns clean body (content after second "---\n").
 * If no closing "---" found, returns original content (no-op).
 */
export function stripFrontmatter(content: string): string {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return content;
  }
  // Find the second "---"
  const lineBreak = content.includes("\r\n") ? "\r\n" : "\n";
  const endMarker = `${lineBreak}---${lineBreak}`;
  const endIdx = content.indexOf(endMarker, 4);
  if (endIdx === -1) {
    // Try end-of-file variant: "---" at the end without trailing newline
    const endMarkerEof = `${lineBreak}---`;
    if (content.endsWith(endMarkerEof)) {
      return "";
    }
    return content;
  }
  return content.slice(endIdx + endMarker.length);
}

/**
 * Extract frontmatter as raw string (without delimiters).
 * Returns null if no frontmatter found.
 */
export function extractFrontmatter(content: string): string | null {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return null;
  }
  const lineBreak = content.includes("\r\n") ? "\r\n" : "\n";
  const startLen = 3 + lineBreak.length; // "---\n"
  const endMarker = `${lineBreak}---${lineBreak}`;
  const endIdx = content.indexOf(endMarker, startLen);
  if (endIdx === -1) {
    const endMarkerEof = `${lineBreak}---`;
    if (content.endsWith(endMarkerEof)) {
      return content.slice(startLen, content.length - endMarkerEof.length);
    }
    return null;
  }
  return content.slice(startLen, endIdx);
}

// ── CJK spacing ───────────────────────────────────────────────────

/**
 * Insert a space between CJK characters and ASCII letters/digits.
 * e.g. "使用OpenClaw管理" -> "使用 OpenClaw 管理"
 */
export function fixCjkSpacing(text: string): string {
  // CJK Unified Ideographs + common CJK ranges
  const cjk =
    /[\u2E80-\u2FFF\u3040-\u309F\u30A0-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\uFF01-\uFF60]/;

  const chars = [...text];
  const result: string[] = [];

  for (let i = 0; i < chars.length; i++) {
    result.push(chars[i]);

    if (i < chars.length - 1) {
      const curr = chars[i];
      const next = chars[i + 1];
      const currIsCjk = cjk.test(curr);
      const nextIsCjk = cjk.test(next);
      const currIsAsciiWord = /[A-Za-z0-9]/.test(curr);
      const nextIsAsciiWord = /[A-Za-z0-9]/.test(next);

      // CJK followed by ASCII word char, or ASCII word char followed by CJK
      if (
        (currIsCjk && nextIsAsciiWord) ||
        (currIsAsciiWord && nextIsCjk)
      ) {
        result.push(" ");
      }
    }
  }

  return result.join("");
}

// ── Heading normalization ─────────────────────────────────────────

/**
 * Downgrade H1 headings to H2 in article/blog content.
 * Rule: "公众号正文不用一级标题"
 */
export function downgradeH1(text: string): string {
  return text.replace(/^# (?!#)/gm, "## ");
}

/**
 * Remove a leading H1 block from markdown content.
 * Used for channels where the rendered title is provided out-of-band.
 */
export function stripLeadingH1(text: string): string {
  const lineBreak = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  let firstContentIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim()) {
      firstContentIndex = index;
      break;
    }
  }

  if (firstContentIndex === -1 || !/^# (?!#)/.test(lines[firstContentIndex].trim())) {
    return text;
  }

  let nextIndex = firstContentIndex + 1;
  while (nextIndex < lines.length && !lines[nextIndex].trim()) {
    nextIndex += 1;
  }

  return [...lines.slice(0, firstContentIndex), ...lines.slice(nextIndex)].join(lineBreak);
}

function normalizeHeadingText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/**
 * Remove the leading title heading block when it duplicates metadata.title.
 * Accepts either H1 or H2 because prepare formatting may already downgrade H1.
 */
export function stripLeadingTitleHeading(text: string, title: string): string {
  const normalizedTitle = normalizeHeadingText(title);
  if (!normalizedTitle) {
    return text;
  }

  const lineBreak = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = text.split(/\r?\n/);
  let firstContentIndex = -1;

  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].trim()) {
      firstContentIndex = index;
      break;
    }
  }

  if (firstContentIndex === -1) {
    return text;
  }

  const match = lines[firstContentIndex].trim().match(/^##?\s+(.+)$/);
  if (!match || normalizeHeadingText(match[1]) !== normalizedTitle) {
    return text;
  }

  let nextIndex = firstContentIndex + 1;
  while (nextIndex < lines.length && !lines[nextIndex].trim()) {
    nextIndex += 1;
  }

  return [...lines.slice(0, firstContentIndex), ...lines.slice(nextIndex)].join(lineBreak);
}

/**
 * Remove numeric prefixes from H2 headings.
 * e.g. "## 1. 标题" -> "## 标题", "## 1、标题" -> "## 标题"
 */
export function removeHeadingNumbers(text: string): string {
  return text.replace(
    /^(##\s+)\d+[.、．]\s*/gm,
    "$1",
  );
}

// ── Separator normalization ───────────────────────────────────────

/**
 * Replace horizontal rules (---, ***, ___) with blank lines.
 * Rule: "不用 --- 分割线语法，用空行或段落自然分隔"
 */
export function removeHorizontalRules(text: string): string {
  return text.replace(/^[-*_]{3,}\s*$/gm, "");
}

/**
 * Remove newspic pagination markers such as 【第一页】【第二页】【第N页】
 * and their English equivalents like 【Page 1】.
 * These are editor/orchestrator convenience markers and must not appear in final output.
 */
export function removePageMarkers(text: string): string {
  // Matches Chinese ordinals, digits, and the literal placeholder N used in
  // editor/orchestrator prompts such as 【第N页】. Also supports English
  // fallbacks like 【Page 1】 / 【Page N】.
  return text.replace(
    /【(第(?:[一二三四五六七八九十百\d]+|[Nn])页|Page\s*(?:\d+|[Nn]))】\s*/g,
    "",
  );
}

// ── Blank line compression ────────────────────────────────────────

/**
 * Compress consecutive blank lines to at most `max` blank lines.
 * Default: 2 (matching state-contract.md rule).
 */
export function compressBlankLines(text: string, max = 2): string {
  const threshold = max + 1; // max blank lines = max empty lines between content
  const pattern = new RegExp(`(\\n){${threshold + 1},}`, "g");
  return text.replace(pattern, "\n".repeat(threshold));
}

function splitMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  const normalized = trimmed.replace(/^\|/, "").replace(/\|$/, "");
  return normalized.split("|").map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line: string): boolean {
  const cells = splitMarkdownTableRow(line);
  return (
    cells.length > 0 &&
    cells.every((cell) => /^:?-{3,}:?$/.test(cell))
  );
}

function isMarkdownTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes("|")) {
    return false;
  }
  const cells = splitMarkdownTableRow(trimmed);
  return cells.length >= 2 && cells.some((cell) => cell.length > 0);
}

function convertMarkdownTableBlock(lines: string[]): string[] {
  if (lines.length < 3) {
    return lines;
  }

  const headers = splitMarkdownTableRow(lines[0]);
  const separator = lines[1];
  const rows = lines.slice(2).map(splitMarkdownTableRow);

  if (!isMarkdownTableSeparator(separator) || headers.length < 2) {
    return lines;
  }

  const columnCount = headers.length;
  const normalizedRows = rows
    .map((row) => {
      const cells = [...row];
      while (cells.length < columnCount) cells.push("");
      return cells.slice(0, columnCount);
    })
    .filter((row) => row.some((cell) => cell.trim().length > 0));

  if (normalizedRows.length === 0) {
    return [];
  }

  const blocks: string[] = [];

  for (let col = 1; col < columnCount; col += 1) {
    const sectionTitle = headers[col]?.trim();
    if (!sectionTitle) {
      continue;
    }

    const bulletLines = normalizedRows
      .map((row) => {
        const label = row[0]?.trim();
        const value = row[col]?.trim();

        if (!value || value === "-" || value === "/") {
          return null;
        }
        if (!label) {
          return `- ${value}`;
        }
        return `- ${label}：${value}`;
      })
      .filter((line): line is string => line !== null);

    if (bulletLines.length === 0) {
      continue;
    }

    blocks.push(sectionTitle);
    blocks.push(...bulletLines);
    blocks.push("");
  }

  while (blocks.length > 0 && blocks[blocks.length - 1] === "") {
    blocks.pop();
  }

  return blocks;
}

function convertMarkdownTablesToCompareBlocks(content: string): string {
  const lines = content.split(/\r?\n/);
  const output: string[] = [];
  let index = 0;

  while (index < lines.length) {
    if (
      index + 2 < lines.length &&
      isMarkdownTableRow(lines[index]) &&
      isMarkdownTableSeparator(lines[index + 1])
    ) {
      const block = [lines[index], lines[index + 1]];
      let cursor = index + 2;
      while (cursor < lines.length && isMarkdownTableRow(lines[cursor])) {
        block.push(lines[cursor]);
        cursor += 1;
      }
      output.push(...convertMarkdownTableBlock(block));
      index = cursor;
      continue;
    }

    output.push(lines[index]);
    index += 1;
  }

  return output.join("\n");
}

// ── Illustration markers ──────────────────────────────────────────

/**
 * Remove illustration markers (插图N / 配图N) from text.
 * Rule from state-contract.md: /[插配]图\d+/g
 * Does not modify original file — operates on buffer.
 */
export function removeIllustrationMarkers(text: string): string {
  // Matches standalone 插图1, 配图1, [插图1], [插图 1], etc.
  // Strip the marker and any surrounding whitespace on the same line,
  // so "驻扎，[插图 1] 风" → "驻扎，风" (no stray space left behind)
  // Negative lookbehind: do NOT match when preceded by path chars (/, ., alphanumeric)
  // to avoid eating "插图1" inside image paths like ![](/path/插图1.png)
  return text.replace(/(?<![/.\w])[ \t]*\[?[插配]图\s*\d+\]?[ \t]*/g, "");
}

/**
 * Count illustration markers in text.
 * Returns array of matched markers.
 */
export function findIllustrationMarkers(text: string): string[] {
  const matches = text.match(/[插配]图\d+/g);
  return matches ?? [];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replace illustration markers with markdown image blocks.
 * Used by wechat-article publish after the user has supplied body images.
 */
export function injectIllustrationImages(
  text: string,
  received: Array<{ marker: string; path: string }>,
): string {
  let result = text;

  for (const item of received) {
    if (!item.marker || !item.path) continue;
    const replacement = `\n\n![](<${item.path}>)\n\n`;
    result = result.replace(
      new RegExp(escapeRegExp(item.marker), "g"),
      replacement,
    );
  }

  return compressBlankLines(result);
}

// ── Markdown stripping (for word count) ───────────────────────────

/**
 * Strip Markdown syntax to get plain text (for word/char counting).
 * Removes: headings, bold, italic, links, images, code fences, inline code, blockquotes.
 */
export function stripMarkdown(text: string): string {
  return (
    text
      // Remove code fences
      .replace(/```[\s\S]*?```/g, "")
      // Remove inline code
      .replace(/`[^`]+`/g, "")
      // Remove images
      .replace(/!\[.*?\]\(.*?\)/g, "")
      // Remove links (keep text)
      .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
      // Remove headings markers
      .replace(/^#{1,6}\s+/gm, "")
      // Remove bold/italic markers
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
      // Remove blockquote markers
      .replace(/^>\s?/gm, "")
      // Remove horizontal rules
      .replace(/^[-*_]{3,}\s*$/gm, "")
      .trim()
  );
}

// ── Slug generation ───────────────────────────────────────────────

/**
 * Generate a kebab-case slug from a title.
 * Handles CJK by pinyin-free approach: transliterate common chars, keep ASCII.
 * For CJK-heavy titles, uses a simplified approach.
 */
export function generateSlug(title: string): string {
  let slug = title
    .toLowerCase()
    .trim()
    // Replace CJK punctuation with spaces
    .replace(/[，。！？、；：""''【】《》（）…—～·]+/g, " ")
    // Replace ASCII punctuation with spaces
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, " ")
    // For CJK chars: just remove them (slug will be ASCII-only)
    .replace(/[\u4e00-\u9fff]+/g, " ")
    // Collapse whitespace
    .replace(/\s+/g, "-")
    // Remove leading/trailing dashes
    .replace(/^-+|-+$/g, "");

  // If slug is empty (all CJK), fall back to date-based
  if (!slug) {
    const now = new Date();
    slug = `post-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  }

  return slug;
}

// ── Date formatting ───────────────────────────────────────────────

/**
 * Get current date as YYYY-MM-DD string.
 */
export function todayDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ── Description extraction ────────────────────────────────────────

/**
 * Extract description from body text.
 * Takes first non-empty, non-heading line, strips markdown.
 * For wechat-article: description must not be null.
 */
export function extractDescription(body: string): string {
  const lines = body.split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^#{1,6}\s/.test(trimmed)) continue;
    // Strip inline markdown
    const clean = trimmed
      .replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\[([^\]]*)\]\(.*?\)/g, "$1")
      .trim();
    if (clean) return clean;
  }
  return "";
}

// ── Cover title generation ────────────────────────────────────────

/**
 * Generate cover title for poster-3-4 template.
 * Rules from image-plan SKILL.md:
 * 1. Take metadata.title
 * 2. If contains colon, take the part before colon
 * 3. Remove common suffixes (介绍/解读/盘点/更新/亮点/发布/公告)
 * 4. Result must be <= 15 chars
 * 5. If too long, try to shorten; fallback to full title
 */
export function generateCoverTitle(title: string): string {
  let result = title;

  // If contains colon (Chinese or ASCII), take first part
  const colonIdx = result.search(/[：:]/);
  if (colonIdx > 0) {
    result = result.slice(0, colonIdx).trim();
  }

  // Remove common suffixes
  result = result.replace(/[介解盘更亮发公]?(?:绍|读|点|新|点|布|告)$/, "").trim();

  // Check length
  if ([...result].length <= 15) {
    return result;
  }

  // Fallback: return full title (let imgx handle truncation)
  return title;
}

// ── Highlight words extraction ────────────────────────────────────

/**
 * Extract 1-3 highlight words from a title.
 * Simple algorithm: regex tokenize, prefer shorter words.
 * Rules from publish-rules.md.
 */
export function extractHighlightWords(title: string): string[] {
  // Tokenize: split on spaces, punctuation, CJK boundaries
  const tokens: string[] = [];

  // Extract English words
  const englishWords = title.match(/[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9]+)*/g);
  if (englishWords) {
    tokens.push(...englishWords);
  }

  // Extract CJK word-like sequences (2-4 chars)
  const cjkChars = title.match(
    /[\u4e00-\u9fff]{2,4}/g,
  );
  if (cjkChars) {
    tokens.push(...cjkChars);
  }

  if (tokens.length === 0) return [];

  // Deduplicate
  const unique = [...new Set(tokens)];

  // Filter out very common/boring words
  const stopWords = new Set([
    "the",
    "and",
    "for",
    "with",
    "from",
    "this",
    "that",
    "have",
    "been",
    "will",
    "your",
    "what",
    "how",
    "why",
    "can",
    "not",
    "are",
    "was",
    "were",
    "的",
    "了",
    "是",
    "在",
    "和",
    "有",
    "个",
    "我",
    "你",
    "他",
    "她",
    "它",
    "们",
    "这",
    "那",
    "也",
    "就",
    "都",
    "会",
    "要",
    "到",
    "说",
    "为",
    "不",
    "与",
    "及",
    "但",
    "而",
    "如",
    "或",
    "之",
    "从",
    "一个",
    "如何",
    "什么",
    "为什么",
    "怎么",
    "介绍",
    "解读",
    "盘点",
    "更新",
    "亮点",
    "发布",
    "公告",
  ]);

  const filtered = unique.filter((w) => !stopWords.has(w.toLowerCase()));

  if (filtered.length === 0) return [];

  // Sort: shorter words first (more impactful as highlights)
  filtered.sort((a, b) => [...a].length - [...b].length);

  // Take up to 3
  return filtered.slice(0, 3);
}

// ── Full format pipeline ──────────────────────────────────────────

/**
 * Apply all formatting rules to article/blog markdown content.
 * This is the deterministic replacement for the format skill.
 *
 * Steps:
 * 1. Fix CJK-ASCII spacing
 * 2. Downgrade H1 to H2
 * 3. Remove heading number prefixes
 * 4. Replace horizontal rules with blank lines
 * 5. Strip newspic pagination markers (【第N页】)
 * 6. Strip illustration markers ([插图1], [插图 1], 插图1, etc.)
 * 7. Compress consecutive blank lines (max 2)
 */
export function formatArticle(body: string): string {
  let result = body;
  result = fixCjkSpacing(result);
  result = downgradeH1(result);
  result = removeHeadingNumbers(result);
  result = removeHorizontalRules(result);
  result = removePageMarkers(result);
  result = removeIllustrationMarkers(result);
  result = compressBlankLines(result);
  return result;
}

/**
 * Prepare body text for imgx consumption:
 * 1. Strip frontmatter
 * 2. Remove illustration markers
 * 3. Compress blank lines
 */
export function prepareBodyForImgx(content: string): string {
  let result = stripFrontmatter(content);
  result = removeIllustrationMarkers(result);
  result = compressBlankLines(result);
  return result;
}

/**
 * Prepare body for newspic publish (post-clean.md):
 * 1. Strip frontmatter
 * 2. Strip markdown decorations (but keep structure)
 * 3. Strip newspic pagination markers such as 【第N页】
 */
export function prepareBodyForNewspic(content: string): string {
  let result = stripFrontmatter(content);
  result = convertMarkdownTablesToCompareBlocks(result);
  // Remove code fences first (before inline code regex can eat backticks)
  result = result.replace(/```[\s\S]*?```/g, "");
  // Remove bold/italic markers
  result = result.replace(/\*{1,3}([^*]+)\*{1,3}/g, "$1");
  // Remove inline code (keep text)
  result = result.replace(/`([^`]+)`/g, "$1");
  // Remove images first (before link regex can partially match ![...](...)
  result = result.replace(/!\[.*?\]\(.*?\)/g, "");
  // Remove links (keep text)
  result = result.replace(/\[([^\]]*)\]\(.*?\)/g, "$1");
  // Remove heading markers (keep text)
  result = result.replace(/^#{1,6}\s+/gm, "");
  // Remove blockquote markers (keep text)
  result = result.replace(/^>\s?/gm, "");
  // Remove horizontal rules
  result = result.replace(/^[-*_]{3,}\s*$/gm, "");
  // Remove newspic page markers from final publish content
  result = removePageMarkers(result);
  // Remove illustration markers ([插图1], [插图 1], 插图1, etc.)
  result = removeIllustrationMarkers(result);
  // Compress blank lines
  result = compressBlankLines(result);
  return result.trim() + "\n";
}

// ── Frontmatter builder ───────────────────────────────────────────

/**
 * Build YAML frontmatter string from metadata + route.
 */
export function buildFrontmatter(meta: {
  title: string;
  date: string;
  platform: string;
  description?: string | null;
  tags?: string[];
}): string {
  const lines = ["---"];
  lines.push(`title: "${meta.title.replace(/"/g, '\\"')}"`);
  lines.push(`date: ${meta.date}`);
  lines.push(`platform: ${meta.platform}`);
  if (meta.description) {
    lines.push(`description: "${meta.description.replace(/"/g, '\\"')}"`);
  }
  if (meta.tags && meta.tags.length > 0) {
    lines.push(`tags:`);
    for (const tag of meta.tags) {
      lines.push(`  - ${tag}`);
    }
  }
  lines.push("---");
  return lines.join("\n");
}
