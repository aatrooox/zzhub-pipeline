import type { PublishResult } from "./state";

/** 同一次执行共用的业务结果，独立于工作流是否完成。 */
export interface CommandOutcome {
  status: "success" | "skipped" | "waiting" | "partial_failure" | "failed";
  errors?: CommandError[];
}

/** 可供终端和监控展示的错误，不推测可重试性。 */
export interface CommandError {
  code: string;
  message: string;
  stage?: string;
  route?: string;
  account?: string;
  cause?: string;
}

/** 保留已有错误码和堆栈，未知异常使用统一兜底。 */
export function commandError(error: unknown, code = "COMMAND_FAILED"): CommandError {
  return {
    code: error instanceof Error && "code" in error && typeof error.code === "string" ? error.code : code,
    message: error instanceof Error ? error.message : String(error),
    ...(error instanceof Error && error.stack ? { cause: error.stack } : {}),
  };
}

/** 出口只使用 0/1；等待输入和幂等跳过都是正常完成命令。 */
export function outcomeExitCode(outcome: CommandOutcome): number {
  return outcome.status === "failed" || outcome.status === "partial_failure" ? 1 : 0;
}

/** 仅汇总本次请求目标，避免历史失败污染新的追加发布。 */
export function publishOutcome(results: PublishResult[], skipped = false): CommandOutcome {
  const failures = results.filter((result) => result.status === "failed");
  if (failures.length) {
    return {
      status: results.some((result) => result.status === "success") ? "partial_failure" : "failed",
      errors: failures.map((result) => ({
        code: "PUBLISH_TARGET_FAILED",
        message: result.detail || "发布失败，provider 未提供原因",
        stage: "publish",
        route: result.route,
        account: result.account,
      })),
    };
  }
  if (results.some((result) => result.status === "handoff")) return { status: "waiting" };
  return { status: skipped || !results.length || results.every((result) => result.status === "skipped") ? "skipped" : "success" };
}
