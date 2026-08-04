export function createObstacleFlowRuntime(options) {
  const {
    prepareWithSegments,
    layoutNextLineRange,
    materializeLineRange,
    obstacleGap,
    minSlotWidth,
    renderLine,
    renderImage,
  } = options;

  function compareCursor(a, b) {
    if (a.segmentIndex !== b.segmentIndex) return a.segmentIndex - b.segmentIndex;
    return a.graphemeIndex - b.graphemeIndex;
  }

  function clampIntervals(intervals, width) {
    const sorted = intervals
      .map(interval => ({
        left: Math.max(0, interval.left),
        right: Math.min(width, interval.right),
      }))
      .filter(interval => interval.right - interval.left >= minSlotWidth)
      .sort((a, b) => a.left - b.left);

    const merged = [];
    for (const interval of sorted) {
      const last = merged[merged.length - 1];
      if (last && interval.left <= last.right) {
        last.right = Math.max(last.right, interval.right);
        continue;
      }
      merged.push({ ...interval });
    }

    return merged.map(interval => ({ left: interval.left, width: interval.right - interval.left }));
  }

  function getIntervalsForBand(y, lineHeight, width, obstacles) {
    let intervals = [{ left: 0, right: width }];
    const bandTop = y;
    const bandBottom = y + lineHeight;

    for (const obstacle of obstacles) {
      const obstacleTop = obstacle.y;
      const obstacleBottom = obstacle.y + (obstacle.occupiedHeight ?? obstacle.height);
      if (bandBottom <= obstacleTop || bandTop >= obstacleBottom) continue;

      const next = [];
      for (const interval of intervals) {
        const obstacleLeft = Math.max(interval.left, obstacle.x - obstacleGap);
        const obstacleRight = Math.min(interval.right, obstacle.x + obstacle.width + obstacleGap);
        if (obstacleRight <= interval.left || obstacleLeft >= interval.right) {
          next.push(interval);
          continue;
        }
        if (obstacleLeft - interval.left >= minSlotWidth) {
          next.push({ left: interval.left, right: obstacleLeft });
        }
        if (interval.right - obstacleRight >= minSlotWidth) {
          next.push({ left: obstacleRight, right: interval.right });
        }
      }
      intervals = next.length > 0 ? next : intervals;
    }

    const clamped = clampIntervals(intervals, width);
    return clamped.length > 0 ? clamped : [{ left: 0, width }];
  }

  function chooseLine(prepared, cursor, intervals) {
    let best = null;
    for (const interval of intervals) {
      const line = layoutNextLineRange(prepared, cursor, interval.width);
      if (line === null) continue;
      if (best === null || compareCursor(line.end, best.line.end) > 0) {
        best = { line, interval };
      }
    }
    return best;
  }

  function applyTextIndent(intervals, indent) {
    if (!indent || indent <= 0) return intervals;
    return intervals
      .map(interval => ({
        left: interval.left + indent,
        width: interval.width - indent,
      }))
      .filter(interval => interval.width >= minSlotWidth);
  }

  function segmentToGraphemes(text) {
    return Array.from(graphemeSegmenter.segment(text), entry => entry.segment);
  }

  // Kept for reference; text materialization now goes through pretext's public
  // materializeLineRange() so we no longer reach into prepared.segments internals.
  function normalizeObstacles(width, height, bodyImages) {
    const obstacles = [];
    for (const bodyImage of bodyImages) {
      const obstacle = {
        x: Math.max(0, Math.min(width - bodyImage.width, bodyImage.x)),
        y: Math.max(0, Math.min(height - bodyImage.height, bodyImage.y)),
        width: Math.min(width, bodyImage.width),
        height: Math.min(height, bodyImage.height),
        occupiedHeight: Math.min(height, bodyImage.height),
        src: bodyImage.src,
        alt: bodyImage.alt || "body image",
        caption: bodyImage.caption || "",
        captionHeight: bodyImage.caption ? 50 : 0,
      };
      obstacles.push(obstacle);
    }
    return obstacles;
  }

  function toCaptionLines(obstacles, width, height) {
    const lines = [];
    for (const obstacle of obstacles) {
      if (!obstacle.caption) continue;
      const captionY = obstacle.y + obstacle.height + 10;
      if (captionY + 40 > height) continue;
      lines.push({
        text: obstacle.caption,
        x: obstacle.x,
        y: captionY,
        className: "body-caption",
        maxWidth: Math.min(obstacle.width, width - obstacle.x),
      });
      obstacle.occupiedHeight += obstacle.captionHeight + 10;
    }
    return lines;
  }

  function layoutPage(preparedBlocks, width, height, bodyImages, startBlockIndex, startCursor) {
    const obstacles = normalizeObstacles(width, height, bodyImages);
    const captionLines = toCaptionLines(obstacles, width, height);
    const lines = [];
    let y = 0;
    let currentBlockIndex = startBlockIndex;
    let cursor = startCursor;
    let progressed = false;

    for (let index = startBlockIndex; index < preparedBlocks.length; index++) {
      const block = preparedBlocks[index];
      currentBlockIndex = index;
      const textIndent = block.textIndent ?? 0;
      let firstLineOfBlock = cursor.segmentIndex === 0 && cursor.graphemeIndex === 0;
      if (cursor.segmentIndex === 0 && cursor.graphemeIndex === 0) {
        y += block.gapBefore ?? 0;
      }

      while (true) {
        if (y + block.lineHeight > height) {
          return {
            lines,
            images: obstacles,
            captionLines,
            nextBlockIndex: currentBlockIndex,
            nextCursor: cursor,
            done: false,
            progressed,
            textBottom: lines.length > 0 ? lines[lines.length - 1].y : 0,
          };
        }
        const intervals = applyTextIndent(
          getIntervalsForBand(y, block.lineHeight, width, obstacles),
          textIndent,
        );
        const choice = chooseLine(block.prepared, cursor, intervals);
        if (choice === null || compareCursor(choice.line.end, cursor) <= 0) break;
        lines.push({
          text: materializeLineRange(block.prepared, choice.line).text,
          x: choice.interval.left,
          y,
          className: block.className,
          bullet: firstLineOfBlock ? block.bullet : undefined,
          bulletX: firstLineOfBlock && textIndent > 0 ? choice.interval.left - textIndent : undefined,
        });
        cursor = choice.line.end;
        y += block.lineHeight;
        progressed = true;
        firstLineOfBlock = false;
      }

      const intervals = applyTextIndent(
        getIntervalsForBand(y, block.lineHeight, width, obstacles),
        textIndent,
      );
      const nextChoice = y + block.lineHeight <= height ? chooseLine(block.prepared, cursor, intervals) : null;
      if (nextChoice !== null && compareCursor(nextChoice.line.end, cursor) > 0) {
        return {
          lines,
          images: obstacles,
          captionLines,
          nextBlockIndex: currentBlockIndex,
          nextCursor: cursor,
          done: false,
          progressed,
          textBottom: lines.length > 0 ? lines[lines.length - 1].y : 0,
        };
      }

      y += block.gapAfter ?? 0;
      cursor = { segmentIndex: 0, graphemeIndex: 0 };
      currentBlockIndex = index + 1;
      if (y > height) {
        return {
          lines,
          images: obstacles,
          captionLines,
          nextBlockIndex: currentBlockIndex,
          nextCursor: cursor,
          done: false,
          progressed,
          textBottom: lines.length > 0 ? lines[lines.length - 1].y : 0,
        };
      }
    }

    // textBottom: y position after the last rendered line (before gapAfter of last block)
    const textBottom = lines.length > 0 ? lines[lines.length - 1].y : 0;
    return {
      lines,
      images: obstacles,
      captionLines,
      nextBlockIndex: preparedBlocks.length,
      nextCursor: { segmentIndex: 0, graphemeIndex: 0 },
      done: true,
      progressed,
      textBottom,
    };
  }

  function layoutBlocks(blocks, width, height, bodyImages) {
    const preparedBlocks = blocks.map(block => ({
      ...block,
      prepared: prepareWithSegments(block.text, block.font, { whiteSpace: "pre-wrap" }),
    }));
    const result = layoutPage(
      preparedBlocks,
      width,
      height,
      bodyImages,
      0,
      { segmentIndex: 0, graphemeIndex: 0 },
    );
    for (const obstacle of result.images) {
      renderImage(obstacle);
    }
    for (const line of result.captionLines) {
      renderLine(line.text, line.x, line.y, {
        className: line.className,
        maxWidth: line.maxWidth,
      });
    }
    for (const line of result.lines) {
      renderLine(line.text, line.x, line.y, {
        className: line.className,
      });
    }
  }

  function paginateBlocks(blocks, width, height, bodyImages, options = {}) {
    const preparedBlocks = blocks.map(block => ({
      ...block,
      prepared: prepareWithSegments(block.text, block.font, { whiteSpace: "pre-wrap" }),
    }));
    const pages = [];
    let blockIndex = 0;
    let cursor = { segmentIndex: 0, graphemeIndex: 0 };
    let imageIndex = 0;
    const pageImageLimit = typeof options.pageImageLimit === "number" ? options.pageImageLimit : 2;
    const pageImageGroups = Array.isArray(options.pageImageGroups) ? options.pageImageGroups : null;

    while (blockIndex < blocks.length) {
      const pageImages = pageImageGroups
        ? pageImageGroups[pages.length] ?? []
        : bodyImages.slice(imageIndex, imageIndex + pageImageLimit);
      const result = layoutPage(preparedBlocks, width, height, pageImages, blockIndex, cursor);
      if (!result.progressed && result.lines.length === 0) break;
      pages.push({
        lines: [...result.lines, ...result.captionLines],
        images: result.images,
        textBottom: result.textBottom ?? 0,
      });
      blockIndex = result.nextBlockIndex;
      cursor = result.nextCursor;
      if (!pageImageGroups) {
        imageIndex += pageImages.length;
      }
      if (result.done) break;
    }

    return pages;
  }

  return {
    layoutBlocks,
    paginateBlocks,
  };
}
