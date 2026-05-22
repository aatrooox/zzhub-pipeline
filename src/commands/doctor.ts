import { existsSync } from "fs";
import { parseArgs, optionalArg } from "../args";
import { printResult, renderDoctor } from "../output";
import {
  configSummary,
  getPipelineConfigPath,
  getLegacyZCliConfigPath,
  loadConfig,
  resolveWorkspaceRoot,
  resolveWorkspacePaths,
} from "../config";
import { listPublishProviders } from "../providers";
import { resolveBunBinary } from "../spawn";
import { runPluginDoctorChecks } from "../adapter-loader";

export async function doctor(args: string[]): Promise<void> {
  const parsed = parseArgs(args);

  if (parsed.help) {
    console.log(`
Usage: zzhub-pipeline doctor [options]

Options:
  --workspace  Workspace root to resolve default paths against
`.trim());
    return;
  }

  const config = loadConfig();
  const workspace = resolveWorkspaceRoot(optionalArg(parsed, "workspace"), config);
  const paths = resolveWorkspacePaths(workspace, config);

  let bunBinary: string | null = null;
  let bunError: string | null = null;

  try {
    bunBinary = resolveBunBinary();
  } catch (error) {
    bunError = error instanceof Error ? error.message : String(error);
  }

  const pluginChecks = await runPluginDoctorChecks(config);

  printResult(
    {
      ...configSummary(config),
      config_path_exists: existsSync(getPipelineConfigPath()),
      legacy_config_path_exists: existsSync(getLegacyZCliConfigPath()),
      workspace,
      resolved_paths: paths,
      resolved_paths_exist: {
        postsRoot: existsSync(paths.postsRoot),
        tempRoot: existsSync(paths.tempRoot),
        blogRoot: existsSync(paths.blogRoot),
        zotepadExportHtml: existsSync(paths.zotepadExportHtml),
      },
      bundled_imgx: true,
      bundled_wechat_preview: true,
      bun_binary: bunBinary,
      bun_error: bunError,
      publish_providers: listPublishProviders(),
      plugin_checks: pluginChecks,
    },
    renderDoctor,
  );
}
