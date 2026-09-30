import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { CloudJobInput, JobStore, StoredCloudJob } from "./store";
import { defaultJobWorkspace } from "./store";
import { redact } from "../../src/monitor/runtime";
import type { TaskStatusReport } from "../../src/task-manager";

interface PipelineCommandResult {
  result: any;
  stderr: string;
}

type PipelineTaskStatus = Pick<TaskStatusReport, "summary" | "next_action">;

function pipelineRoot(): string {
  return resolve(process.env.PIPELINE_ROOT?.trim() || resolve(import.meta.dir, "../.."));
}

function pipelineEntry(): string {
  return resolve(pipelineRoot(), "src/cli.ts");
}

function pipelineEnv(workspace: string): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  env.NO_COLOR = "1";
  env.FORCE_COLOR = "0";
  env.ZZHUB_PIPELINE_MONITOR = "0";
  env.ZZHUB_WECHAT_PREVIEW_ON_PUBLISH = "0";
  env.ZZHUB_PIPELINE_WORKSPACE_ROOT = workspace;
  env.ZZHUB_PIPELINE_ZOTEPAD_EXPORT_HTML = join(workspace, "exports", "post.html");
  env.ZZHUB_PIPELINE_LOG_DIR = join(workspace, "logs");
  if (process.env.PIPELINE_CONFIG_FILE?.trim())
    env.ZZHUB_PIPELINE_CONFIG = process.env.PIPELINE_CONFIG_FILE.trim();
  return env;
}

async function runPipelineCommand(
  workspace: string,
  command: string,
  args: string[],
): Promise<PipelineCommandResult> {
  const child = Bun.spawn([
    process.env.BUN_BIN?.trim() || process.execPath,
    pipelineEntry(),
    command,
    ...args,
  ], {
    cwd: pipelineRoot(),
    env: pipelineEnv(workspace),
    stdout: "pipe",
    stderr: "pipe",
  });
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    // stdout 可能含正文或完整状态，只转发脱敏后的错误摘要。
    throw new Error(`${command} failed (exit ${exitCode}): ${redact(stderr.trim()).slice(-2000)}`);
  }
  if (!stdout.trim())
    return { result: null, stderr };
  try {
    return { result: JSON.parse(stdout), stderr };
  } catch (error) {
    throw new Error(`${command} returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function stringParam(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function isDone(status: PipelineTaskStatus): boolean {
  return status.summary?.mode === "done" || status.summary?.phase?.current === "done";
}

function publishResults(status: PipelineTaskStatus): Array<Record<string, unknown>> {
  return status.summary?.publish?.results || [];
}

async function status(workspace: string, statePath: string): Promise<PipelineTaskStatus> {
  const output = await runPipelineCommand(workspace, "status", ["--state", statePath]);
  return output.result as PipelineTaskStatus;
}

async function runAction(
  workspace: string,
  statePath: string,
  action: string,
  params: Record<string, unknown> = {},
): Promise<void> {
  const args = ["--state", statePath];
  if (action === "review") {
    args.push("--status", "passed");
  } else if (action === "prepare") {
    const title = stringParam(params.title);
    if (title) args.push("--title", title);
  } else if (action === "prepare-finalize") {
    const body = stringParam(params.formatted_body_path);
    if (body) args.push("--body", body);
  }
  await runPipelineCommand(workspace, action, args);
}

/** 按 Pipeline 自己的 next_action 推进，避免在 worker 复制状态机规则。 */
export async function executeCloudJob(job: StoredCloudJob, input: CloudJobInput, store: JobStore, root: string): Promise<void> {
  const workspace = defaultJobWorkspace(root, job.id);
  await mkdir(workspace, { recursive: true });
  const bodyPath = join(workspace, "source.md");
  await writeFile(bodyPath, input.body, "utf8");

  const init = await runPipelineCommand(workspace, "init", [
    "--workspace", workspace,
    "--task-kind", "publish",
    "--content-form", input.contentForm,
    "--targets", `wechat@${input.account}`,
    "--content-origin", "user",
    "--intent-text", input.intentText?.trim() || input.title,
    "--account", input.account,
    "--requires-publish",
    ...(input.existingDraftMediaId ? ["--existing-draft-media-id", input.existingDraftMediaId] : []),
  ]);
  const initResult = init.result as { state_path?: string; run_id?: string };
  let statePath = stringParam(initResult.state_path);
  if (!statePath)
    throw new Error("Pipeline init did not return state_path");
  job.runId = stringParam(initResult.run_id);
  job.statePath = statePath;
  await store.set(job);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = await status(workspace, statePath);
    statePath = current.summary.state_path;
    job.statePath = statePath;
    if (isDone(current)) {
      const result = current.summary.publish.results.find(item => item.account === input.account);
      if (result?.status !== "success" || !result.external_id)
        throw new Error("Pipeline completed without a confirmed WeChat draft media_id");
      job.step = "done";
      job.result = {
        runId: job.runId,
        phase: current.summary?.phase?.current || "done",
        publishResults: publishResults(current),
      };
      return;
    }

    const action = stringParam(current.next_action?.action);
    if (!action)
      throw new Error("Pipeline returned no next_action before completion");

    job.step = action;
    await store.set(job);

    if (action === "attach-body") {
      await runPipelineCommand(workspace, "attach-body", ["--state", statePath, "--body", bodyPath]);
      continue;
    }
    if (action === "review-content") {
      await runAction(workspace, statePath, "review", { status: "passed" });
      continue;
    }
    if (action === "prepare" || action === "prepare-finalize" || action === "render" || action === "publish") {
      try {
        await runAction(workspace, statePath, action, {
          title: input.title,
          formatted_body_path: current.next_action?.params?.formatted_body_path,
        });
      } catch (error) {
        // 发布失败时仍保留原运行的业务结果；不得创建新 run 自动重试。
        const latest = await status(workspace, statePath).catch(() => null);
        if (latest) job.result = { runId: job.runId, publishResults: publishResults(latest) };
        throw error;
      }
      continue;
    }
    throw new Error(`Pipeline needs unsupported action: ${action}`);
  }

  throw new Error("Pipeline did not finish within 12 actions");
}
