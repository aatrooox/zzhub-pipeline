/**
 * Render broker — shared types between the server (broker), the remote image
 * renderer adapter (client of the broker), and the browser render worker.
 *
 * A "render job" is a self-contained rasterization request: one or more
 * RasterTasks (HTML + viewport dimensions) that a browser client paints to
 * PNG. The server persists pending jobs so a client can pick them up after a
 * reconnect; the adapter submits a job and either waits for a connected client
 * or returns a pending result so the workflow enters handoff.
 */

import type { RasterTask } from "../imgx/runtime";
import type { RenderAsset } from "../state";

export type RenderJobKind = "image" | "markdown";

export type RenderJobStatus = "pending" | "dispatched" | "complete" | "failed";

/** A single rasterizable surface within a job. */
export interface RenderJobSurface {
  /** Stable id used by the client when returning this surface's PNG. */
  id: string;
  /** Asset kind/route metadata echoed back into the resulting RenderAsset. */
  kind: RenderAsset["kind"];
  route: RenderAsset["route"];
  index?: number;
  task: RasterTask;
  /** Output path the server expects the PNG to be written to on completion. */
  outPath: string;
}

export interface RenderJob {
  id: string;
  kind: RenderJobKind;
  status: RenderJobStatus;
  runId: string;
  statePath: string;
  createdAt: string;
  updatedAt: string;
  surfaces: RenderJobSurface[];
  /** Markdown-only: markdown content to convert to WeChat HTML. */
  markdown?: {
    title: string;
    account: string;
  };
  error?: string | null;
}

/** Payload the browser client POSTs back when a surface is rendered. */
export interface RenderSurfaceResult {
  surfaceId: string;
  /** PNG bytes, base64-encoded. */
  pngBase64: string;
}

export interface SubmitRenderResultInput {
  jobId: string;
  results: RenderSurfaceResult[];
  error?: string;
}
