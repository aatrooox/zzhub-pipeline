import { prepareRichInline, layoutNextRichInlineLineRange, materializeRichInlineLineRange, type RichInlineCursor } from "./pretext-adapter";
import type { InlineTextRun } from "./inline-text";
import { ensurePretextRuntime } from "./pretext-runtime";

export type FlowBlock = {
  text: string;
  runs: InlineTextRun[];
  font: string;
  lineHeight: number;
  className: string;
  gapBefore?: number;
  gapAfter?: number;
  bullet?: string;
  textIndent?: number;
  keepWithNext?: boolean;
};
export type FlowImage = {
  src: string; alt: string; caption?: string;
  x: number; y: number; width: number; height: number;
  captionHeight?: number;
};
export type FlowLine = {
  text: string; x: number; y: number; className: string;
  font: string; lineHeight: number; maxWidth: number;
  runs: Array<InlineTextRun & { font: string; gapBefore: number; occupiedWidth: number }>;
  bullet?: string; bulletX?: number;
};
export type FlowPage = { lines: FlowLine[]; images: FlowImage[]; textBottom: number };
const START: RichInlineCursor = { itemIndex: 0, segmentIndex: 0, graphemeIndex: 0 };

/** 字体与最终 span 使用同一个值，加粗和斜体都参与宽度测量。 */
function runFont(font: string, run: InlineTextRun): string {
  const weighted = run.bold ? font.replace(/^\d+\s+/, "700 ") : font;
  return run.italic ? "italic " + weighted : weighted;
}
function compareCursor(a: RichInlineCursor, b: RichInlineCursor): number {
  return a.itemIndex - b.itemIndex || a.segmentIndex - b.segmentIndex || a.graphemeIndex - b.graphemeIndex;
}

