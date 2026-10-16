import { afterEach, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, rm, stat, truncate, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { WorkerCapacity, workerLimits } from "./capacity";
import { boundedOutput } from "./bounded-output";
import { freezeArticleArtifacts } from "./artifacts";
import type { PreparedArticle } from "./job-materials";
import type { StoredCloudJob } from "./store";

const defaults = { ...workerLimits };
const roots: string[] = [];
async function temporary() { const root = await mkdtemp(join(tmpdir(), "zzp-capacity-")); roots.push(root); return root; }
afterEach(async () => { Object.assign(workerLimits, defaults); await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

test("prepare rejects its third concurrent reservation and releases the recorded stage", async () => {
  const root = await temporary(); Object.assign(workerLimits, { freeBytes: 1, jobReserveBytes: 1, prepareConcurrency: 2 });
  const capacity = new WorkerCapacity(root, () => []);
  await capacity.reserveJob("one", join(root, "one"), true);
  await capacity.reserveJob("two", join(root, "two"), true);
  expect(capacity.preparingCount).toBe(2);
  expect(await capacity.reserveJob("one", join(root, "one"))).toBe(false);
  await expect(capacity.reserveJob("three", join(root, "three"), true)).rejects.toMatchObject({ code: "worker_prepare_busy", status: 429 });
  capacity.releaseJob("one"); capacity.releaseJob("one");
  expect(capacity.preparingCount).toBe(1);
  await capacity.reserveJob("three", join(root, "three"), true);
  expect(capacity.preparingCount).toBe(2);
  workerLimits.freeBytes = Number.MAX_SAFE_INTEGER;
  await expect(capacity.checkPhase()).rejects.toMatchObject({ code: "worker_storage_low", status: 507 });
});

test("cache serializes capacity checks, counts temporary bytes and preserves retained references", async () => {
  const root = await temporary(); const directory = join(root, "assets"); await mkdir(directory);
  Object.assign(workerLimits, { freeBytes: 1, jobReserveBytes: 1, cacheBytes: 8, cacheTtlMs: 60_000 });
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const pinned = hash("pinned"), expired = hash("expired"), fresh = hash("fresh");
  const file = (value: string) => join(directory, `${value}.bytes`);
  await writeFile(file(pinned), "1234"); await writeFile(file(expired), "1234");
  const old = new Date(Date.now() - 120_000); await utimes(file(pinned), old, old); await utimes(file(expired), old, old);
  await writeFile(`${file(fresh)}.aa11-22bb.tmp`, "1234");
  const retained = { input: { articleSnapshot: { bodyAssets: [{ sha256: pinned }] } } } as StoredCloudJob;
  const capacity = new WorkerCapacity(root, () => [retained]); await capacity.initialize();
  expect(await readdir(directory)).toEqual([`${pinned}.bytes`]);
  const outcomes = await Promise.allSettled([fresh, hash("other")].map(value => capacity.writeCache(file(value), 4, () => writeFile(file(value), "5678"))));
  expect(outcomes.filter(value => value.status === "fulfilled")).toHaveLength(1);
  const rejected = outcomes.find(value => value.status === "rejected") as PromiseRejectedResult;
  expect(rejected.reason).toMatchObject({ code: "worker_cache_full", status: 507 });
  expect((await stat(file(pinned))).size).toBe(4);
  // 同 hash 重复写不重复记容量；未过期的临时字节仍计入总量。
  const stored = outcomes[0]!.status === "fulfilled" ? fresh : hash("other");
  await capacity.writeCache(file(stored), 4, async () => {});
  await writeFile(join(directory, "pending.tmp"), "1");
  await expect(capacity.writeCache(file(stored), 4, async () => {})).rejects.toMatchObject({ code: "worker_cache_full" });
});

test("bounded child output drains after overflow, signals once and preserves only stderr tail", async () => {
  let reads = 0, exceeded = 0;
  const source = new ReadableStream<Uint8Array>({ pull(controller) { if (++reads > 3) controller.close(); else controller.enqueue(Buffer.from("abcd")); } });
  expect(await boundedOutput(source, 5, false, () => { exceeded += 1; })).toEqual({ text: "abcd", exceeded: true });
  expect(reads).toBe(4); expect(exceeded).toBe(1);
  const tail = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(Buffer.from("123456789")); controller.close(); } });
  expect(await boundedOutput(tail, 4, true)).toEqual({ text: "6789", exceeded: true });
});

test("artifact source limits reject before creating artifact copies", async () => {
  const root = await temporary(); const html = join(root, "article.html"), cover = join(root, "cover.png");
  await writeFile(html, "x"); await writeFile(cover, "x"); await truncate(html, 50 * 1024 * 1024 + 1);
  await expect(freezeArticleArtifacts(root, { bodyAssets: [], systemAssets: [] } as unknown as PreparedArticle, html, cover, root)).rejects.toMatchObject({ code: "worker_artifacts_too_large", status: 413 });
  expect(await readdir(root)).not.toContain("artifacts");
});

test("space checks sample remaining free bytes after observing reservation growth", async () => {
  const root = await temporary(); const fixture = join(root, "space-order.ts");
  await writeFile(fixture, `import { mock } from "bun:test";
import * as fs from "node:fs/promises";
const original={...fs}; let checking=false, scanned=false; const calls=[];
mock.module("node:fs/promises",()=>({...original,
  readdir:async()=>{ if(!checking)return []; scanned=true; calls.push("growth"); return [{name:"bytes",isDirectory:()=>false,isFile:()=>true}]; },
  stat:async()=>({size:4}),
  statfs:async()=>{if(checking)calls.push("free"); return {bavail:checking?(scanned?8:12):100,bsize:1};}
}));
const {WorkerCapacity,workerLimits}=await import(${JSON.stringify(join(import.meta.dir, "capacity.ts"))});
Object.assign(workerLimits,{freeBytes:8,jobReserveBytes:8});
const capacity=new WorkerCapacity("/fixture",()=>[]); await capacity.reserveJob("job","/fixture/job"); checking=true;
let error; try{await capacity.checkPhase();}catch(value){error=value.code;}
console.log(JSON.stringify({calls,error}));`);
  const child = Bun.spawn([process.execPath, fixture], { stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exit] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  expect(stderr).toBe(""); expect(exit).toBe(0);
  expect(JSON.parse(stdout)).toEqual({ calls: ["growth", "free"], error: "worker_storage_low" });
});
