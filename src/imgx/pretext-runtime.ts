import { Canvas, GlobalFonts, createCanvas } from "@napi-rs/canvas";
import { FONTS_DIR } from "./runtime";

let initialized = false;

class BunOffscreenCanvas {
  width: number;
  height: number;
  #canvas: Canvas;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.#canvas = createCanvas(width, height);
  }

  getContext(type: string): ReturnType<Canvas["getContext"]> | null {
    if (type !== "2d") {
      return null;
    }
    return this.#canvas.getContext("2d");
  }
}

function registerLongformFonts(): void {
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
