import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AccountStore, CloudJobInput, JobStore, StoredCloudJob, PipelineWorkerAccount } from "./store";
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

function pipelineEnv(workspace: string, account?: PipelineWorkerAccount | null): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  env.NO_COLOR = "1";
  env.FORCE_COLOR = "0";
  // 使用现有 CLI 记录器，每个任务独立存放事件，避免账号间串读进度。
  env.ZZHUB_PIPELINE_MONITOR = "1";
  env.ZZHUB_PIPELINE_MONITOR_DIR = join(workspace, "monitor");
  env.ZZHUB_WECHAT_PREVIEW_ON_PUBLISH = "0";
  env.ZZHUB_PIPELINE_WORKSPACE_ROOT = workspace;
  env.ZZHUB_PIPELINE_ZOTEPAD_EXPORT_HTML = join(workspace, "exports", "post.html");
  env.ZZHUB_PIPELINE_LOG_DIR = join(workspace, "logs");
  if (process.env.PIPELINE_CONFIG_FILE?.trim())
    env.ZZHUB_PIPELINE_CONFIG = process.env.PIPELINE_CONFIG_FILE.trim();
  if (account) {
    env.WX_APPID = account.appId;
    env.WX_APPSECRET = account.appSecret;
    env.ZZCLUB_PAT = account.pat;
  }
  return env;
}

async function runPipelineCommand(
  workspace: string,
  command: string,
  args: string[],
  account?: PipelineWorkerAccount | null,
): Promise<PipelineCommandResult> {
  const child = Bun.spawn([
    process.env.BUN_BIN?.trim() || process.execPath,
    pipelineEntry(),
    command,
    ...args,
  ], {
    cwd: pipelineRoot(),
    env: pipelineEnv(workspace, account),
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

async function status(workspace: string, statePath: string, account: PipelineWorkerAccount): Promise<PipelineTaskStatus> {
  const output = await runPipelineCommand(workspace, "status", ["--state", statePath], account);
  return output.result as PipelineTaskStatus;
}

async function runAction(
  workspace: string,
  statePath: string,
  action: string,
  params: Record<string, unknown> = {},
  account: PipelineWorkerAccount,
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
  await runPipelineCommand(workspace, action, args, account);
}

/** 按 Pipeline 自己的 next_action 推进，避免在 worker 复制状态机规则。 */
export async function executeCloudJob(job: StoredCloudJob, input: CloudJobInput, store: JobStore, accounts: AccountStore, root: string): Promise<void> {
  const account = accounts.get(input.account);
  if (!account)
    throw new Error(`Pipeline account is not configured: ${input.account}`);
  const workspace = defaultJobWorkspace(root, job.id);
  await mkdir(workspace, { recursive: true });
  const bodyPath = join(workspace, "source.md");
  // 内容图保留完整文章，发送配文通过独立快照传递。
  await writeFile(bodyPath, input.body, "utf8");
  const newspicPath = join(workspace, "newspic.json");
  if (input.newspic) await writeFile(newspicPath, JSON.stringify(input.newspic), "utf8");
  // 无手动配图时复用长文渲染，生成封面和内容页；给封面预留一张额度。
  const generateNewspic = input.contentForm === "newspic" && !input.newspic?.photos.length;
  const newspicSpecPath = join(workspace, "newspic-render.json");
  if (generateNewspic)
    await writeFile(newspicSpecPath, JSON.stringify({ pagination_mode: "multi", max_pages: 19 }), "utf8");

  const init = await runPipelineCommand(workspace, "init", [
    "--workspace", workspace,
    "--task-kind", "publish",
    "--content-form", input.contentForm,
    "--targets", `wechat@${input.account}`,
    "--content-origin", "user",
    "--intent-text", input.intentText?.trim() || input.title,
    "--account", input.account,
    "--requires-publish",
    ...(input.newspic ? ["--newspic-file", newspicPath] : []),
    ...(generateNewspic ? ["--newspic-render-spec-file", newspicSpecPath] : []),
    ...(input.existingDraftMediaId ? ["--existing-draft-media-id", input.existingDraftMediaId] : []),
    ...(input.coverTheme ? ["--cover-theme", input.coverTheme] : []),
  ], account);
  const initResult = init.result as { state_path?: string; run_id?: string };
  let statePath = stringParam(initResult.state_path);
  if (!statePath)
    throw new Error("Pipeline init did not return state_path");
  job.runId = stringParam(initResult.run_id);
  job.statePath = statePath;
  await store.set(job);

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = await status(workspace, statePath, account);
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
      await runPipelineCommand(workspace, "attach-body", ["--state", statePath, "--body", bodyPath], account);
      continue;
    }
    if (action === "review-content") {
      await runAction(workspace, statePath, "review", { status: "passed" }, account);
      continue;
    }
    if (action === "prepare" || action === "prepare-finalize" || action === "render" || action === "publish") {
      try {
        await runAction(workspace, statePath, action, {
          title: input.title,
          formatted_body_path: current.next_action?.params?.formatted_body_path,
        }, account);
      } catch (error) {
        // 发布失败时仍保留原运行的业务结果；不得创建新 run 自动重试。
        const latest = await status(workspace, statePath, account).catch(() => null);
        if (latest) job.result = { runId: job.runId, publishResults: publishResults(latest) };
        throw error;
      }
      continue;
    }
    throw new Error(`Pipeline needs unsupported action: ${action}`);
  }

  throw new Error("Pipeline did not finish within 12 actions");
}
