import { open, readdir, stat, unlink } from "node:fs/promises";
import { join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import { getTaskByStatePath } from "../task-manager";
import { canonicalPath, monitorDir, processStatus, redact, RETENTION_MS, STORAGE_LIMIT } from "./runtime";
import type { MonitorEvent, MonitorExecution, MonitorProgress, MonitorSnapshot, MonitorTask, MonitorUpdate } from "./types";
import type { CommandOutcome } from "../command-outcome";

const ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f-]{27}$/;
const OUTCOMES = new Set(["success", "skipped", "waiting", "partial_failure", "failed"]);
export interface MonitorFilter { workspace?: string; task_id?: string; execution_id?: string }
interface FileCursor { offset: number; tail: string; seq: number; decoder?: StringDecoder }

/** 内存投影可重建；事件文件是执行历史，工作流文件是业务状态真相源。 */
export class MonitorStore {
  readonly executions = new Map<string, MonitorExecution>();
  readonly tasks = new Map<string, MonitorTask>();
  readonly issues: string[] = [];
  readonly listeners = new Set<(event: MonitorUpdate) => void>();
  private files = new Map<string, FileCursor>();
  private dirtyTasks = new Set<string>();
  private sequence = 0;
  private replay: MonitorUpdate[] = [];
  private replayBytes = 0;
  private pending: Promise<void> | null = null;
  private lastProbe = 0;
  private lastPrune = 0;

  constructor(readonly instanceId: string, readonly root = monitorDir()) {}

  get cursor(): string { return `${this.instanceId}:${this.sequence}`; }

  private issue(error: unknown): void {
    this.issues.push(redact(error instanceof Error ? error.message : String(error)));
    if (this.issues.length > 20) this.issues.shift();
  }

  private broadcast(type: MonitorUpdate["type"], data: Record<string, unknown>, executionId?: string, taskId?: string): void {
    this.sequence++;
    const update: MonitorUpdate = { version: 1, cursor: this.cursor, type, data: structuredClone(data), execution_id: executionId, task_id: taskId };
    this.replay.push(update);
    this.replayBytes += Buffer.byteLength(JSON.stringify(update));
    while (this.replay.length > 1000 || this.replayBytes > 2 * 1024 * 1024) {
      this.replayBytes -= Buffer.byteLength(JSON.stringify(this.replay.shift()));
    }
    for (const listener of this.listeners) {
      try { listener(update); } catch { this.listeners.delete(listener); }
    }
  }

  matches(execution: MonitorExecution, filter: MonitorFilter): boolean {
    return (!filter.execution_id || filter.execution_id === execution.id)
      && (!filter.task_id || execution.task_ids.includes(filter.task_id))
      && (!filter.workspace || execution.task_ids.some((id) => this.tasks.get(id)?.workspace === canonicalPath(filter.workspace!)));
  }

  matchesUpdate(update: MonitorUpdate, filter: MonitorFilter): boolean {
    if (update.execution_id) {
      const execution = this.executions.get(update.execution_id);
      return !!execution && this.matches(execution, filter);
    }
    const task = update.task_id ? this.tasks.get(update.task_id) : null;
    return !!task && (!filter.task_id || task.id === filter.task_id)
      && (!filter.workspace || task.workspace === canonicalPath(filter.workspace))
      && (!filter.execution_id || this.executions.get(filter.execution_id)?.task_ids.includes(task.id) === true);
  }

  snapshot(filter: MonitorFilter = {}): MonitorSnapshot {
    const executions = [...this.executions.values()].filter((item) => this.matches(item, filter))
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
    const tasks = [...this.tasks.values()].filter((task) => (!filter.workspace || task.workspace === canonicalPath(filter.workspace))
      && (!filter.task_id || task.id === filter.task_id)
      && (!filter.execution_id || this.executions.get(filter.execution_id)?.task_ids.includes(task.id) === true))
      .map((task) => ({ ...task, active_execution_ids: executions.filter((execution) => !execution.is_query
        && (execution.status === "running" || execution.status === "unknown") && execution.task_ids.includes(task.id)).map((execution) => execution.id) }));
    return structuredClone({ version: 1, instance_id: this.instanceId, cursor: this.cursor, tasks,
      executions: executions.filter((execution, index) => index < 100 || execution.status === "running" || execution.status === "unknown") });
  }

