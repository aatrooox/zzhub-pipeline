import { parseArgs, requireArg, flagArg } from "../args";
import { printResult, renderSyncBlog } from "../output";
import { loadConfig, resolveWorkspacePaths } from "../config";
import { readState, updateState } from "../state";
import { publishBlogRoute } from "../providers/blog";

export async function syncBlog(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline sync-blog [options]

Options:
  --state    Path to state JSON (required)
  --dry-run  Print the target copy/publish command without executing
`.trim());
    return;
  }

  const statePath = requireArg(parsed, "state", "state JSON path");
  const dryRun = flagArg(parsed, "dry-run");

  const config = loadConfig();

  // Run the actual publish (may have network side effects)
  const state = await readState(statePath);

  if (!state.asset_path) {
    throw new Error("asset_path not set. Run prepare-finalize first.");
  }

  const workspacePaths = resolveWorkspacePaths(state.workspace_root, config);
  const result = await publishBlogRoute({
    state,
    dryRun,
    config,
    workspacePaths,
  });

  // Write result back to state
  const finalState = await updateState(statePath, (s) => {
    const idx = s.publish.results.findIndex((r) => r.route === "blog");
    if (idx >= 0) {
      s.publish.results[idx] = result;
    } else {
      s.publish.results.push(result);
    }
  });

  printResult({
    ...result,
    mode: finalState.mode,
  }, renderSyncBlog);
}
