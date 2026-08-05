/**
 * RenderBroker — persists render jobs and mediates between workflow commands
 * (which request rasterization) and connected browser clients (which produce
 * PNGs). Phase 2 provides the file-backed job store plus an in-process
 * completion notifier; Phase 3 wires dispatch over WebSocket and exposes the
 * submit/list HTTP routes through `zzp serve`.
 *
 * Job files live in `<workspace>/.zzhub-media/render-jobs/<jobId>.json`,
 * mirroring the state file locking model so concurrent commands don't corrupt
 * each other.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomUUID } from "node:crypto";

import type {
  RenderJob,
  RenderJobSurface,
  SubmitRenderResultInput,
} from "./render-broker-types";
import {
  acquireStateOperationLock,
  completeRender,
  readResolvedState,
  writeState,
  type RenderAsset,
} from "../state";

export interface CreateRenderJobInput {
  workspaceRoot: string;
  runId: string;
  statePath: string;
  surfaces: RenderJobSurface[];
}

export interface CompletedJob {
  job: RenderJob;
  assets: RenderAsset[];
}

type Waiter = (completed: CompletedJob | { error: string }) => void;

function jobsDir(workspaceRoot: string): string {
  return join(workspaceRoot, ".zzhub-media", "render-jobs");
}

function jobPath(workspaceRoot: string, jobId: string): string {
  return join(jobsDir(workspaceRoot), `${jobId}.json`);
}

function nowIso(): string {
  return new Date().toISOString();
}

export class RenderBroker {
  private waiters = new Map<string, Waiter>();

  createJob(input: CreateRenderJobInput): RenderJob {
    const id = randomUUID();
    const ts = nowIso();
    const job: RenderJob = {
      id,
      kind: "image",
      status: "pending",
      runId: input.runId,
      statePath: input.statePath,
      createdAt: ts,
      updatedAt: ts,
      surfaces: input.surfaces,
    };
    const path = jobPath(input.workspaceRoot, id);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(job, null, 2), "utf-8");
    return job;
  }

  getJob(workspaceRoot: string, jobId: string): RenderJob | null {
    const path = jobPath(workspaceRoot, jobId);
    if (!existsSync(path)) return null;
    try {
      return JSON.parse(readFileSync(path, "utf-8")) as RenderJob;
    } catch {
      return null;
    }
  }

  /** List pending jobs, oldest first (for a freshly-connected client to claim). */
  listPending(workspaceRoot: string): RenderJob[] {
    const dir = jobsDir(workspaceRoot);
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    const jobs: RenderJob[] = [];
    for (const file of files) {
      try {
        const job = JSON.parse(readFileSync(join(dir, file), "utf-8")) as RenderJob;
        if (job.status === "pending" || job.status === "dispatched") {
          jobs.push(job);
        }
      } catch {
        // skip malformed
      }
    }
    jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return jobs;
  }

  /**
   * Submit rendered PNGs back for a job. Writes each surface's PNG to its
   * outPath, marks the job complete, and resolves any in-process waiters.
   */
  async submitResult(input: SubmitRenderResultInput, workspaceRoot: string): Promise<CompletedJob> {
    const job = this.getJob(workspaceRoot, input.jobId);
    if (!job) {
      throw new Error(`render job not found: ${input.jobId}`);
    }
    if (job.status === "complete") {
      // Idempotent: rebuild the asset list without rewriting PNGs.
      return this.buildCompleted(job);
    }
    if (input.error) {
      job.status = "failed";
      job.error = input.error;
      job.updatedAt = nowIso();
      writeFileSync(jobPath(workspaceRoot, job.id), JSON.stringify(job, null, 2), "utf-8");
      const waiter = this.waiters.get(job.id);
      if (waiter) {
        this.waiters.delete(job.id);
        waiter({ error: input.error });
      }
      throw new Error(`render job ${job.id} failed: ${input.error}`);
    }

    const bySurface = new Map(input.results.map((r) => [r.surfaceId, r]));
    const assets: RenderAsset[] = [];
    for (const surface of job.surfaces) {
      const result = bySurface.get(surface.id);
      if (!result) {
        throw new Error(`missing render result for surface ${surface.id}`);
      }
      mkdirSync(dirname(surface.outPath), { recursive: true });
      writeFileSync(surface.outPath, Buffer.from(result.pngBase64, "base64"));
      assets.push({
        kind: surface.kind,
        route: surface.route,
        path: surface.outPath,
        ...(surface.index !== undefined ? { index: surface.index } : {}),
      });
    }

    job.status = "complete";
    job.updatedAt = nowIso();
    writeFileSync(jobPath(workspaceRoot, job.id), JSON.stringify(job, null, 2), "utf-8");

    // Advance the workflow state out of render-handoff so the next status
    // check moves on to publish (or done). Best-effort: the job is complete
    // and its PNGs are on disk even if the state write races/fails.
    await this.advanceStateAfterCompletion(job, assets).catch(() => undefined);

    const completed: CompletedJob = { job, assets };
    const waiter = this.waiters.get(job.id);
    if (waiter) {
      this.waiters.delete(job.id);
      waiter(completed);
    }
    return completed;
  }

  /**
   * Wait up to `timeoutMs` for a job to complete. Returns null on timeout so
   * the caller can put the workflow into handoff instead of blocking forever.
   */
  waitForCompletion(
    jobId: string,
    timeoutMs: number,
  ): Promise<CompletedJob | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiters.delete(jobId);
        resolve(null);
      }, timeoutMs);
      this.waiters.set(jobId, (value) => {
        clearTimeout(timer);
        if ("error" in value) {
          resolve(null);
        } else {
          resolve(value);
        }
      });
    });
  }

  /** Remove the persisted job file (called after the workflow advances). */
  cleanup(workspaceRoot: string, jobId: string): void {
    rmSync(jobPath(workspaceRoot, jobId), { force: true });
  }

  private async advanceStateAfterCompletion(
    job: RenderJob,
    assets: RenderAsset[],
  ): Promise<void> {
    // Resolve the canonical state path (the job may point at a temp run file
    // that redirects to the canonical workflow-state.json).
    const resolved = await readResolvedState(job.statePath);
    const releaseLock = await acquireStateOperationLock(resolved.path);
    try {
      const state = resolved.state;
      if (state.phase.render.status === "done") {
        return; // already advanced (idempotent re-submit)
      }
      const routedAssets = assets.map((asset) =>
        asset.route ? asset : { ...asset, route: job.surfaces[0]?.route },
      ).filter((a): a is RenderAsset => Boolean(a.route));
      completeRender(state, routedAssets);
      await writeState(resolved.path, state);
    } finally {
      await releaseLock();
    }
  }

  private buildCompleted(job: RenderJob): CompletedJob {
    const assets: RenderAsset[] = job.surfaces.map((s) => ({
      kind: s.kind,
      route: s.route,
      path: s.outPath,
      ...(s.index !== undefined ? { index: s.index } : {}),
    }));
    return { job, assets };
  }
}

let singleton: RenderBroker | null = null;

/** Process-wide broker instance (one per Bun process). */
export function getRenderBroker(): RenderBroker {
  if (!singleton) singleton = new RenderBroker();
  return singleton;
}
