import { afterEach, beforeEach, expect, test } from "bun:test";
import { appendFile, mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { defaultState, writeState } from "./state";
import { runWithCommandLog } from "./logger";
import { notifyProgress, reportLog, reportProgress } from "./monitor/recorder";
import { MonitorStore } from "./monitor/store";
import { serveMonitor } from "./monitor/server";
import { LOG_LIMIT } from "./monitor/runtime";
import type { MonitorDescriptor, MonitorSnapshot } from "./monitor/types";

let root = "";
let stop: (() => void) | undefined;
const previousEnv = { ...process.env };
const cli = resolve(import.meta.dir, "cli.ts");

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "zzp-monitor-test-"));
  process.env.ZZHUB_PIPELINE_MONITOR_DIR = join(root, "monitor");
  process.env.ZZHUB_PIPELINE_LOG_DIR = join(root, "logs");
  process.env.ZZHUB_PIPELINE_CONFIG = join(root, "config.json");
  process.env.ZZHUB_PIPELINE_MONITOR = "1";
  process.env.NO_COLOR = "1";
  await writeFile(process.env.ZZHUB_PIPELINE_CONFIG, "{}");
});

afterEach(async () => {
  stop?.();
  stop = undefined;
  for (const key of ["ZZHUB_PIPELINE_MONITOR_DIR", "ZZHUB_PIPELINE_LOG_DIR", "ZZHUB_PIPELINE_CONFIG", "ZZHUB_PIPELINE_MONITOR", "NO_COLOR"]) {
    if (previousEnv[key] === undefined) delete process.env[key];
    else process.env[key] = previousEnv[key];
  }
  await rm(root, { recursive: true, force: true });
});

async function run(args: string[]) {
  const child = Bun.spawn([process.execPath, cli, ...args], { env: { ...process.env }, stdout: "pipe", stderr: "pipe" });
  const [stdout, stderr, exitCode] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
  return { stdout, stderr, exitCode };
}

async function seed(workspace = root, runId = "same-run") {
  const asset = join(workspace, "posts", "test");
  await mkdir(asset, { recursive: true });
  await writeFile(join(asset, "post.md"), "# 测试\n\n正文");
  const state = defaultState();
  state.run_id = runId;
  state.workspace_root = workspace;
  state.state_path = join(asset, "workflow-state.json");
  state.asset_path = asset;
  state.metadata = { ...state.metadata, title: "测试", slug: "test", date: "2026-09-06" };
  state.content_review.status = "passed";
  state.intent.requires.render = false;
  state.intent.requires.publish = true;
  state.route.primary = "blog";
  state.phase.current = "publish";
  state.phase.prepare.status = "done";
  state.phase.render.status = "done";
  await writeState(state.state_path, state);
  return state;
}

async function blogCommand(script: string) {
  await writeFile(process.env.ZZHUB_PIPELINE_CONFIG!, JSON.stringify({ paths: { workspaceRoot: root, blogRoot: join(root, "blog") }, commands: { blogPublish: [process.execPath, "-e", script] } }));
}

function headers(descriptor: MonitorDescriptor) { return { Authorization: `Bearer ${descriptor.token}` }; }

test("CLI partial failures persist, exit 1, keep JSON stdout and retry only failed targets", async () => {
  const state = await seed();
  state.publish_targets = [{ route: "blog", account: "first" }, { route: "blog", account: "second" }];
  await writeState(state.state_path!, state);
  await blogCommand("const fs = require('fs'); console.log('child diagnostic'); if (fs.existsSync('attempt')) process.exit(7); fs.writeFileSync('attempt', 'ok');");
  const failed = await run(["publish", "--state", state.state_path!]);
  expect(failed.exitCode).toBe(1);
  const result = JSON.parse(failed.stdout);
  expect(result.publish_results.map((item: { status: string }) => item.status)).toEqual(["success", "failed"]);
  expect(result.errors[0].error).toContain("exit=7");
  expect(failed.stderr).toContain("child diagnostic");
  expect(failed.stderr).toContain("PUBLISH_TARGET_FAILED");
  const saved = JSON.parse(await readFile(state.state_path!, "utf8"));
  expect(saved.mode).toBe("active");
  expect(saved.phase.publish.status).toBe("pending");
  const store = new MonitorStore("test");
  await store.refresh();
  expect(store.snapshot().executions[0]?.outcome?.status).toBe("partial_failure");
  await blogCommand("require('fs').appendFileSync('retried', 'once');");
  expect((await run(["publish", "--state", state.state_path!])).exitCode).toBe(0);
  expect(await readFile(join(root, "blog", "retried"), "utf8")).toBe("once");
  expect((await run(["publish", "--state", state.state_path!])).exitCode).toBe(0);
  expect(await readFile(join(root, "blog", "retried"), "utf8")).toBe("once");
});

