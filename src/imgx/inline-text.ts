export type InlineTextRun = { text: string; bold?: boolean; italic?: boolean; highlight?: boolean };

/** 在分页前解析强调，避免 Markdown 标记被断到不同行。 */
export function parseInlineText(text: string, highlightWords: string[] = []): InlineTextRun[] {
  const runs: InlineTextRun[] = [];
  function parse(value: string, style: Omit<InlineTextRun, "text"> = {}, depth = 0): void {
    if (depth > 3) { runs.push({ text: value, ...style }); return; }
    const pattern = /(\*\*\*|\*\*|\*)(?=\S)([\s\S]*?\S)\1/g;
    let offset = 0;
    for (const match of value.matchAll(pattern)) {
      if (match.index > offset) runs.push({ text: value.slice(offset, match.index), ...style });
      const marker = match[1]!;
      parse(match[2]!, { ...style, bold: style.bold || marker.length > 1, italic: style.italic || marker.length !== 2 }, depth + 1);
      offset = match.index + match[0].length;
    }
    if (offset < value.length) runs.push({ text: value.slice(offset), ...style });
  }
  parse(text);
  const words = [...new Set(highlightWords.map(word => word.trim()).filter(Boolean))].sort((a, b) => b.length - a.length);
  if (!words.length) return runs;
  const plain = runs.map(run => run.text).join("");
  const pattern = new RegExp(words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "gu");
  const matches = [...plain.matchAll(pattern)].map(match => ({ start: match.index, end: match.index + match[0].length }));
  let offset = 0;
  return runs.flatMap(run => {
    const start = offset;
    offset += run.text.length;
    const cuts = new Set([start, offset]);
    for (const match of matches) {
      if (match.end > start && match.start < offset) {
        cuts.add(Math.max(start, match.start));
        cuts.add(Math.min(offset, match.end));
      }
    }
    const positions = [...cuts].sort((a, b) => a - b);
    return positions.slice(0, -1).map((position, index) => ({
      ...run,
      text: plain.slice(position, positions[index + 1]),
      highlight: matches.some(match => position >= match.start && position < match.end),
    }));
  });
}

/** 只按原有换行或主副标题分隔符分组，不删改文字。 */
export function splitCoverText(text: string): { title: string; subtitle: string } {
  const normalized = text.replaceAll("\r\n", "\n").trim().replace(/^#{1,6}\s+/, "");
  const newline = normalized.indexOf("\n");
  if (newline >= 0) return { title: normalized.slice(0, newline), subtitle: normalized.slice(newline + 1).trim() };
  for (let index = 1; index < normalized.length - 1; index++) {
    if (!/[：:]/.test(normalized[index]!)) continue;
    if (normalized.slice(index + 1, index + 3) === "//") continue;
    if (/\d/.test(normalized[index - 1]!) && /\d/.test(normalized[index + 1]!)) continue;
    return { title: normalized.slice(0, index + 1), subtitle: normalized.slice(index + 1).trim() };
  }
  return { title: normalized, subtitle: "" };
}
