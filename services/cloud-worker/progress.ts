import { join } from "node:path";
import { MonitorStore } from "../../src/monitor/store";
import { redact } from "../../src/monitor/runtime";
import { defaultJobWorkspace, type StoredCloudJob } from "./store";

/** 复用 CLI 事件投影；只返回该任务当前动作的进度，不转发路径或原始日志。 */
export async function cloudJobProgress(job: StoredCloudJob, root: string) {
  if (job.status !== "running") return null;
  // ponytail: 每个 job 至多 12 个业务动作，按需重建；事件量增长后缓存活跃投影。
  const monitor = new MonitorStore(job.id, join(defaultJobWorkspace(root, job.id), "monitor"));
  await monitor.refresh();
  const latest = monitor.snapshot().executions.find(item => !item.is_query);
  const command = job.step === "review-content" ? "review" : job.step === "starting" ? "init" : job.step;
  if (!latest?.progress || latest.command !== command || latest.started_at < (job.startedAt || job.createdAt)) return null;
  const value = latest.progress;
  return {
    progress: {
      stage: redact(value.stage),
      ...(value.message ? { message: redact(value.message) } : {}),
      ...(Number.isFinite(value.current) ? { current: value.current } : {}),
      ...(Number.isFinite(value.total) ? { total: value.total } : {}),
      ...(value.unit ? { unit: value.unit } : {}),
    },
    updatedAt: latest.last_event_at > job.updatedAt ? latest.last_event_at : job.updatedAt,
  };
}
