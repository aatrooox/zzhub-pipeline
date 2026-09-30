import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

export type CloudJobStatus = "queued" | "running" | "succeeded" | "failed" | "interrupted";

export interface CloudJobInput {
  idempotencyKey: string;
  title: string;
  body: string;
  contentForm: "article" | "newspic";
  account: string;
  intentText?: string;
  existingDraftMediaId?: string | null;
}

export interface CloudJob {
  id: string;
  requestHash: string;
  input: Omit<CloudJobInput, "body">;
  status: CloudJobStatus;
  step: string;
  runId: string | null;
  error: string | null;
  result: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface StoredCloudJob extends CloudJob {
  body: string;
  statePath: string | null;
}

interface PersistedStore {
  jobs: StoredCloudJob[];
}

/** ponytail: 单进程全量写 JSON；多副本或大量历史任务时迁移到数据库队列。 */
export class JobStore {
  readonly jobs = new Map<string, StoredCloudJob>();
  private writeChain: Promise<void> = Promise.resolve();

  constructor(readonly filePath: string) {}

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.filePath, "utf8")) as PersistedStore;
      if (!Array.isArray(parsed.jobs)) throw new Error("Invalid worker job store");
      for (const job of parsed.jobs) {
        job.requestHash ||= createHash("sha256").update(JSON.stringify({ ...job.input, body: job.body })).digest("hex");
        if (job.status === "running") {
          job.status = "interrupted";
          job.error = "Worker interrupted; inspect the original Pipeline run and draft box before retrying. Publishing may already have succeeded.";
          job.finishedAt = new Date().toISOString();
          job.updatedAt = job.finishedAt;
        }
        this.jobs.set(job.id, job);
      }
      await this.persist();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT")
        throw error;
      await this.persist();
    }
  }

  get(id: string): StoredCloudJob | null {
    return this.jobs.get(id) || null;
  }

  findByIdempotencyKey(key: string): StoredCloudJob | null {
    for (const job of this.jobs.values()) {
      if (job.input.idempotencyKey === key)
        return job;
    }
    return null;
  }

  async set(job: StoredCloudJob): Promise<void> {
    job.updatedAt = new Date().toISOString();
    this.jobs.set(job.id, job);
    await this.persist();
  }

  async persist(): Promise<void> {
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporaryPath = `${this.filePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, `${JSON.stringify({ jobs: [...this.jobs.values()] }, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
      await rename(temporaryPath, this.filePath);
    });
    return this.writeChain;
  }
}

export function defaultJobWorkspace(root: string, jobId: string): string {
  return join(root, "jobs", jobId);
}
