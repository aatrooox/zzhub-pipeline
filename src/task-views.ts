import type { ListedTask, TaskGap, TaskStatusReport } from "./task-manager";

export type TaskViewMode = "json" | "markdown" | "agent" | "agent-json";

function formatValue(value: string | null | undefined): string {
  return value && value.trim() ? value : "-";
}

function describeAccount(account: string): string {
  switch (account) {
    case "default":
      return "default (大号 / 早早集市)";
    case "ancientone":
      return "ancientone (小号 / 古一)";
    default:
      return account;
  }
}

function formatGapList(items: TaskGap[]): string {
  if (items.length === 0) {
    return "- none";
  }
  return items
    .map((item) => `- ${item.message} (\`${item.field}\`)`)
    .join("\n");
}

function buildSuggestedCommand(task: TaskStatusReport): string | null {
  return task.next_action.command;
}

function describePublishResults(task: TaskStatusReport): string {
  const results = task.summary.publish.results;
  if (results.length === 0) {
    return "none";
  }
  return results
    .map((result) => `${result.route}:${result.status}`)
    .join(", ");
}

export function parseTaskViewMode(raw: string | undefined): TaskViewMode {
  if (!raw || raw === "json") {
    return "json";
  }
  if (raw === "markdown" || raw === "agent" || raw === "agent-json") {
    return raw;
  }
  throw new Error(`Unsupported view: ${raw}. Use json, markdown, agent, or agent-json.`);
}

export function renderTaskStatusMarkdown(
  task: TaskStatusReport,
  mode: Exclude<TaskViewMode, "json">,
): string {
  const heading = mode === "agent" ? "# Current Task" : "# Task Status";
  const suggestedCommand = buildSuggestedCommand(task);
  const sections = [
    heading,
    "",
    `- Task: \`${task.summary.run_id}\``,
    `- Mode: \`${task.summary.mode}\``,
    `- Phase: \`${task.summary.phase.current}\``,
    `- Route: \`${task.summary.route.primary}\``,
    `- Account: \`${describeAccount(task.summary.route.account)}\``,
    `- Title: \`${formatValue(task.summary.metadata.title)}\``,
    `- Source: \`${task.summary.source}\``,
    `- Publish Results: \`${describePublishResults(task)}\``,
    "",
    "## Missing",
    formatGapList(task.gaps),
    "",
    "## Blockers",
    formatGapList(task.blockers),
    "",
    "## Next Action",
    `- \`${task.next_action.action}\`: ${task.next_action.reason}`,
    `- Executor: \`${task.next_action.executor}\``,
  ];

  // In agent mode, surface next_action.params as an explicit block so the
  // orchestrator can read them without inspecting the state file.
  if (mode === "agent" && task.next_action.params) {
    const params = task.next_action.params;
    const paramLines: string[] = [];
    if (params.state_path) {
      paramLines.push(`- state_path: \`${params.state_path}\``);
    }
    if (params.spawn) {
      paramLines.push(`- spawn: \`true\``);
    }
    if (params.requires_research) {
      paramLines.push(`- requires_research: \`true\``);
    }
    if (params.source_body_path) {
      paramLines.push(`- source_body_path: \`${params.source_body_path}\``);
    }
    if (params.source_materials_path) {
      paramLines.push(`- source_materials_path: \`${params.source_materials_path}\``);
    }
    if (params.formatted_body_path) {
      paramLines.push(`- formatted_body_path: \`${params.formatted_body_path}\``);
    }
    if (params.feedback !== undefined && params.feedback !== null) {
      paramLines.push(`- feedback: ${params.feedback}`);
    }
    if (params.worker_profile) {
      paramLines.push(`- worker_profile: \`${params.worker_profile}\``);
    }
    if (params.worker_mode) {
      paramLines.push(`- worker_mode: \`${params.worker_mode}\``);
    }
    if (params.research_policy && params.research_policy !== "default") {
      paramLines.push(`- research_policy: \`${params.research_policy}\``);
    }
    if (params.authoring_policy && params.authoring_policy !== "default") {
      paramLines.push(`- authoring_policy: \`${params.authoring_policy}\``);
    }
    if (params.review_policy && params.review_policy !== "default") {
      paramLines.push(`- review_policy: \`${params.review_policy}\``);
    }
    if (params.required_inputs && params.required_inputs.length > 0) {
      paramLines.push(`- required_inputs: \`${params.required_inputs.join(", ")}\``);
    }
    if (params.body_source) {
      paramLines.push(`- body_source: \`${params.body_source}\``);
    }
    if (params.handoff_alt) {
      paramLines.push(`- handoff_alt: \`${params.handoff_alt}\``);
    }
    if (params.on_complete) {
      paramLines.push(`- on_complete: ${params.on_complete}`);
    }
    if (paramLines.length > 0) {
      sections.push("", "**Params**", ...paramLines);
    }
  }

  if (suggestedCommand) {
    sections.push(
      "",
      "## Suggested Command",
      "```bash",
      suggestedCommand,
      "```",
    );
  }

  return sections.join("\n");
}

function renderTasksMarkdownTable(tasks: ListedTask[]): string {
  const lines = [
    "# Task List",
    "",
    "| Run ID | Title | Route | Account | Mode | Phase | Next |",
    "| --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const task of tasks) {
    lines.push(
      `| \`${task.summary.run_id}\` | ${formatValue(task.summary.metadata.title)} | \`${task.summary.route.primary}\` | \`${task.summary.route.account}\` | \`${task.summary.mode}\` | \`${task.summary.phase.current}\` | \`${task.next_action.action}\` |`,
    );
  }

  if (tasks.length === 0) {
    lines.push("| - | - | - | - | - | - | - |");
  }

  return lines.join("\n");
}

function renderTasksAgentList(tasks: ListedTask[]): string {
  const lines = ["# Active Tasks", ""];

  if (tasks.length === 0) {
    lines.push("- No matching tasks.");
    return lines.join("\n");
  }

  for (const task of tasks) {
    lines.push(`## \`${task.summary.run_id}\``);
    lines.push(`- Title: \`${formatValue(task.summary.metadata.title)}\``);
    lines.push(`- Route: \`${task.summary.route.primary}\``);
    lines.push(`- Account: \`${describeAccount(task.summary.route.account)}\``);
    lines.push(`- Mode: \`${task.summary.mode}\``);
    lines.push(`- Phase: \`${task.summary.phase.current}\``);
    lines.push(`- Next: \`${task.next_action.action}\` - ${task.next_action.reason}`);
    lines.push(`- Executor: \`${task.next_action.executor}\``);
    if (task.blockers.length > 0) {
      lines.push(`- Blockers: ${task.blockers.map((item) => item.message).join("; ")}`);
    } else if (task.gaps.length > 0) {
      lines.push(`- Missing: ${task.gaps.map((item) => item.message).join("; ")}`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

export function renderTasksView(
  tasks: ListedTask[],
  mode: Exclude<TaskViewMode, "json">,
): string {
  return mode === "markdown"
    ? renderTasksMarkdownTable(tasks)
    : renderTasksAgentList(tasks);
}

export function buildAgentTaskShape(task: TaskStatusReport): Record<string, unknown> {
  return {
    summary: task.summary,
    gaps: task.gaps,
    blockers: task.blockers,
    next_action: task.next_action,
  };
}

export function buildAgentTasksShape(tasks: ListedTask[]): Record<string, unknown>[] {
  return tasks.map((task) => buildAgentTaskShape(task));
}
