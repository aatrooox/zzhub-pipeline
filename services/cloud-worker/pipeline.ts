import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { AccountStore, CloudJobInput, JobStore, StoredCloudJob, PipelineWorkerAccount } from "./store";
import { defaultJobWorkspace } from "./store";
import { redact } from "../../src/monitor/runtime";
import type { TaskStatusReport } from "../../src/task-manager";
import { validateArticleStyleSnapshot } from "../../src/article-style";
import { readArticleTheme } from "../../src/article-theme";
import { materializeCoverSnapshot, type JobCoverMaterials } from "./cover";
import { ARTICLE_COVER_IMAGE_KEY } from "@akairos/typeset-studio/cover";
import { readPreparedArticle, preparedCover, type PreparedArticle } from "./job-materials";
import { artifactsPath, freezeArticleArtifacts } from "./artifacts";

interface PipelineCommandResult {
  result: any;
  stderr: string;
}

type PipelineTaskStatus = Pick<TaskStatusReport, "summary" | "next_action"> & Partial<Pick<TaskStatusReport, "state">>;

function pipelineRoot(): string {
  return resolve(process.env.PIPELINE_ROOT?.trim() || resolve(import.meta.dir, "../.."));
}

function pipelineEntry(): string {
  return resolve(pipelineRoot(), "src/cli.ts");
}

function pipelineEnv(workspace: string, account?: PipelineWorkerAccount | null, cover?: JobCoverMaterials, prepared?: PreparedArticle, publishing = false): Record<string, string> {
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
  // 只覆盖本任务的子进程，插件子进程继承字体路径并在首次测量前核验注册。
  if (cover) {
    env.TYPESET_DATA_DIR = cover.dataDir;
    env.TYPESET_ARTICLE_COVER_FONT_PATH = cover.fontPath;
    env.ZZHUB_PIPELINE_COVER_SNAPSHOT = "1";
  }
  if (prepared) {
    env.ZZHUB_PIPELINE_ARTICLE_SNAPSHOT = "1";
    env.ZZHUB_PIPELINE_CONFIG = prepared.configFile;
    // 未确认的预览即使错误推进 publish，也会在 provider 边界被拒绝。
    env.ZZHUB_PIPELINE_PREVIEW_ONLY = publishing ? "0" : "1";
    if (publishing) env.ZZHUB_PIPELINE_ARTICLE_ARTIFACTS = artifactsPath(workspace);
  }
  return env;
}

