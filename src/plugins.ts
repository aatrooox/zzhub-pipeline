import { abandon } from "./commands/abandon";
import { attachBody } from "./commands/attach-body";
import { attachBodyImages } from "./commands/attach-body-images";
import { attachNewspicSpec } from "./commands/attach-newspic-spec";
import { checkpoint } from "./commands/checkpoint";
import { configCommand } from "./commands/config";
import { cosUpload } from "./commands/cos-upload";
import { doctor } from "./commands/doctor";
import { findRun } from "./commands/find-run";
import { hermesMetrics } from "./commands/hermes-metrics";
import { ingestHandoff } from "./commands/ingest-handoff";
import { imgxCommand } from "./commands/imgx";
import { init } from "./commands/init";
import { prepareFinalize } from "./commands/prepare-finalize";
import { prepare } from "./commands/prepare";
import { publish } from "./commands/publish";
import { reconcile } from "./commands/reconcile";
import { render } from "./commands/render";
import { reset } from "./commands/reset";
import { review } from "./commands/review";
import { status } from "./commands/status";
import { syncBlog } from "./commands/sync-blog";
import { tasks } from "./commands/tasks";
import { wechatExport } from "./commands/wechat-export";
import { wxDrafts } from "./commands/wx-drafts";
import { wxDraftDelete } from "./commands/wx-draft-delete";

export interface CommandDefinition {
  name: string;
  summary: string;
  plugin: string;
  handler: (args: string[]) => Promise<void>;
}

export interface CommandPlugin {
  name: string;
  commands: CommandDefinition[];
}

export function getCommandPlugins(): CommandPlugin[] {
  return [
    {
      name: "workflow",
      commands: [
        { name: "init", summary: "Create run state from intent classification", plugin: "workflow", handler: init },
        { name: "ingest-handoff", summary: "Create or resume a task from a publish_handoff/workflow_handoff JSON file", plugin: "workflow", handler: ingestHandoff },
        { name: "attach-body", summary: "Attach a source body file to a managed task", plugin: "workflow", handler: attachBody },
        { name: "attach-body-images", summary: "Attach body image marker files to a managed task", plugin: "workflow", handler: attachBodyImages },
        { name: "attach-newspic-spec", summary: "Attach or update newspic render intent", plugin: "workflow", handler: attachNewspicSpec },
        { name: "prepare", summary: "Route + author + format + metadata", plugin: "workflow", handler: prepare },
        { name: "prepare-finalize", summary: "Highlight words + asset save", plugin: "workflow", handler: prepareFinalize },
        { name: "render", summary: "Image plan + imgx render", plugin: "workflow", handler: render },
        { name: "publish", summary: "Execute publish routes", plugin: "workflow", handler: publish },
        { name: "reconcile", summary: "Reconcile managed task materials and derived state", plugin: "workflow", handler: reconcile },
        { name: "checkpoint", summary: "Read task state and validate current phase", plugin: "workflow", handler: checkpoint },
        { name: "status", summary: "Read a managed task with gaps and next action", plugin: "workflow", handler: status },
        { name: "find-run", summary: "Find the best matching managed task", plugin: "workflow", handler: findRun },
        { name: "tasks", summary: "List managed tasks in the workspace", plugin: "workflow", handler: tasks },
        { name: "reset", summary: "Reset phases for revision", plugin: "workflow", handler: reset },
        { name: "review", summary: "Update content review status", plugin: "workflow", handler: review },
        { name: "abandon", summary: "Mark one or more tasks as abandoned", plugin: "workflow", handler: abandon },
      ],
    },
    {
      name: "ops",
      commands: [
        { name: "sync-blog", summary: "Copy canonical markdown to the blog repo and publish there", plugin: "ops", handler: syncBlog },
        { name: "imgx", summary: "Run bundled imgx renderer subcommands", plugin: "ops", handler: imgxCommand },
        { name: "wechat-export", summary: "Render markdown to WeChat HTML with bundled preview styles", plugin: "ops", handler: wechatExport },
        { name: "cos-upload", summary: "Upload a local image to configured COS CDN", plugin: "ops", handler: cosUpload },
        { name: "config", summary: "Read or update pipeline config", plugin: "ops", handler: configCommand },
        { name: "doctor", summary: "Inspect resolved paths and provider health", plugin: "ops", handler: doctor },
        { name: "hermes-metrics", summary: "Show Hermes execution metrics per task", plugin: "ops", handler: hermesMetrics },
        { name: "wx-drafts", summary: "List or get drafts from WeChat draft box", plugin: "ops", handler: wxDrafts },
        { name: "wx-draft-delete", summary: "Delete a draft from WeChat draft box", plugin: "ops", handler: wxDraftDelete },
      ],
    },
  ];
}

export function getCommandRegistry(): Record<string, CommandDefinition> {
  return Object.fromEntries(
    getCommandPlugins()
      .flatMap((plugin) => plugin.commands)
      .map((command) => [command.name, command]),
  );
}

export function formatUsage(): string {
  const sections = getCommandPlugins().map((plugin) => {
    const lines = plugin.commands.map(
      (command) => `  ${command.name.padEnd(18)} ${command.summary}`,
    );
    return [`${plugin.name}:`, ...lines].join("\n");
  });

  return [
    "Usage: zzhub-pipeline <command> [options]",
    "",
    "Commands:",
    ...sections,
    "",
    "Run 'zzhub-pipeline <command> --help' for command-specific options.",
  ].join("\n");
}
