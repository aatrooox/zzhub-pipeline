import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { commandError, outcomeExitCode, type CommandOutcome } from "../command-outcome";
import type { WorkflowState } from "../state";
import { canonicalPath, LOG_LIMIT, monitorDir, processIdentity, redact, taskId } from "./runtime";
import type { MonitorEvent, MonitorProgress } from "./types";

interface Recording {
  id: string;
  file: string;
  seq: number;
  disabled: boolean;
  logBytes: number;
  truncated: boolean;
  lastProgressAt: number;
  progressKey: string;
  progressRoute?: string;
  progressAccount?: string;
  ended?: boolean;
  tasks: Set<string>;
}

/** 调用上下文自动穿过内置异步流程，不要求业务函数传监控对象。 */
const recording = new AsyncLocalStorage<Recording>();
const queryCommands = new Set(["status", "tasks", "find-run", "checkpoint", "doctor", "config", "wx-drafts", "hermes-metrics"]);

function emit(type: MonitorEvent["type"], data: Record<string, unknown>): void {
  const current = recording.getStore();
  if (!current || current.disabled || current.ended) return;
  try {
    const event: MonitorEvent = { version: 1, execution_id: current.id, seq: ++current.seq, at: new Date().toISOString(), type, data };
    appendFileSync(current.file, `${JSON.stringify(event)}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    // 只停用本次记录，不重试、不递归写日志，也不影响业务结果。
    current.disabled = true;
  }
}

export function reportLog(level: string, message: string): void {
  const current = recording.getStore();
  if (!current || current.disabled || current.truncated) return;
  try {
    const safe = redact(message);
    current.logBytes += Buffer.byteLength(safe, "utf8");
    if (current.logBytes > LOG_LIMIT) {
      current.truncated = true;
      emit("log", { level: "warn", message: "普通日志达到 10MB 上限，后续日志已截断；进度、错误和终态仍记录。", truncated: true });
      return;
    }
    emit("log", { level, message: safe });
  } catch { /* 日志不得影响调用。 */ }
}

export function reportProgress(progress: MonitorProgress): void {
  const current = recording.getStore();
  if (!current || current.disabled) return;
  try {
    current.progressRoute = progress.route ?? current.progressRoute;
    current.progressAccount = progress.account ?? current.progressAccount;
    const key = `${progress.stage}:${current.progressRoute || ""}:${current.progressAccount || ""}`;
    const complete = progress.total !== undefined && progress.current === progress.total;
    if (key === current.progressKey && !complete && Date.now() - current.lastProgressAt < 200) return;
    current.progressKey = key;
    current.lastProgressAt = Date.now();
    emit("progress", {
      stage: redact(progress.stage),
      ...(progress.message ? { message: redact(progress.message) } : {}),
      ...(Number.isFinite(progress.current) && progress.current! >= 0 ? { current: progress.current } : {}),
      ...(Number.isFinite(progress.total) && progress.total! >= 0 ? { total: progress.total } : {}),
      ...(progress.unit ? { unit: progress.unit } : {}),
      ...(current.progressRoute ? { route: redact(current.progressRoute) } : {}),
      ...(current.progressAccount ? { account: redact(current.progressAccount) } : {}),
    });
  } catch { /* 进度采集不得改变业务路径。 */ }
}

/** 插件进度回调失败不能让已经执行的渲染失败。 */
export function notifyProgress(callback: ((progress: MonitorProgress) => void) | undefined, progress: MonitorProgress): void {
  try { (callback || reportProgress)(progress); } catch { /* 可选观测回调失败时继续执行。 */ }
}

/** 只记录身份和状态引用，正文和业务配置不进入事件文件。 */
export function observeState(state: WorkflowState, path: string): void {
  const current = recording.getStore();
  if (!current || current.disabled || !state.run_id || !state.workspace_root) return;
  try {
    const workspace = canonicalPath(state.workspace_root);
    const id = taskId(workspace, state.run_id);
    const key = `${id}:${path}:${state.updated_at}`;
    if (current.tasks.has(key)) return;
    current.tasks.add(key);
    emit("task", { id, workspace, run_id: state.run_id, state_path: canonicalPath(path), title: redact(state.metadata.title) || null });
  } catch { /* 状态落盘不依赖观测成功。 */ }
}

function safeOutcome(outcome: CommandOutcome): CommandOutcome {
  return {
    status: outcome.status,
    errors: outcome.errors?.map((error) => ({
      code: redact(error.code), message: redact(error.message),
      ...(error.stage ? { stage: redact(error.stage) } : {}),
      ...(error.route ? { route: redact(error.route) } : {}),
      ...(error.account ? { account: redact(error.account) } : {}),
      ...(error.cause ? { cause: redact(error.cause) } : {}),
    })),
  };
}

/** 服务未运行时也独立记录；强制退出仅尽力补充终态。 */
export async function observeCommand(command: string, handler: () => Promise<CommandOutcome>): Promise<CommandOutcome> {
  if (process.env.ZZHUB_PIPELINE_MONITOR === "0") return handler();
  let context: Recording;
  try {
    const dir = join(monitorDir(), "events");
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const id = crypto.randomUUID();
    context = { id, file: join(dir, `${id}.jsonl`), seq: 0, disabled: false, logBytes: 0, truncated: false, lastProgressAt: 0, progressKey: "", tasks: new Set() };
  } catch { return handler(); }

  return recording.run(context, async () => {
    emit("started", { command, pid: process.pid, process_identity: processIdentity(process.pid), is_query: queryCommands.has(command) });
    const finish = (outcome: CommandOutcome, exitCode = outcomeExitCode(outcome)) => {
      try { emit("finished", { outcome: safeOutcome(outcome), exit_code: exitCode }); } catch { /* 尽力记录终态。 */ }
      context.ended = true;
    };
    const onExit = (code: number) => recording.run(context, () => finish(
      code === 0 ? { status: "success" } : { status: "failed", errors: [{ code: "PROCESS_EXIT", message: `进程退出：${code}` }] }, code,
    ));
    process.once("exit", onExit);
    try {
      const outcome = await handler();
      finish(outcome);
      return outcome;
    } catch (error) {
      finish({ status: "failed", errors: [commandError(error)] });
      throw error;
    } finally {
      process.removeListener("exit", onExit);
    }
  });
}
