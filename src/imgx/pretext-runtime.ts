import type { Canvas } from "@napi-rs/canvas";
import { FONTS_DIR } from "./runtime";

let initialized = false;

// Lazy-loaded canvas module — avoids crash at import time when @napi-rs/canvas is missing.
let canvasMod: { Canvas: typeof Canvas; GlobalFonts: typeof import("@napi-rs/canvas").GlobalFonts; createCanvas: typeof import("@napi-rs/canvas").createCanvas } | null = null;

function getCanvas() {
  if (!canvasMod) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      canvasMod = require("@napi-rs/canvas");
    } catch {
      throw new Error(
        "@napi-rs/canvas not installed. Required for image rendering.\n" +
        "Install it with:\n" +
        "  npm install @napi-rs/canvas\n" +
        "  # or: bun add @napi-rs/canvas",
      );
    }
  }
  return canvasMod!;
}

class BunOffscreenCanvas {
  width: number;
  height: number;
  #canvas: Canvas;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.#canvas = getCanvas().createCanvas(width, height);
  }

  getContext(type: string): ReturnType<Canvas["getContext"]> | null {
    if (type !== "2d") {
      return null;
    }
    return this.#canvas.getContext("2d");
  }
}

function registerLongformFonts(): void {
  const { GlobalFonts } = getCanvas();
  GlobalFonts.registerFromPath(`${FONTS_DIR}/AlimamaShuHeiTi-Bold.ttf`, "AlimamaShuHeiTi");
  GlobalFonts.registerFromPath(`${FONTS_DIR}/LXGWNeoZhiSongPlus.ttf`, "LXGWNeoZhiSongPlus");
  GlobalFonts.registerFromPath(`${FONTS_DIR}/LXGWWenKai-Regular.ttf`, "LXGWWenKai");
}

export function ensurePretextRuntime(): void {
  if (initialized) {
    return;
  }
  if (typeof globalThis.OffscreenCanvas === "undefined") {
    globalThis.OffscreenCanvas = BunOffscreenCanvas as unknown as typeof OffscreenCanvas;
  }
  registerLongformFonts();
  initialized = true;
}
