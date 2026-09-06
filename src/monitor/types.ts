import type { CommandOutcome } from "../command-outcome";

/** 只报告能测量的进度；未知总量不生成百分比。 */
export interface MonitorProgress {
  stage: string;
  message?: string;
  current?: number;
  total?: number;
  unit?: "pages" | "files" | "bytes" | "targets";
  route?: string;
  account?: string;
}

export interface MonitorEvent {
  version: 1;
  execution_id: string;
  seq: number;
  at: string;
  type: "started" | "task" | "progress" | "log" | "finished";
  data: Record<string, unknown>;
}

export interface MonitorExecution {
  id: string;
  command: string;
  pid: number;
  process_identity: string | null;
  is_query: boolean;
  started_at: string;
  ended_at: string | null;
  last_event_at: string;
  status: "running" | "exited" | "interrupted" | "unknown";
  outcome: CommandOutcome | null;
  exit_code: number | null;
  task_ids: string[];
  progress?: MonitorProgress;
  logs_truncated?: boolean;
}

export interface MonitorTask {
  id: string;
  workspace: string;
  run_id: string;
  state_path: string;
  title: string | null;
  mode?: string;
  phase?: string;
  next_action?: { action: string; reason: string; executor: string };
  publish_results?: Array<{ route: string; account: string; status: string; detail: string | null }>;
  active_execution_ids?: string[];
}

export interface MonitorUpdate {
  version: 1;
  cursor: string;
  type: "execution.updated" | "task.updated" | "log";
  execution_id?: string;
  task_id?: string;
  data: Record<string, unknown>;
}

export interface MonitorSnapshot {
  version: 1;
  instance_id: string;
  cursor: string;
  tasks: MonitorTask[];
  executions: MonitorExecution[];
}

/** 描述文件只能由当前用户读取，令牌不得发送到渲染进程。 */
export interface MonitorDescriptor {
  version: 1;
  instance_id: string;
  pid: number;
  url: string;
  token: string;
}