test("checkpoint failure exits through common cleanup; status and dry-run still exit 0", async () => {
  const state = await seed();
  state.content_review.status = "unchecked";
  await writeState(state.state_path!, state);
  const checkpoint = await run(["checkpoint", "--state", state.state_path!]);
  expect(checkpoint.exitCode).toBe(1);
  expect(JSON.parse(checkpoint.stdout).validation.valid).toBe(false);
  expect((await run(["status", "--state", state.state_path!])).exitCode).toBe(0);
  state.content_review.status = "passed";
  await writeState(state.state_path!, state);
  await blogCommand("process.exit(9)");
  expect((await run(["publish", "--state", state.state_path!, "--dry-run"])).exitCode).toBe(0);
  const store = new MonitorStore("test");
  await store.refresh();
  expect(store.snapshot().executions.find((execution) => execution.command === "checkpoint")?.status).toBe("exited");
});

test("20 parallel CLI calls preserve execution identities and separate identical run IDs across workspaces", async () => {
  const a = await seed(join(root, "a"));
  const b = await seed(join(root, "b"));
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) => run(["status", "--state", (index % 2 ? a : b).state_path!])));
  expect(results.every((result) => result.exitCode === 0)).toBe(true);
  const store = new MonitorStore("test");
  await store.refresh();
  expect(store.snapshot().executions).toHaveLength(20);
  expect(store.snapshot().tasks).toHaveLength(2);
  expect(store.snapshot({ workspace: a.workspace_root }).executions).toHaveLength(10);
  expect(new Set(store.snapshot().executions.map((execution) => execution.id)).size).toBe(20);
}, 15_000);

test("recording failure and optional callback failure cannot change command results", async () => {
  const file = join(root, "not-a-directory");
  await writeFile(file, "x");
  process.env.ZZHUB_PIPELINE_MONITOR_DIR = file;
  const state = await seed();
  expect((await run(["status", "--state", state.state_path!])).exitCode).toBe(0);
  expect(() => notifyProgress(() => { throw new Error("observer unavailable"); }, { stage: "test" })).not.toThrow();
  await expect(runWithCommandLog("render", [], async () => { throw new Error("original failure"); })).rejects.toThrow("original failure");
});

test("logs redact secrets, preserve UTF-8 and retain terminal errors after truncation", async () => {
  const message = "中文".repeat(2000);
  await runWithCommandLog("render", ["--pat", "private-pat"], async () => {
    reportLog("info", "Authorization: Bearer private-token ?access_token=another-secret");
    for (let index = 0; index < 1100; index++) reportLog("debug", message);
    reportProgress({ stage: "render.pages", current: 3, total: 3, unit: "pages" });
    return { status: "failed", errors: [{ code: "RENDER_FAILED", message: "最终错误" }] };
  });
  const store = new MonitorStore("test");
  await store.refresh();
  const execution = store.snapshot().executions[0]!;
  expect(execution.logs_truncated).toBe(true);
  expect(store.eventsAfter("test:0")).toBeNull();
  expect(execution.outcome?.errors?.[0]?.message).toBe("最终错误");
  const logs = await store.logs(execution.id, 0, 30);
  expect(JSON.stringify(logs)).not.toContain("private-token");
  expect(JSON.stringify(logs)).not.toContain("another-secret");
  expect(JSON.stringify(logs)).not.toContain("�");
  const raw = await readFile(join(process.env.ZZHUB_PIPELINE_MONITOR_DIR!, "events", `${execution.id}.jsonl`), "utf8");
  expect(raw).not.toContain("private-pat");
  expect(Buffer.byteLength(raw)).toBeLessThan(LOG_LIMIT + 300_000);
});

test("incomplete final records resume on the next read and state aliases keep one task", async () => {
  await runWithCommandLog("prepare-finalize", [], async () => {
    const state = await seed();
    await writeState(join(root, "temporary-state.json"), state);
  });
  const eventDir = join(process.env.ZZHUB_PIPELINE_MONITOR_DIR!, "events");
  const file = join(eventDir, (await readdir(eventDir))[0]!);
  const raw = await readFile(file, "utf8");
  const lines = raw.trimEnd().split("\n");
  const final = lines.pop()!;
  await writeFile(file, `${lines.join("\n")}\ninvalid-event\n${final.slice(0, -5)}`);
  const store = new MonitorStore("test");
  await store.refresh();
  expect(store.snapshot().tasks).toHaveLength(1);
  expect(store.snapshot().executions[0]?.outcome).toBeNull();
  expect(store.snapshot().executions[0]?.status).not.toBe("interrupted");
  await appendFile(file, `${final.slice(-5)}\n`);
  await store.refresh();
  expect(store.snapshot().executions[0]?.status).toBe("exited");
  expect(store.snapshot().tasks[0]?.state_path).toContain("posts/test/workflow-state.json");
});

