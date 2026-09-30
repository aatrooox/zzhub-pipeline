import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { executeCloudJob } from "./pipeline";
import { type CloudJobInput, JobStore, type StoredCloudJob } from "./store";

const host = process.env.PIPELINE_WORKER_HOST?.trim() || "127.0.0.1";
const port = Number(process.env.PIPELINE_WORKER_PORT || "18887");
// 非回环监听只允许部署在隔离容器网络中显式开启。
const privateNetwork = process.env.PIPELINE_WORKER_PRIVATE_NETWORK === "1";
const workspaceRoot = resolve(process.env.PIPELINE_WORKSPACE_ROOT?.trim() || "/data/pipeline-worker");
const store = new JobStore(resolve(process.env.PIPELINE_WORKER_STATE_FILE?.trim() || "/data/pipeline-worker/jobs.json"));
const queue: string[] = [];
let draining = false;

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

function bearerMatches(request: Request): boolean {
  const token = process.env.PIPELINE_WORKER_TOKEN?.trim();
  if (!token)
    return false;
  const actual = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from(`Bearer ${token}`);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function publicJob(job: StoredCloudJob): Record<string, unknown> {
  const safeJob = { ...job } as Record<string, unknown>;
  delete safeJob.body;
  return { ...safeJob, input: { ...job.input } };
}

function validateInput(value: unknown): CloudJobInput {
  if (!value || typeof value !== "object")
    throw new Error("Request body must be an object");
  const input = value as Record<string, unknown>;
  const idempotencyKey = typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
  const title = typeof input.title === "string" ? input.title.trim() : "";
  const body = typeof input.body === "string" ? input.body : "";
  const account = typeof input.account === "string" ? input.account.trim() : "";
  const contentForm = input.contentForm === "newspic" ? "newspic" : input.contentForm === "article" ? "article" : null;
  if (!idempotencyKey || idempotencyKey.length > 200)
    throw new Error("idempotencyKey is required and must be <= 200 characters");
  if (!title || title.length > 255)
    throw new Error("title is required and must be <= 255 characters");
  if (!body || body.length > 2_000_000)
    throw new Error("body is required and must be <= 2 MB");
  if (!contentForm)
    throw new Error("contentForm must be article or newspic");
  if (!/^[a-zA-Z0-9_.-]+$/.test(account))
    throw new Error("account is required and must contain only letters, numbers, _, ., or -");
  return {
    idempotencyKey,
    title,
    body,
    contentForm,
    account,
    intentText: typeof input.intentText === "string" ? input.intentText.trim() : undefined,
    existingDraftMediaId: typeof input.existingDraftMediaId === "string" ? input.existingDraftMediaId.trim() || null : null,
  };
}

function requestHash(input: CloudJobInput): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

async function drain(): Promise<void> {
  if (draining)
    return;
  draining = true;
  try {
    while (queue.length > 0) {
      const id = queue.shift()!;
      const job = store.get(id);
      if (!job || job.status !== "queued")
        continue;
      job.status = "running";
      job.startedAt = new Date().toISOString();
      job.step = "starting";
      await store.set(job);
      try {
        await executeCloudJob(job, { ...job.input, body: job.body }, store, workspaceRoot);
        job.status = "succeeded";
        job.finishedAt = new Date().toISOString();
        await store.set(job);
      } catch (error) {
        job.status = "failed";
        job.error = error instanceof Error ? error.message : String(error);
        job.finishedAt = new Date().toISOString();
        await store.set(job);
      }
    }
  } finally {
    draining = false;
  }
}

async function main(): Promise<void> {
  if (!process.env.PIPELINE_WORKER_TOKEN?.trim())
    throw new Error("PIPELINE_WORKER_TOKEN is required");
  if (!["127.0.0.1", "::1", "localhost"].includes(host) && !privateNetwork)
    throw new Error("PIPELINE_WORKER_HOST must be loopback unless PIPELINE_WORKER_PRIVATE_NETWORK=1");
  await mkdir(workspaceRoot, { recursive: true });
  await store.load();
  for (const job of store.jobs.values()) {
    if (job.status === "queued") queue.push(job.id);
  }
  void drain();

  const server = Bun.serve({
    hostname: host,
    port,
    async fetch(request) {
      const url = new URL(request.url);
      if (!bearerMatches(request))
        return json({ error: "unauthorized" }, 401);
      if (url.pathname === "/health" && request.method === "GET")
        return json({ service: "zzhub-pipeline-worker", status: "ok", queued: queue.length, running: draining });

      try {
        if (url.pathname === "/v1/jobs" && request.method === "POST") {
          const contentLength = Number(request.headers.get("content-length") || "0");
          if (Number.isFinite(contentLength) && contentLength > 2_500_000)
            return json({ error: "request body too large" }, 413);
          const input = validateInput(await request.json());
          const existing = store.findByIdempotencyKey(input.idempotencyKey);
          if (existing && existing.requestHash !== requestHash(input))
            return json({ error: "idempotency_conflict" }, 409);
          if (existing)
            return json(publicJob(existing), 200);
          const now = new Date().toISOString();
          const job: StoredCloudJob = {
            id: randomUUID(),
            requestHash: requestHash(input),
            input: {
              idempotencyKey: input.idempotencyKey,
              title: input.title,
              contentForm: input.contentForm,
              account: input.account,
              intentText: input.intentText,
              existingDraftMediaId: input.existingDraftMediaId,
            },
            status: "queued",
            step: "queued",
            runId: null,
            error: null,
            result: null,
            createdAt: now,
            updatedAt: now,
            startedAt: null,
            finishedAt: null,
            body: input.body,
            statePath: null,
          };
          await store.set(job);
          queue.push(job.id);
          void drain();
          return json(publicJob(job), 202);
        }

        const match = url.pathname.match(/^\/v1\/jobs\/([^/]+)$/);
        if (match && request.method === "GET") {
          const job = store.get(match[1]);
          return job ? json(publicJob(job)) : json({ error: "job_not_found" }, 404);
        }
        return json({ error: "not_found" }, 404);
      } catch (error) {
        return json({ error: error instanceof Error ? error.message : String(error) }, 400);
      }
    },
  });
  console.log(`zzhub-pipeline-worker listening on ${host}:${server.port}`);
}

await main();