/** 按真实行高和图片占位分页；无进展时失败，绝不丢弃余文。 */
export function paginateBlocks(blocks: FlowBlock[], width: number, height: number, bodyImages: FlowImage[], options: {
  pageImageLimit?: number;
  pageImageGroups?: FlowImage[][] | null;
} = {}): FlowPage[] {
  ensurePretextRuntime();
  const prepared = blocks.map(block => {
    const runs = block.runs.map(run => ({ ...run, font: runFont(block.font, run) }));
    return { ...block, runs, prepared: prepareRichInline(runs) };
  });
  type PreparedBlock = typeof prepared[number];
  type PlacedLine = FlowLine & { start: RichInlineCursor; end: RichInlineCursor };
  const gap = 20;

  function place(block: PreparedBlock, cursor: RichInlineCursor, initialY: number, images: FlowImage[], limit = Infinity) {
    const lines: PlacedLine[] = [];
    let y = initialY;
    while (y + block.lineHeight <= height && lines.length < limit) {
      if (!layoutNextRichInlineLineRange(block.prepared, width, cursor)) return { lines, cursor, y, done: true };
      const indent = block.textIndent ?? 0;
      let intervals = [{ left: 0, right: width }];
      const blockers = images.filter(image => y + block.lineHeight > image.y - gap && y < image.y + image.height + (image.captionHeight ?? 0) + gap);
      for (const image of blockers) {
        intervals = intervals.flatMap(interval => {
          if (image.x - gap >= interval.right || image.x + image.width + gap <= interval.left) return [interval];
          return [{ left: interval.left, right: Math.min(interval.right, image.x - gap) }, { left: Math.max(interval.left, image.x + image.width + gap), right: interval.right }];
        }).filter(interval => interval.right > interval.left);
      }
      const fontSize = Number(block.font.match(/(\d+(?:\.\d+)?)px/)?.[1] ?? 40);
      let best: { line: NonNullable<ReturnType<typeof layoutNextRichInlineLineRange>>; left: number; width: number } | null = null;
      for (const interval of intervals) {
        const slotWidth = interval.right - interval.left - indent;
        if (slotWidth < fontSize * (blockers.length ? 3 : 1)) continue;
        const line = layoutNextRichInlineLineRange(block.prepared, slotWidth, cursor);
        if (!line || line.width > slotWidth + 0.5) continue;
        if (!best || compareCursor(line.end, best.line.end) > 0) best = { line, left: interval.left + indent, width: slotWidth };
      }
      if (!best) {
        if (!blockers.length) throw new Error("文字无法放入当前排版宽度，请调整字号或内容宽度");
        y = Math.min(...blockers.map(image => image.y + image.height + (image.captionHeight ?? 0) + gap));
        continue;
      }
      if (compareCursor(best.line.end, cursor) <= 0) throw new Error("分页未取得进展，请检查文字与版式参数");
      const line = materializeRichInlineLineRange(block.prepared, best.line);
      const runs = line.fragments.map(fragment => ({ ...block.runs[fragment.itemIndex]!, text: fragment.text, gapBefore: fragment.gapBefore, occupiedWidth: fragment.occupiedWidth }));
      lines.push({
        text: runs.map(run => run.text).join(""), runs, x: best.left, y,
        className: block.className, font: block.font, lineHeight: block.lineHeight, maxWidth: best.width,
        start: cursor, end: line.end,
        bullet: compareCursor(cursor, START) === 0 ? block.bullet : undefined,
        bulletX: compareCursor(cursor, START) === 0 && block.bullet ? best.left - indent : undefined,
      });
      cursor = line.end;
      y += block.lineHeight;
    }
    return { lines, cursor, y, done: layoutNextRichInlineLineRange(block.prepared, width, cursor) === null };
  }

  /** 图片与说明共同占位，缩放始终保持原始比例。 */
  function normalizeImage(image: FlowImage): FlowImage {
    const scale = Math.min(1, width / image.width, height / image.height);
    const imageWidth = image.width * scale;
    let captionHeight = 0;
    if (image.caption) {
      const caption = prepareRichInline([{ text: image.caption, font: '400 28px "LXGWNeoZhiSongPlus"' }]);
      let cursor = START;
      while (true) {
        const line = layoutNextRichInlineLineRange(caption, imageWidth, cursor);
        if (!line) break;
        if (compareCursor(line.end, cursor) <= 0) throw new Error("图片说明无法排版");
        captionHeight += 40;
        cursor = line.end;
      }
      captionHeight += 10;
    }
    if (captionHeight >= height) throw new Error("图片说明超出页面高度");
    const finalScale = Math.min(scale, (height - captionHeight) / image.height);
    const finalWidth = image.width * finalScale;
    const finalHeight = image.height * finalScale;
    // 说明占位按实际图片宽度重新计算，避免缩图后说明多出一行。
    if (image.caption && finalWidth < imageWidth - 0.5) return normalizeImage({ ...image, width: finalWidth, height: finalHeight });
    return { ...image, width: finalWidth, height: finalHeight, captionHeight, x: Math.max(0, Math.min(width - finalWidth, image.x)), y: Math.max(0, Math.min(height - finalHeight - captionHeight, image.y)) };
  }

  const pages: FlowPage[] = [];
  let blockIndex = 0;
  let cursor = START;
  let imageIndex = 0;
  const groups = options.pageImageGroups;
  const imageLimit = Math.max(1, options.pageImageLimit ?? 2);
  while (blockIndex < prepared.length || (groups ? pages.length < groups.length : imageIndex < bodyImages.length)) {
    const images = (groups ? groups[pages.length] ?? [] : bodyImages.slice(imageIndex, imageIndex + imageLimit)).map(normalizeImage);
    const lines: FlowLine[] = [];
    const initialBlockIndex = blockIndex;
    const initialCursor = cursor;
    let y = 0;
    while (blockIndex < prepared.length) {
      const block = prepared[blockIndex]!;
      const startsBlock = compareCursor(cursor, START) === 0;
      const startY = y + (startsBlock && lines.length ? block.gapBefore ?? 0 : 0);
      if (startsBlock && block.keepWithNext && lines.length) {
        let probeY = startY;
        let fits = true;
        for (let index = blockIndex; index < prepared.length; index++) {
          const following = prepared[index]!;
          if (index > blockIndex) probeY += following.gapBefore ?? 0;
          const probe = place(following, START, probeY, images, following.keepWithNext ? Infinity : 2);
          if (following.keepWithNext ? !probe.done : probe.lines.length < 2 && !probe.done) { fits = false; break; }
          if (!following.keepWithNext) break;
          probeY = probe.y + (following.gapAfter ?? 0);
        }
        if (!fits) break;
      }
      const chunk = place(block, cursor, startY, images);
      if (!chunk.done && chunk.lines.length) {
        const remainder = place(block, chunk.cursor, 0, [], 2);
        if (remainder.done && remainder.lines.length === 1 && chunk.lines.length >= 2) {
          const moved = chunk.lines.pop()!;
          chunk.cursor = moved.start;
          chunk.y = moved.y;
        }
        if (startsBlock && chunk.lines.length < 2 && lines.length) break;
      }
      lines.push(...chunk.lines);
      cursor = chunk.cursor;
      y = chunk.y;
      if (!chunk.done) break;
      blockIndex++;
      cursor = START;
      y += block.gapAfter ?? 0;
    }
    if (blockIndex === initialBlockIndex && compareCursor(cursor, initialCursor) === 0 && !images.length) throw new Error("页面高度不足，无法继续分页；请放宽页数或版式约束");
    if (!lines.length && !images.length) continue;
    pages.push({ lines, images, textBottom: lines.reduce((bottom, line) => Math.max(bottom, line.y + line.lineHeight), 0) });
    if (!groups) imageIndex += images.length;
  }
  return pages;
}
