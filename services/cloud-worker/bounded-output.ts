/** 持续排空管道避免子进程阻塞；超限只保错误尾部，不将截断 JSON 当成功结果。 */
export async function boundedOutput(stream: ReadableStream<Uint8Array>, maximum: number, tail = false, onExceeded?: () => void) {
  const reader = stream.getReader();
  let bytes = 0;
  let saved = Buffer.alloc(0);
  try {
    while (true) {
      const item = await reader.read();
      if (item.done) break;
      const previous = bytes;
      bytes += item.value.byteLength;
      if (previous <= maximum && bytes > maximum) onExceeded?.();
      if (tail) saved = item.value.byteLength >= maximum ? Buffer.from(item.value.subarray(-maximum)) : Buffer.concat([saved, item.value]).subarray(-maximum);
      else if (bytes <= maximum) saved = Buffer.concat([saved, item.value]);
    }
  } finally { reader.releaseLock(); }
  return { text: saved.toString("utf8"), exceeded: bytes > maximum };
}
