import { copyFile, mkdir, writeFile } from "fs/promises";
import { extname, join, resolve } from "path";

import { parseArgs, optionalArg, requireArg } from "../args";
import { printResult, renderTaskShape } from "../output";
import { resolveWorkspacePaths } from "../config";
import { readResolvedState, reenterPrepare, writeState } from "../state";
import { getTaskByStatePath } from "../task-manager";
import { reconcileStateArtifacts } from "../workflow-materials";

async function stageManagedBodyFile(
  workspaceRoot: string,
  runId: string,
  sourcePath: string | null,
  bodyText: string | null,
): Promise<string> {
  const tempRoot = resolveWorkspacePaths(workspaceRoot).tempRoot;
  const extension = sourcePath ? extname(sourcePath) || ".md" : ".md";
  const managedDir = join(tempRoot, runId);
  const managedPath = join(managedDir, `source-body${extension}`);
  await mkdir(managedDir, { recursive: true });

  if (bodyText !== null) {
    await writeFile(managedPath, bodyText, "utf-8");
  } else if (sourcePath) {
    if (resolve(sourcePath) !== resolve(managedPath)) {
      await copyFile(sourcePath, managedPath);
    }
  } else {
    throw new Error("Either sourcePath or bodyText must be provided");
  }

  return managedPath;
}

export async function attachBody(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline attach-body [options]

Options:
  --state      Path to state JSON (required)
  --body       Path to markdown body file (optional)
  --body-text  Inline markdown body text (optional)
`.trim());
    return;
  }

  const requestedStatePath = requireArg(parsed, "state", "state JSON path");
  const bodyPath = optionalArg(parsed, "body");
  const bodyText = optionalArg(parsed, "body-text");
  if (!bodyPath && bodyText === undefined) {
    throw new Error("Missing required argument: --body or --body-text");
  }
  if (bodyPath && bodyText !== undefined) {
    throw new Error("Use either --body or --body-text, not both");
  }

  const resolved = await readResolvedState(requestedStatePath);
  const statePath = resolved.path;
  const state = resolved.state;
  state.source_body_path = await stageManagedBodyFile(
    state.workspace_root,
    state.run_id,
    bodyPath ?? null,
    bodyText ?? null,
  );
  reenterPrepare(state, {
    clearFormattedBody: true,
    resetReview: true,
  });
  if (state.handoff.review_policy === "trust_user") {
    state.content_review = { status: "passed", feedback: null };
  }
  await reconcileStateArtifacts(state);
  await writeState(statePath, state);

  const task = await getTaskByStatePath(statePath);
  printResult(
    {
      summary: {
        run_id: task.summary.run_id,
        mode: task.summary.mode,
        phase: task.summary.phase,
        route: task.summary.route,
        metadata: task.summary.metadata,
      },
      blockers: task.blockers,
      next_action: task.next_action,
    },
    renderTaskShape,
  );
}