  /** 返回 null 表示游标已失效，客户端必须重新读取快照。 */
  eventsAfter(cursor: string): MonitorUpdate[] | null {
    if (cursor === this.cursor) return [];
    const prefix = `${this.instanceId}:`;
    if (!cursor.startsWith(prefix) || !/^\d+$/.test(cursor.slice(prefix.length))) return null;
    const sequence = Number(cursor.slice(prefix.length));
    const oldest = this.sequence - this.replay.length;
    return sequence < oldest || sequence > this.sequence ? null : this.replay.slice(sequence - oldest);
  }

  refresh(): Promise<void> {
    if (!this.pending) this.pending = this.scan().catch((error) => this.issue(error)).finally(() => { this.pending = null; });
    return this.pending;
  }

  private apply(event: MonitorEvent): void {
    const data = event.data;
    if (event.type === "started") {
      if (typeof data.command !== "string" || !Number.isSafeInteger(data.pid) || Number(data.pid) <= 0) return;
      this.executions.set(event.execution_id, {
        id: event.execution_id, command: data.command, pid: Number(data.pid),
        process_identity: typeof data.process_identity === "string" ? data.process_identity : null,
        is_query: data.is_query === true, started_at: event.at, ended_at: null, last_event_at: event.at,
        status: "running", outcome: null, exit_code: null, task_ids: [],
      });
    }
    const execution = this.executions.get(event.execution_id);
    if (!execution) return;
    execution.last_event_at = event.at;
    if (event.type === "task") {
      if (![data.id, data.workspace, data.run_id, data.state_path].every((value) => typeof value === "string" && value.length > 0)) return;
      const task = data as unknown as MonitorTask;
      this.tasks.set(task.id, { ...this.tasks.get(task.id), ...task });
      if (!execution.task_ids.includes(task.id)) execution.task_ids.push(task.id);
      this.dirtyTasks.add(task.id);
    } else if (event.type === "progress") {
      execution.progress = data as unknown as MonitorProgress;
    } else if (event.type === "finished") {
      const outcome = data.outcome as CommandOutcome | undefined;
      if (!outcome || !OUTCOMES.has(outcome.status)) return;
      execution.outcome = outcome;
      execution.exit_code = typeof data.exit_code === "number" ? data.exit_code : null;
      execution.status = "exited";
      execution.ended_at = event.at;
      execution.task_ids.forEach((id) => this.dirtyTasks.add(id));
    } else if (event.type === "log") {
      if (data.truncated) execution.logs_truncated = true;
      this.broadcast("log", { ...data, seq: event.seq, at: event.at }, execution.id);
      if (!data.truncated) return;
    }
    this.broadcast("execution.updated", execution as unknown as Record<string, unknown>, execution.id);
  }

  private async readEvents(id: string, cursor: FileCursor, consume: (event: MonitorEvent) => boolean | void): Promise<void> {
    const handle = await open(join(this.root, "events", `${id}.jsonl`), "r");
    try {
      const size = (await handle.stat()).size;
      if (size < cursor.offset) throw new Error(`监控事件文件被截短：${id}`);
      // 分块扫描，不把所有任务的日志装入内存。
      const buffer = Buffer.alloc(64 * 1024);
      cursor.decoder ??= new StringDecoder("utf8");
      while (cursor.offset < size) {
        const { bytesRead } = await handle.read(buffer, 0, Math.min(buffer.length, size - cursor.offset), cursor.offset);
        if (!bytesRead) break;
        cursor.offset += bytesRead;
        const text = cursor.tail + cursor.decoder.write(buffer.subarray(0, bytesRead));
        const lines = text.split("\n");
        cursor.tail = lines.pop() || "";
        for (const line of lines) {
          try {
            const event = JSON.parse(line) as MonitorEvent;
            if (event.version !== 1 || event.execution_id !== id || !Number.isSafeInteger(event.seq)
              || event.seq <= cursor.seq || !event.data || typeof event.data !== "object" || typeof event.at !== "string") continue;
            cursor.seq = event.seq;
            if (consume(event) === false) return;
          } catch { this.issue(`忽略损坏的监控事件：${id}`); }
        }
      }
    } finally { await handle.close(); }
  }