test("HTTP/SSE support auth, shared subscriptions, cursor replay, resync and server restart", async () => {
  const server = await serveMonitor();
  expect(server).not.toBeNull();
  stop = server!.stop;
  const descriptor = server!.descriptor;
  expect((await fetch(`${descriptor.url}/v1/snapshot`)).status).toBe(401);
  expect((await fetch(`${descriptor.url}/v1/snapshot`, { headers: { ...headers(descriptor), Origin: "https://untrusted.example" } })).status).toBe(403);
  const initial = await (await fetch(`${descriptor.url}/v1/snapshot`, { headers: headers(descriptor) })).json() as MonitorSnapshot;
  const controllers = [new AbortController(), new AbortController()];
  const streams = await Promise.all(controllers.map((controller) => fetch(`${descriptor.url}/v1/events?after=${encodeURIComponent(initial.cursor)}`, { headers: headers(descriptor), signal: controller.signal })));
  const readers = streams.map((response) => response.body!.getReader());
  await Promise.all(readers.map((reader) => reader.read()));
  try {
    await runWithCommandLog("render", [], async () => { reportProgress({ stage: "render.pages", current: 1, total: 2, unit: "pages" }); });
    await fetch(`${descriptor.url}/v1/snapshot`, { headers: headers(descriptor) });
    const events = await Promise.all(readers.map(async (reader) => new TextDecoder().decode((await reader.read()).value)));
    expect(events.every((event) => event.includes("execution.updated"))).toBe(true);
    const replay = await fetch(`${descriptor.url}/v1/events?after=${encodeURIComponent(initial.cursor)}`, { headers: headers(descriptor) });
    const replayReader = replay.body!.getReader();
    expect(new TextDecoder().decode((await replayReader.read()).value)).toContain("execution.updated");
    await replayReader.cancel();
    const stale = await fetch(`${descriptor.url}/v1/events?after=old-instance:1`, { headers: headers(descriptor) });
    expect(await stale.text()).toContain("resync");
  } finally {
    controllers.forEach((controller) => controller.abort());
    await Promise.all(readers.map((reader) => reader.cancel().catch(() => {})));
  }
  stop();
  const restarted = await serveMonitor();
  stop = restarted!.stop;
  expect(restarted!.descriptor.instance_id).not.toBe(descriptor.instance_id);
  const restored = await (await fetch(`${restarted!.descriptor.url}/v1/snapshot`, { headers: headers(restarted!.descriptor) })).json() as MonitorSnapshot;
  expect(restored.executions).toHaveLength(1);
});

test("parallel monitor start calls reuse a single service and stop only that service", async () => {
  const results = await Promise.all(Array.from({ length: 4 }, () => run(["monitor", "start"])));
  const descriptors = results.map((result) => JSON.parse(result.stdout) as MonitorDescriptor);
  try {
    expect(new Set(descriptors.map((descriptor) => descriptor.instance_id)).size).toBe(1);
    expect(results.every((result) => result.exitCode === 0)).toBe(true);
    expect(await readdir(join(root, "logs")).catch(() => [])).toHaveLength(0);
  } finally { await run(["monitor", "stop"]); }
}, 20_000);

test("a killed execution becomes interrupted without a heartbeat timeout", async () => {
  const script = `import { runWithCommandLog } from ${JSON.stringify(resolve(import.meta.dir, "logger.ts"))}; await runWithCommandLog('render', [], async () => { await Bun.sleep(60000); });`;
  const child = Bun.spawn([process.execPath, "-e", script], { env: { ...process.env }, stdout: "ignore", stderr: "ignore" });
  try {
    for (let attempt = 0; attempt < 100; attempt++) {
      if ((await readdir(join(process.env.ZZHUB_PIPELINE_MONITOR_DIR!, "events")).catch(() => [])).length) break;
      await Bun.sleep(20);
    }
    child.kill("SIGKILL");
    await child.exited;
    const store = new MonitorStore("test");
    await store.refresh();
    expect(store.snapshot().executions[0]?.status).toBe("interrupted");
    expect(store.snapshot().executions[0]?.exit_code).toBeNull();
  } finally { if (child.exitCode === null) { child.kill(); await child.exited; } }
});
