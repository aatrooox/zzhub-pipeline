import { expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createArticleSnapshot } from "../../src/article-snapshot";

test("same-key acceptance is durable, failed preparation does not repeat, and restart cleans only incomplete materials", async () => {
  const root = await mkdtemp(join(tmpdir(), "zzp-acceptance-"));
  const stateFile = join(root, "jobs.json"); const headers = { Authorization: "Bearer acceptance-test" };
  const now = new Date().toISOString();
  const base = { requestHash: "fixture", input: { idempotencyKey: "crashed-key", account: "test", title: "test", contentForm: "article" }, body: "body", step: "accepting", runId: null, error: null, result: null, statePath: null, createdAt: now, updatedAt: now, startedAt: null, finishedAt: null };
  await writeFile(stateFile, JSON.stringify({ jobs: [{ ...base, id: "crashed", status: "accepting" }, { ...base, id: "retained", input: { ...base.input, idempotencyKey: "retained-key" }, status: "failed" }] }));
  for (const id of ["crashed", "retained"]) { await mkdir(join(root, "jobs", id), { recursive: true }); await writeFile(join(root, "jobs", id, "keep.txt"), id); }
  const child = Bun.spawn([process.execPath, join(import.meta.dir, "server.ts")], { env: {
    ...process.env, PIPELINE_WORKER_HOST: "127.0.0.1", PIPELINE_WORKER_PORT: "0", PIPELINE_WORKER_TOKEN: "acceptance-test",
    PIPELINE_WORKSPACE_ROOT: root, PIPELINE_WORKER_STATE_FILE: stateFile, PIPELINE_WORKER_ACCOUNT_STATE_FILE: join(root, "accounts.json"),
    PIPELINE_WORKER_FREE_BYTES: "1", PIPELINE_WORKER_JOB_RESERVE_BYTES: "1",
    TYPESET_ARTICLE_COVER_FONT_PATH: join(root, "missing-font"),
  }, stdout: "pipe", stderr: "inherit" });
  try {
    const reader = child.stdout.getReader(); const { value } = await reader.read(); reader.releaseLock();
    const address = new TextDecoder().decode(value).match(/listening on (127\.0\.0\.1:\d+)/)?.[1]; expect(address).toBeTruthy();
    const url = `http://${address}`;
    const lookup = (key: string) => fetch(`${url}/v1/jobs/by-idempotency-key?idempotencyKey=${key}&account=test`, { headers });
    expect(await (await lookup("crashed-key")).json()).toMatchObject({ id: "crashed", status: "failed", error: "worker_acceptance_interrupted" });
    expect(await readdir(join(root, "jobs"))).toEqual(["retained"]);
    const content = { title: "acceptance", body: "body", account: "test" };
    const articleSnapshot = createArticleSnapshot({ ...content, documentId: "50910930-c6a8-41d5-8025-52aa97c52b5a", documentRevision: 1, bodyAssets: [] });
    const input = { ...content, contentForm: "article", operation: "preview", articleSnapshot, idempotencyKey: "same-key" };
    const submit = () => fetch(`${url}/v1/jobs`, { method: "POST", headers, body: JSON.stringify(input) });
    const responses = await Promise.all([submit(), submit(), submit()]);
    expect(responses.every(response => [200, 202].includes(response.status))).toBe(true);
    const jobs = await Promise.all(responses.map(response => response.json()));
    expect(new Set(jobs.map(job => job.id)).size).toBe(1);
    const failed = await (await lookup("same-key")).json();
    expect(failed).toMatchObject({ id: jobs[0].id, status: "failed", step: "acceptance" });
    expect((await readdir(join(root, "jobs")))).not.toContain(failed.id);
    expect((await submit()).status).toBe(200);
    expect((await (await lookup("same-key")).json()).error).toBe(failed.error);
    const saved = JSON.parse(await readFile(stateFile, "utf8"));
    expect(saved.jobs.filter((job: any) => job.input.idempotencyKey === "same-key")).toHaveLength(1);
    expect(await (await fetch(`${url}/health`, { headers })).json()).toMatchObject({ accepting: 0, preparing: 0, assetWrites: 0 });
  } finally { child.kill(); await child.exited; await rm(root, { recursive: true, force: true }); }
});