  private async scan(): Promise<void> {
    const names = await readdir(join(this.root, "events")).catch(() => [] as string[]);
    for (const name of names) {
      const id = name.replace(/\.jsonl$/, "");
      if (!name.endsWith(".jsonl") || !ID_PATTERN.test(id)) continue;
      // 已完整读到终态的日志不可再追加，历史越多也不会反复打开所有文件。
      if (this.executions.get(id)?.status === "exited") continue;
      const cursor = this.files.get(id) || { offset: 0, tail: "", seq: 0 };
      this.files.set(id, cursor);
      await this.readEvents(id, cursor, (event) => this.apply(event)).catch((error) => this.issue(error));
    }
    if (Date.now() - this.lastProbe > 2000) {
      this.lastProbe = Date.now();
      for (const execution of this.executions.values()) {
        if (execution.status !== "running" && execution.status !== "unknown") continue;
        const status = processStatus(execution.pid, execution.process_identity);
        if (status === execution.status) continue;
        execution.status = status;
        if (status === "interrupted") {
          execution.ended_at = new Date().toISOString();
          execution.task_ids.forEach((id) => this.dirtyTasks.add(id));
        }
        this.broadcast("execution.updated", execution as unknown as Record<string, unknown>, execution.id);
      }
    }
    for (const id of this.dirtyTasks) {
      const task = this.tasks.get(id)!;
      try {
        const report = await getTaskByStatePath(task.state_path);
        if (report.summary.run_id !== task.run_id) throw new Error(`监控状态文件身份不匹配：${id}`);
        const updated: MonitorTask = { ...task, state_path: report.summary.state_path,
          title: redact(report.summary.metadata.title || "") || null, mode: report.summary.mode, phase: report.summary.phase.current,
          next_action: { action: report.next_action.action, reason: redact(report.next_action.reason), executor: report.next_action.executor },
          publish_results: report.summary.publish.results.map((result) => ({ route: result.route, account: result.account,
            status: result.status, detail: result.detail ? redact(result.detail) : null })),
        };
        this.tasks.set(id, updated);
        this.broadcast("task.updated", updated as unknown as Record<string, unknown>, undefined, id);
      } catch (error) { this.issue(error); }
    }
    this.dirtyTasks.clear();
    if (Date.now() - this.lastPrune > 60_000) { this.lastPrune = Date.now(); await this.prune(); }
  }

  async logs(id: string, afterSeq: number, limit: number): Promise<{ logs: MonitorEvent[]; next_seq: number; truncated: boolean }> {
    if (!ID_PATTERN.test(id) || !this.executions.has(id)) throw new Error("execution not found");
    const logs: MonitorEvent[] = [];
    const cursor = { offset: 0, tail: "", seq: 0 };
    await this.readEvents(id, cursor, (event) => {
      if (event.type === "log" && event.seq > afterSeq) logs.push(event);
      return logs.length < limit;
    });
    return { logs, next_seq: logs.at(-1)?.seq ?? Math.max(afterSeq, cursor.seq), truncated: this.executions.get(id)?.logs_truncated === true };
  }

  private async prune(): Promise<void> {
    const files = await Promise.all([...this.executions.values()].map(async (execution) => {
      const path = join(this.root, "events", `${execution.id}.jsonl`);
      const info = await stat(path).catch(() => null);
      return { execution, path, size: info?.size ?? 0 };
    }));
    let total = files.reduce((sum, file) => sum + file.size, 0);
    for (const file of files.sort((a, b) => a.execution.started_at.localeCompare(b.execution.started_at))) {
      if (file.execution.status !== "exited" && file.execution.status !== "interrupted") continue;
      if (Date.now() - Date.parse(file.execution.ended_at || file.execution.started_at) < RETENTION_MS && total <= STORAGE_LIMIT) continue;
      try { await unlink(file.path); } catch (error) { this.issue(error); continue; }
      total -= file.size;
      this.executions.delete(file.execution.id);
      this.files.delete(file.execution.id);
    }
    // ponytail: 历史元数据随文件重建；本机几十个并行任务先用内存投影。
    const referenced = new Set([...this.executions.values()].flatMap((execution) => execution.task_ids));
    for (const id of this.tasks.keys()) if (!referenced.has(id)) this.tasks.delete(id);
  }
}
