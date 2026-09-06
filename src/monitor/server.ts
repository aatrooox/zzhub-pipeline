import { closeSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { timingSafeEqual, randomBytes } from "node:crypto";
import { MonitorStore, type MonitorFilter } from "./store";
import { monitorDir, processIdentity, processStatus } from "./runtime";
import { monitorHealth, readMonitorDescriptor } from "./client";
import type { MonitorDescriptor, MonitorUpdate } from "./types";

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** 原子锁只属于监控进程，与任何工作流锁互不关联。 */
async function claimServer(root: string, instanceId: string): Promise<(() => void) | null> {
  const lockPath = join(root, "server.lock");
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const fd = openSync(lockPath, "wx", 0o600);
      try { writeFileSync(fd, JSON.stringify({ pid: process.pid, identity: processIdentity(process.pid), instance_id: instanceId })); }
      finally { closeSync(fd); }
      return () => {
        try {
          if (JSON.parse(readFileSync(lockPath, "utf8")).instance_id === instanceId) unlinkSync(lockPath);
        } catch { /* 已被本实例清理。 */ }
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      const descriptor = readMonitorDescriptor(root);
      if (descriptor && await monitorHealth(descriptor)) return null;
      try {
        const lock = JSON.parse(readFileSync(lockPath, "utf8")) as { pid: number; identity: string | null };
        if (Number.isSafeInteger(lock.pid) && lock.pid > 0 && processStatus(lock.pid, lock.identity) === "interrupted") {
          unlinkSync(lockPath);
          continue;
        }
      } catch { /* 写锁过程中短暂空文件不能被抢占。 */ }
      await new Promise((done) => setTimeout(done, 100));
    }
  }
  throw new Error("监控启动锁仍被占用；请检查已有 monitor serve 进程。");
}

/** 一个本机 HTTP 服务承载快照、分页日志和多任务 SSE。 */
export async function serveMonitor(): Promise<{ descriptor: MonitorDescriptor; stop: () => void } | null> {
  const root = monitorDir();
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const instanceId = crypto.randomUUID();
  const release = await claimServer(root, instanceId);
  if (!release) return null;
  const token = randomBytes(32).toString("hex");
  const store = new MonitorStore(instanceId, root);
  let lastAccess = Date.now();
  let ready = false;
  let stopped = false;
  const connections = new Set<() => void>();
  let stop = () => {};
  let server: ReturnType<typeof Bun.serve>;
  try {
    server = Bun.serve({
      hostname: "127.0.0.1", port: 0,
      async fetch(request, runtime) {
        const authorization = request.headers.get("authorization") || "";
        const expected = `Bearer ${token}`;
        if (Buffer.byteLength(authorization) !== Buffer.byteLength(expected) || !timingSafeEqual(Buffer.from(authorization), Buffer.from(expected))) return json({ error: "unauthorized" }, 401);
        const url = new URL(request.url);
        // 首版只接收同机原生客户端，不向任意网页开放本地凭据与日志。
        if (request.headers.has("origin") && request.headers.get("origin") !== url.origin) return json({ error: "origin not allowed" }, 403);
        lastAccess = Date.now();
        if (url.pathname === "/v1/health" && request.method === "GET") return json({ service: "zzhub-pipeline-monitor", version: 1, instance_id: instanceId, ready, issues: [...store.issues] });
        if (url.pathname === "/v1/stop" && request.method === "POST") { setTimeout(() => stop(), 25); return json({ stopped: true }); }
        if (request.method !== "GET") return json({ error: "method not allowed" }, 405);
        if (!ready) return json({ error: "monitor starting" }, 503);
        const filter: MonitorFilter = {
          workspace: url.searchParams.get("workspace") || undefined,
          task_id: url.searchParams.get("task_id") || undefined,
          execution_id: url.searchParams.get("execution_id") || undefined,
        };
        try {
          if (url.pathname === "/v1/snapshot") { await store.refresh(); return json(store.snapshot(filter)); }
          const match = url.pathname.match(/^\/v1\/executions\/([0-9a-f-]+)(\/logs)?$/);
          if (match) {
            const execution = store.executions.get(match[1]!);
            if (!execution) return json({ error: "execution not found" }, 404);
            if (!match[2]) return json(execution);
            const after = Number(url.searchParams.get("after_seq") || "0");
            const limit = Number(url.searchParams.get("limit") || "200");
            if (!Number.isSafeInteger(after) || after < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 500) return json({ error: "invalid log cursor or limit" }, 400);
            return json(await store.logs(execution.id, after, limit));
          }
          if (url.pathname !== "/v1/events") return json({ error: "not found" }, 404);
          runtime.timeout(request, 0);
          const cursor = request.headers.get("last-event-id") || url.searchParams.get("after") || "";
          const events = cursor ? store.eventsAfter(cursor) : null;
          let cleanup = () => {};
          const encoder = new TextEncoder();
          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              let closed = false;
              let heartbeat: ReturnType<typeof setInterval> | undefined;
              const close = () => {
                if (closed) return;
                closed = true;
                clearInterval(heartbeat);
                store.listeners.delete(send);
                connections.delete(close);
                request.signal.removeEventListener("abort", close);
                try { controller.close(); } catch { /* 客户端可能已取消。 */ }
              };
              const enqueue = (text: string) => {
                if (closed) return;
                if ((controller.desiredSize ?? 0) < 0) { close(); return; }
                try { controller.enqueue(encoder.encode(text)); } catch { close(); }
              };
              const send = (event: MonitorUpdate) => {
                if (store.matchesUpdate(event, filter)) enqueue(`id: ${event.cursor}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
              };
              cleanup = close;
              if (events === null) {
                enqueue(`event: resync\ndata: ${JSON.stringify({ reason: "snapshot_required", instance_id: instanceId })}\n\n`);
                close();
                return;
              }
              // 注册与重放之间不 await，避免丢失快照之后的事件。
              connections.add(close);
              store.listeners.add(send);
              enqueue(": connected\n\n");
              for (const event of events) send(event);
              if (closed) return;
              heartbeat = setInterval(() => enqueue(": keepalive\n\n"), 15_000);
              request.signal.addEventListener("abort", close, { once: true });
              if (request.signal.aborted) close();
            },
            cancel() { cleanup(); },
          }, new ByteLengthQueuingStrategy({ highWaterMark: 256 * 1024 }));
          return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" } });
        } catch { return json({ error: "monitor data unavailable" }, 500); }
      },
    });
  } catch (error) { release(); throw error; }

  const descriptor: MonitorDescriptor = { version: 1, instance_id: instanceId, pid: process.pid, url: `http://127.0.0.1:${server.port}`, token };
  const timer = setInterval(() => {
    void store.refresh();
    if (!connections.size && Date.now() - lastAccess > 5 * 60_000) stop();
  }, 500);
  const onSignal = () => stop();
  stop = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    connections.forEach((close) => close());
    server.stop(true);
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    process.removeListener("exit", stop);
    try { if (readMonitorDescriptor(root)?.instance_id === instanceId) unlinkSync(join(root, "server.json")); } catch { /* 描述文件已清理。 */ }
    release();
  };
  try {
    const temporary = join(root, `server.${instanceId}.tmp`);
    writeFileSync(temporary, JSON.stringify(descriptor), { mode: 0o600 });
    renameSync(temporary, join(root, "server.json"));
    process.once("SIGINT", onSignal);
    process.once("SIGTERM", onSignal);
    process.once("exit", stop);
    await store.refresh();
    ready = true;
    return { descriptor, stop };
  } catch (error) { stop(); throw error; }
}