async function runPipelineCommand(
  workspace: string,
  command: string,
  args: string[],
  account?: PipelineWorkerAccount | null,
  cover?: JobCoverMaterials,
  prepared?: PreparedArticle,
  publishing = false,
  artifactManifestHash?: string,
): Promise<PipelineCommandResult> {
  const environment = pipelineEnv(workspace, account, cover, prepared, publishing);
  if (publishing && prepared) {
    environment.ZZHUB_PIPELINE_ARTIFACT_MANIFEST_HASH = artifactManifestHash!;
    environment.ZZHUB_PIPELINE_ARTICLE_SNAPSHOT_HASH = prepared.snapshotHash;
  }
  const child = Bun.spawn([
    process.env.BUN_BIN?.trim() || process.execPath,
    pipelineEntry(),
    command,
    ...args,
  ], {
    cwd: pipelineRoot(),
    env: environment,
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

async function status(workspace: string, statePath: string, account: PipelineWorkerAccount, cover?: JobCoverMaterials, prepared?: PreparedArticle): Promise<PipelineTaskStatus> {
  const output = await runPipelineCommand(workspace, "status", ["--state", statePath, ...(cover ? ["--full"] : [])], account, cover, prepared);
  return output.result as PipelineTaskStatus;
}

async function runAction(
  workspace: string,
  statePath: string,
  action: string,
  params: Record<string, unknown> = {},
  account: PipelineWorkerAccount,
  cover?: JobCoverMaterials,
  prepared?: PreparedArticle,
  publishing = false,
  artifactManifestHash?: string,
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
  } else if (action === "render" && cover) {
    args.push("--studio-cover-template", cover.snapshot.id, "--template-images-file", cover.imagesFile);
  }
  await runPipelineCommand(workspace, action, args, account, cover, prepared, publishing, artifactManifestHash);
}

/** 发布前核对 CLI 已接受精确模板与任务私有素材，防止配置回落仍被确认成功。 */
function verifyCoverSelection(current: PipelineTaskStatus, cover: JobCoverMaterials, prepared?: PreparedArticle): void {
  const studio = current.state?.intent.studio_render;
  if (studio?.templates?.cover !== cover.snapshot.id ||
    !prepared && studio.image_overrides?.cover?.[ARTICLE_COVER_IMAGE_KEY] !== join(cover.dataDir, "..", "image.jpg"))
    throw new Error("Pipeline did not apply the expected cover template and private image");
}

/** 按 Pipeline 自己的 next_action 推进，避免在 worker 复制状态机规则。 */
export async function executeCloudJob(job: StoredCloudJob, input: CloudJobInput, store: JobStore, accounts: AccountStore, root: string): Promise<void> {
  const account = accounts.get(input.account);
  if (!account)
    throw new Error(`Pipeline account is not configured: ${input.account}`);
  const workspace = defaultJobWorkspace(root, job.id);
  await mkdir(workspace, { recursive: true });
  if (input.coverSnapshot && input.contentForm !== "article") throw new Error("coverSnapshot requires article contentForm");
  const prepared = input.articleSnapshot ? await readPreparedArticle(workspace, job.preparedHash!) : undefined;
  const cover = prepared ? preparedCover(prepared) : input.coverSnapshot ? await materializeCoverSnapshot(workspace, input.coverSnapshot) : undefined;
  // 任务私有样式文件只来自已验证 JSON，不读取调用方路径或修改全局配置。
  const articleStyle = input.articleStyle ? validateArticleStyleSnapshot(input.articleStyle) : undefined;
  const articleStylePath = join(workspace, "article-style.json");
  if (articleStyle && !prepared) await writeFile(articleStylePath, JSON.stringify(articleStyle.manifest), { mode: 0o600 });
  // CLI 主题包含既有默认字段，其 hash 与正文快照的纯 manifest hash 分开记录。
  const articleThemeHash = prepared?.articleThemeHash ?? (articleStyle ? (await readArticleTheme(articleStylePath)).hash : undefined);
  const styleIdentity = articleStyle ? { articleStyleHash: articleStyle.hash, articleThemeHash } : {};
  const coverIdentity = input.coverSnapshot ? { coverSnapshotHash: input.coverSnapshot.hash, coverAssetHash: input.coverSnapshot.asset.sha256, coverFontHash: input.coverSnapshot.font.sha256 } : {};
  const snapshotIdentity = { ...styleIdentity, ...coverIdentity, ...(prepared ? { inputHash: prepared.inputHash, snapshotHash: prepared.snapshotHash, articleThemeHash: prepared.articleThemeHash } : {}) };
  if (articleStyle || cover) job.result = { ...job.result, ...snapshotIdentity };
  const bodyPath = prepared?.bodyPath ?? join(workspace, "source.md");
  // 内容图保留完整文章，发送配文通过独立快照传递。
  if (!prepared) await writeFile(bodyPath, input.body, "utf8");
  const newspicPath = join(workspace, "newspic.json");
  if (input.newspic) await writeFile(newspicPath, JSON.stringify(input.newspic), "utf8");
  // 无手动配图时复用长文渲染，生成封面和内容页；给封面预留一张额度。
  const generateNewspic = input.contentForm === "newspic" && !input.newspic?.photos.length;
  const newspicSpecPath = join(workspace, "newspic-render.json");
  if (generateNewspic)
    await writeFile(newspicSpecPath, JSON.stringify({ pagination_mode: "multi", max_pages: 19 }), "utf8");

  let statePath = job.statePath;
  if (!statePath) {
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
    ...(articleStyle || prepared ? ["--article-theme", articleStylePath] : []),
  ], account, cover, prepared);
  const initResult = init.result as { state_path?: string; run_id?: string };
  statePath = stringParam(initResult.state_path);
  if (!statePath)
    throw new Error("Pipeline init did not return state_path");
  job.runId = stringParam(initResult.run_id);
  job.statePath = statePath;
  await store.set(job);
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const current = await status(workspace, statePath, account, cover, prepared);
    statePath = current.summary.state_path;
    job.statePath = statePath;
    if (prepared && current.summary.metadata?.title && (current.summary.metadata.title !== input.title || current.summary.route.account !== input.account)) throw new Error(`Original preview run differs from frozen input: title=${JSON.stringify(current.summary.metadata.title)} expected=${JSON.stringify(input.title)}, account=${current.summary.route.account} expected=${input.account}, next_action=${current.next_action?.action}`);
    if (isDone(current)) {
      // 校验失败也保留真实草稿身份，供调用方核对原结果而不盲目重发。
      job.result = {
        ...job.result, ...snapshotIdentity,
        runId: job.runId,
        phase: current.summary?.phase?.current || "done",
        publishResults: publishResults(current),
      };
      const result = current.summary.publish.results.find(item => item.account === input.account);
      if (result?.status !== "success" || !result.external_id)
        throw new Error("Pipeline completed without a confirmed WeChat draft media_id");
      if ((articleStyle || prepared) && result.article_theme_hash !== articleThemeHash)
        throw new Error("Pipeline completed without the expected article theme hash");
      if (cover) verifyCoverSelection(current, cover, prepared);
      job.step = "done";
      return;
    }

    const action = stringParam(current.next_action?.action);
    if (!action)
      throw new Error("Pipeline returned no next_action before completion");

    job.step = action;
    await store.set(job);

    if (action === "attach-body") {
      await runPipelineCommand(workspace, "attach-body", ["--state", statePath, "--body", bodyPath], account, cover, prepared);
      continue;
    }
    if (action === "review-content") {
      await runAction(workspace, statePath, "review", { status: "passed" }, account, cover, prepared);
      continue;
    }
    if (action === "prepare" || action === "prepare-finalize" || action === "render" || action === "publish") {
      try {
        if (action === "publish" && cover) verifyCoverSelection(current, cover, prepared);
        if (action === "publish" && prepared && !job.publicationRequested) {
          const exported = await runPipelineCommand(workspace, "article-export", ["--state", statePath], account, cover, prepared);
          const artifacts = await freezeArticleArtifacts(workspace, prepared, exported.result.htmlPath, exported.result.coverPath, exported.result.assetPath);
          job.result = { ...job.result, ...snapshotIdentity, ...artifacts };
          job.status = "preview_ready"; job.step = "preview_ready";
          await store.set(job); return;
        }
        if (prepared && job.publicationRequested && action !== "publish") throw new Error("Confirmed preview run no longer points to publish; inspect the original run");
        if (prepared && job.publicationRequested) {
          const { readArtifact } = await import("./artifacts");
          const manifest = job.result?.artifactManifest as { artifacts: Array<{ key: string }> };
          for (const artifact of manifest.artifacts) await readArtifact(workspace, artifact.key, String(job.result!.artifactManifestHash), prepared.snapshotHash);
        }
        await runAction(workspace, statePath, action, {
          title: input.title,
          formatted_body_path: current.next_action?.params?.formatted_body_path,
        }, account, cover, prepared, job.publicationRequested === true, job.result?.artifactManifestHash as string | undefined);
      } catch (error) {
        // 发布失败时仍保留原运行的业务结果；不得创建新 run 自动重试。
        const latest = await status(workspace, statePath, account, cover, prepared).catch(() => null);
        if (latest) job.result = { ...job.result, runId: job.runId, publishResults: publishResults(latest), ...snapshotIdentity };
        throw error;
      }
      continue;
    }
    throw new Error(`Pipeline needs unsupported action: ${action}`);
  }

  throw new Error("Pipeline did not finish within 12 actions");
}
