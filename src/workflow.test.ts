import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { attachBody } from "./commands/attach-body";
import { attachBodyImages } from "./commands/attach-body-images";
import { attachNewspicSpec } from "./commands/attach-newspic-spec";
import { createCosUploadCommand } from "./commands/cos-upload";
import { init } from "./commands/init";
import { findRun } from "./commands/find-run";
import { ingestHandoff } from "./commands/ingest-handoff";
import { prepare } from "./commands/prepare";
import { prepareFinalize } from "./commands/prepare-finalize";
import { render } from "./commands/render";
import { publish } from "./commands/publish";
import { republish } from "./commands/republish";
import { reconcile } from "./commands/reconcile";
import { review } from "./commands/review";
import { status } from "./commands/status";
import { syncBlog } from "./commands/sync-blog";
import { tasks } from "./commands/tasks";
import {
  loadConfig,
  renderPostsRelativePath,
  resolveWorkspacePaths,
  resolveWorkspaceRoot,
} from "./config";
import { resolveFullRoute } from "./routes";
import { resolveAuthoring } from "./profiles";
import { WorkflowStateSchema } from "./schema/state";
import { defaultState, readState, validateForPhase, writeState } from "./state";
import { getTaskByStatePath } from "./task-manager";
import {
  dedupeTargets,
  executePublishTargets,
  filterIdempotent,
} from "./providers/publish-core";
import { getPublishProvider, listPublishProviders } from "./providers";
import { getStatePublishTargets } from "./publish-targets";
import { stripLeadingH1, stripLeadingTitleHeading } from "./text";

const TEST_CONFIG_PATH = join(
  tmpdir(),
  `zzhub-pipeline-test-config-${process.pid}.json`,
);
process.env.ZZHUB_PIPELINE_CONFIG = TEST_CONFIG_PATH;

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function captureJsonOutput<T>(fn: () => Promise<unknown>): Promise<T> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }

  const payload = lines.join("\n").trim();
  return JSON.parse(payload) as T;
}

async function captureTextOutput(fn: () => Promise<unknown>): Promise<string> {
  const original = console.log;
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map((value) => String(value)).join(" "));
  };
  try {
    await fn();
  } finally {
    console.log = original;
  }

  return lines.join("\n").trim();
}

beforeEach(async () => {
  await writeFile(TEST_CONFIG_PATH, "{}", "utf-8");
});

describe("route resolution", () => {
  test("throws for ambiguous public-account intent without classification", () => {
    expect(() =>
      resolveFullRoute("发公众号", {
        contentForm: "unknown",
      })
    ).toThrow("Ambiguous route");
  });

  test("allows classified form to resolve an otherwise ambiguous intent", () => {
    const route = resolveFullRoute("发公众号", {
      contentForm: "article",
    });
    expect(route.primary).toBe("wechat-article");
  });

  test("routes a blog-only target through the blog workflow", () => {
    const route = resolveFullRoute("", {
      contentForm: "article",
      targets: ["blog"],
    });
    expect(route.primary).toBe("blog");
    expect(route.extras).toEqual([]);
  });

  test("adds blog as an extra workflow route for mixed targets", () => {
    const route = resolveFullRoute("", {
      contentForm: "article",
      targets: ["wechat", "blog"],
    });
    expect(route.primary).toBe("wechat-article");
    expect(route.extras).toEqual(["blog"]);
  });

  test("treats explicit newspic big-account intent as deterministic", () => {
    const route = resolveFullRoute("发一篇公众号贴图给大号", {
      contentForm: "newspic",
      targets: ["wechat"],
    });
    expect(route.primary).toBe("wechat-newspic");
    expect(route.account).toBe("default");
  });
});

describe("init", () => {
  test("validates runtime enums before writing state", async () => {
    const workspace = await makeTempDir("zzhub-init-invalid-");
    await expect(init([
      "--workspace", workspace,
      "--task-kind", "publsih",
      "--content-form", "article",
      "--targets", "wechat",
      "--content-origin", "user",
    ])).rejects.toThrow("Invalid task kind");
  });

  test("maps wechat@account targets from the classified content form", async () => {
    const workspace = await makeTempDir("zzhub-init-alias-");
    const output = await captureJsonOutput<{ state_path: string }>(() => init([
      "--workspace", workspace,
      "--task-kind", "publish",
      "--content-form", "article",
      "--targets", "wechat@ancientone",
      "--content-origin", "user",
    ]));
    const state = await readState(output.state_path);
    expect(state.publish_targets).toEqual([
      { route: "wechat-article", account: "ancientone" },
    ]);
    expect(state.route.primary).toBe("wechat-article");
  });

  test("normalizes underscore flags and resolves route/account from intent text", async () => {
    const workspace = await makeTempDir("zzhub-init-");
    const output = await captureJsonOutput<{ state_path: string }>(() =>
      init([
        "--workspace",
        workspace,
        "--task-kind",
        "publish",
        "--content-form",
        "newspic",
        "--targets",
        "wechat",
        "--content-origin",
        "user",
        "--intent-text",
        "写一篇公众号贴图，发到大号",
        "--requires_render",
        "--requires_publish",
      ]));

    const state = await readState(output.state_path);
    expect(state.intent.requires.render).toBe(true);
    expect(state.intent.requires.publish).toBe(true);
    expect(state.route.primary).toBe("wechat-newspic");
    expect(state.route.account).toBe("default");
  });

  test("ingest-handoff creates a publish task from structured JSON", async () => {
    const workspace = await makeTempDir("zzhub-ingest-handoff-");
    const bodyPath = join(workspace, "handoff.md");
    const handoffPath = join(workspace, "handoff.json");
    await writeFile(bodyPath, "终稿正文", "utf-8");
    await writeFile(
      handoffPath,
      JSON.stringify({
        publish_handoff: {
          content_form: "article",
          body_path: bodyPath,
          target_account: "default",
          title: "交接协议测试",
          user_intent_text: "发到公众号大号",
          explicit_constraints: ["终稿，不再改稿"],
        },
      }),
      "utf-8",
    );

    const output = await captureJsonOutput<{
      accepted_handoff: { title: string; explicit_constraints: string[] };
      summary: { state_path: string; metadata: { title: string | null }; route: { account: string } };
      next_action: { action: string; executor: string };
    }>(() =>
      ingestHandoff([
        "--workspace",
        workspace,
        "--file",
        handoffPath,
      ]));

    expect(output.accepted_handoff.title).toBe("交接协议测试");
    expect(output.accepted_handoff.explicit_constraints).toEqual(["终稿，不再改稿"]);
    expect(output.summary.metadata.title).toBe("交接协议测试");
    expect(output.summary.route.account).toBe("default");
    expect(output.next_action.action).toBe("prepare");
    expect(output.next_action.executor).toBe("cli");

    const state = await readState(output.summary.state_path);
    expect(state.intent.intent_text).toBe("发到公众号大号");
    expect(state.intent.explicit_constraints).toEqual(["终稿，不再改稿"]);
    expect(state.source_body_path).not.toBeNull();
  });

  test("ingest-handoff accepts workflow_handoff materials and routes to writer", async () => {
    const workspace = await makeTempDir("zzhub-workflow-handoff-materials-");
    const materialsPath = join(workspace, "materials.md");
    const handoffPath = join(workspace, "workflow-handoff.json");
    await writeFile(materialsPath, "素材A\n素材B", "utf-8");
    await writeFile(
      handoffPath,
      JSON.stringify({
        workflow_handoff: {
          content_form: "article",
          materials_path: materialsPath,
          target_account: "default",
          title: "素材接管测试",
          user_intent_text: "用这些素材写一篇公众号文章发到大号",
          research_policy: "skip",
          authoring_policy: "write_from_materials",
          review_policy: "required",
        },
      }),
      "utf-8",
    );

    const output = await captureJsonOutput<{
      accepted_handoff: { authoring_policy: string; materials_attached: boolean };
      next_action: {
        action: string;
        executor: string;
        command: string | null;
        params?: { source_materials_path?: string; worker_mode?: string };
      };
      summary: { state_path: string };
    }>(() =>
      ingestHandoff([
        "--workspace",
        workspace,
        "--file",
        handoffPath,
      ]));

    expect(output.accepted_handoff.authoring_policy).toBe("write_from_materials");
    expect(output.accepted_handoff.materials_attached).toBe(true);
    expect(output.next_action.action).toBe("attach-body");
    expect(output.next_action.executor).toBe("worker");
    expect(output.next_action.command).toBeNull();
    expect(output.next_action.params?.worker_mode).toBe("write-from-materials");
    expect(output.next_action.params?.source_materials_path).toContain("source-materials");

    const state = await readState(output.summary.state_path);
    expect(state.source_body_path).toBeNull();
    expect(state.handoff.source_materials_path).not.toBeNull();
    expect(state.handoff.authoring_policy).toBe("write_from_materials");
  });

  test("ingest-handoff can resume a task and trust user review", async () => {
    const workspace = await makeTempDir("zzhub-workflow-handoff-resume-");
    const statePath = join(workspace, ".zzhub-media", "runs", "resume-target.json");
    const sourcePath = join(workspace, "source.md");
    const formattedPath = join(workspace, "formatted.md");
    const handoffPath = join(workspace, "resume-handoff.json");
    await mkdir(join(workspace, ".zzhub-media", "runs"), { recursive: true });
    await writeFile(sourcePath, "原始正文", "utf-8");
    await writeFile(formattedPath, "格式化正文", "utf-8");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "resume-target";
    state.intent.content_form = "article";
    state.intent.targets = ["wechat"];
    state.intent.content_origin = "user";
    state.intent.intent_text = "发到公众号大号";
    state.route.primary = "wechat-article";
    state.route.account = "default";
    state.source_body_path = sourcePath;
    state.formatted_body_path = formattedPath;
    state.metadata.title = "接管终稿";
    state.metadata.slug = "resume-target";
    state.metadata.date = "2026-04-21";
    state.content_review.status = "unchecked";
    await writeState(statePath, state);

    await writeFile(
      handoffPath,
      JSON.stringify({
        workflow_handoff: {
          mode: "resume",
          state_path: statePath,
          review_policy: "trust_user",
          authoring_policy: "format_only",
        },
      }),
      "utf-8",
    );

    const output = await captureJsonOutput<{
      accepted_handoff: { review_policy: string };
      next_action: { action: string; executor: string; command: string | null };
    }>(() =>
      ingestHandoff([
        "--workspace",
        workspace,
        "--file",
        handoffPath,
      ]));

    expect(output.accepted_handoff.review_policy).toBe("trust_user");
    expect(output.next_action.action).toBe("prepare-finalize");
    expect(output.next_action.executor).toBe("cli");
    expect(output.next_action.command).toBe(`zzhub-pipeline prepare-finalize --state "${statePath}"`);

    const updated = await readState(statePath);
    expect(updated.content_review.status).toBe("passed");
    expect(updated.handoff.review_policy).toBe("trust_user");
  });
});

describe("task views", () => {
  test("status renders an agent-friendly markdown summary", async () => {
    const workspace = await makeTempDir("zzhub-status-view-");
    const statePath = join(workspace, "state.json");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-status-view";
    state.intent.content_form = "newspic";
    state.intent.targets = ["wechat"];
    state.intent.content_origin = "user";
    state.route.primary = "wechat-newspic";
    state.route.account = "default";
    state.metadata.title = "天气真好";
    state.mode = "active";
    await writeState(statePath, state);

    const output = await captureTextOutput(() =>
      status([
        "--state",
        statePath,
        "--view",
        "agent",
      ]));

    expect(output).toContain("# Current Task");
    expect(output).toContain("`run-status-view`");
    expect(output).toContain("`wechat-newspic`");
    expect(output).toContain("default (大号 / 早早集市)");
    expect(output).toContain("## Next Action");
    expect(output).toContain("Executor:");
    // next_action.params should be shown in agent view
    expect(output).toContain("**Params**");
    expect(output).toContain("state_path:");
  });

  test("status renders a machine-friendly agent-json view", async () => {
    const workspace = await makeTempDir("zzhub-status-agent-json-");
    const statePath = join(workspace, "state.json");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-agent-json";
    state.intent.content_form = "article";
    state.intent.targets = ["wechat"];
    state.intent.content_origin = "user";
    state.route.primary = "wechat-article";
    state.route.account = "default";
    state.source_body_path = join(workspace, "source.md");
    state.formatted_body_path = join(workspace, "formatted.md");
    state.metadata.title = "Agent JSON 测试";
    state.metadata.slug = "agent-json-test";
    state.metadata.date = "2026-04-21";
    state.content_review.status = "passed";
    await writeState(statePath, state);

    const output = await captureTextOutput(() =>
      status([
        "--state",
        statePath,
        "--view",
        "agent-json",
      ]));

    const payload = JSON.parse(output) as {
      next_action: {
        action: string;
        executor: string;
        command: string | null;
        params?: { formatted_body_path?: string };
      };
    };
    expect(payload.next_action.action).toBe("prepare-finalize");
    expect(payload.next_action.executor).toBe("cli");
    expect(payload.next_action.command).toBe(`zzhub-pipeline prepare-finalize --state "${statePath}"`);
    expect(payload.next_action.params?.formatted_body_path).toBe(join(workspace, "formatted.md"));
  });

  test("tasks renders a markdown table view", async () => {
    const workspace = await makeTempDir("zzhub-tasks-view-");
    const runRoot = join(workspace, ".zzhub-media", "runs");
    await mkdir(runRoot, { recursive: true });

    const statePath = join(runRoot, "run.json");
    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-table-view";
    state.intent.content_form = "article";
    state.intent.targets = ["wechat"];
    state.intent.content_origin = "user";
    state.route.primary = "wechat-article";
    state.route.account = "ancientone";
    state.metadata.title = "任务列表测试";
    await writeState(statePath, state);

    const output = await captureTextOutput(() =>
      tasks([
        "--workspace",
        workspace,
        "--view",
        "markdown",
      ]));

    expect(output).toContain("# Task List");
    expect(output).toContain("| Run ID | Title | Route | Account | Mode | Phase | Next |");
    expect(output).toContain("`run-table-view`");
    expect(output).toContain("任务列表测试");
  });

  test("find-run renders the matching task in agent view", async () => {
    const workspace = await makeTempDir("zzhub-find-view-");
    const initOutput = await captureJsonOutput<{ state_path: string }>(() =>
      init([
        "--workspace",
        workspace,
        "--task-kind",
        "publish",
        "--content-form",
        "article",
        "--targets",
        "wechat",
        "--content-origin",
        "user",
        "--intent-text",
        "发公众号文章给小号",
      ]));

    const output = await captureTextOutput(() =>
      findRun([
        "--workspace",
        workspace,
        "--active",
        "--view",
        "agent",
      ]));

    const state = await readState(initOutput.state_path);
    expect(output).toContain(state.run_id);
    expect(output).toContain("ancientone (小号 / 古一)");
    expect(output).toContain("## Missing");
  });

  test("status rejects stray positional arguments instead of silently resolving another task", async () => {
    const workspace = await makeTempDir("zzhub-status-positional-");
    const statePath = join(workspace, "state.json");
    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-positional";
    await writeState(statePath, state);

    await expect(async () => {
      await status(["run-positional", "--view", "agent"]);
    }).toThrow("Unexpected positional arguments");
  });
});

describe("authoring resolution", () => {
  test("throws when content origin is unknown", () => {
    expect(() =>
      resolveAuthoring({
        contentOrigin: "unknown",
        styleHint: null,
        hasStyleRequest: false,
      })
    ).toThrow("content_origin is unknown");
  });
});

describe("prepare", () => {
  test("replacing a reviewed body invalidates prepare and downstream state", async () => {
    const workspace = await makeTempDir("zzhub-attach-revision-");
    const statePath = join(workspace, "workflow-state.json");
    const state = defaultState();
    state.run_id = "run-attach-revision";
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.asset_path = join(workspace, "posts", "existing");
    state.formatted_body_path = join(workspace, "old-formatted.md");
    state.metadata.title = "Existing";
    state.metadata.slug = "existing";
    state.metadata.date = "2026-04-08";
    state.content_review = { status: "needs_revision", feedback: "Rewrite this" };
    state.phase.prepare.status = "done";
    state.phase.render.status = "done";
    state.phase.publish.status = "done";
    state.phase.current = "done";
    state.mode = "done";
    state.images.plan.status = "rendered";
    state.images.render_assets = [{
      kind: "cover",
      route: "wechat-article",
      path: join(workspace, "old-cover.png"),
    }];
    await writeState(statePath, state);

    await captureJsonOutput(() => attachBody([
      "--state",
      statePath,
      "--body-text",
      "# Revised\n\nNew body",
    ]));

    const updated = await readState(statePath);
    expect(updated.formatted_body_path).toBeNull();
    expect(updated.content_review.status).toBe("unchecked");
    expect(updated.phase.current).toBe("prepare");
    expect(updated.phase.render.status).toBe("pending");
    expect(updated.images.render_assets).toEqual([]);
    const task = await getTaskByStatePath(statePath);
    expect(task.next_action.action).toBe("prepare");
  });

  test("uses managed temp paths for inline attached body and default formatted output", async () => {
    const workspace = await makeTempDir("zzhub-prepare-managed-");
    const statePath = join(workspace, "state.json");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-managed";
    state.intent.content_form = "article";
    state.intent.targets = ["wechat"];
    state.intent.content_origin = "user";
    await writeState(statePath, state);

    await captureJsonOutput(() =>
      attachBody([
        "--state",
        statePath,
        "--body-text",
        "# Fresh Heading\n正文内容",
      ]));

    const prepared = await captureJsonOutput<{ body_formatted_path: string }>(() =>
      prepare([
        "--state",
        statePath,
      ]));

    const updated = await readState(statePath);
    const bodyOut = await readFile(prepared.body_formatted_path, "utf-8");

    expect(updated.source_body_path).toBe(
      join(workspace, ".zzhub-media", "tmp", "run-managed", "source-body.md"),
    );
    expect(updated.formatted_body_path).toBe(
      join(workspace, ".zzhub-media", "tmp", "run-managed", "formatted-body.md"),
    );
    expect(prepared.body_formatted_path).toBe(
      join(workspace, ".zzhub-media", "tmp", "run-managed", "formatted-body.md"),
    );
    expect(bodyOut).toContain("## Fresh Heading");
  });

  test("reuses existing metadata title and strips frontmatter from body output", async () => {
    const workspace = await makeTempDir("zzhub-prepare-");
    const statePath = join(workspace, "state.json");
    const bodyPath = join(workspace, "body.md");
    const bodyOutPath = join(workspace, "body-out.md");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-1";
    state.intent.content_form = "article";
    state.intent.content_origin = "user";
    state.metadata.title = "Existing Title";
    await writeState(statePath, state);

    await writeFile(
      bodyPath,
      '---\ntitle: "Ignored"\n---\n# Fresh Heading\n正文内容',
      "utf-8",
    );

    await prepare([
      "--state",
      statePath,
      "--body",
      bodyPath,
      "--body-out",
      bodyOutPath,
    ]);

    const updated = await readState(statePath);
    const bodyOut = await readFile(bodyOutPath, "utf-8");

    expect(updated.metadata.title).toBe("Existing Title");
    expect(updated.source_body_path).toBe(
      join(workspace, ".zzhub-media", "tmp", "run-1", "source-body.md"),
    );
    expect(bodyOut.startsWith("---")).toBe(false);
    expect(bodyOut).toContain("## Fresh Heading");
  });

  test("preserves canonical route fields during revision-style prepare reruns", async () => {
    const workspace = await makeTempDir("zzhub-prepare-revision-");
    const statePath = join(workspace, "state.json");
    const bodyPath = join(workspace, "body.md");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-revision";
    state.asset_path = join(workspace, "posts", "2026-04-08-existing");
    state.intent.content_form = "article";
    state.intent.targets = ["wechat", "blog"];
    state.intent.content_origin = "user";
    state.route.primary = "wechat-article";
    state.route.extras = [];
    state.route.account = "ancientone";
    state.route.content_profile = "storytelling";
    await writeState(statePath, state);
    await writeFile(bodyPath, "正文", "utf-8");

    await prepare([
      "--state",
      statePath,
      "--body",
      bodyPath,
    ]);

    const updated = await readState(statePath);
    expect(updated.route.primary).toBe("wechat-article");
    expect(updated.route.extras).toEqual([]);
    expect(updated.route.account).toBe("ancientone");
    expect(updated.route.content_profile).toBe("storytelling");
  });

  test("clears stale article body_inputs when markers disappear", async () => {
    const workspace = await makeTempDir("zzhub-prepare-body-inputs-");
    const statePath = join(workspace, "state.json");
    const bodyPath = join(workspace, "body.md");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-body-inputs";
    state.asset_path = join(workspace, "posts", "2026-04-08-existing");
    state.intent.content_form = "article";
    state.intent.targets = ["wechat"];
    state.intent.content_origin = "user";
    state.route.primary = "wechat-article";
    state.images.body_inputs = {
      scope: "article",
      expected: 2,
      received: [{ marker: "插图1", path: "/tmp/img-1.png" }],
      status: "pending",
      layout: "staggered",
    };
    await writeState(statePath, state);
    await writeFile(bodyPath, "这是改过后的正文，没有任何插图标记。", "utf-8");

    await prepare([
      "--state",
      statePath,
      "--body",
      bodyPath,
    ]);

    const updated = await readState(statePath);
    expect(updated.images.body_inputs.scope).toBe("none");
    expect(updated.images.body_inputs.status).toBe("none");
    expect(updated.images.body_inputs.received).toEqual([]);
  });

  test("direct body replacement invalidates an existing review", async () => {
    const workspace = await makeTempDir("zzhub-prepare-review-reset-");
    const statePath = join(workspace, "state.json");
    const bodyPath = join(workspace, "replacement.md");
    const state = defaultState();
    state.run_id = "run-review-reset";
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.intent.content_form = "article";
    state.intent.content_origin = "user";
    state.content_review.status = "passed";
    await writeState(statePath, state);
    await writeFile(bodyPath, "# Replacement\n\nNew body", "utf-8");

    await prepare(["--state", statePath, "--body", bodyPath]);

    expect((await readState(statePath)).content_review.status).toBe("unchecked");
  });

  test("prepare --body clears a pending writer/style redo_hint so status does not loop to revise-content", async () => {
    const workspace = await makeTempDir("zzhub-prepare-redohint-");
    const statePath = join(workspace, "state.json");
    const bodyPath = join(workspace, "revised.md");
    const state = defaultState();
    state.run_id = "run-redohint";
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.source_body_path = join(workspace, "old.md");
    state.intent.content_form = "article";
    state.intent.content_origin = "user";
    state.redo_hint = "style";
    state.phase.prepare.status = "pending";
    await writeState(statePath, state);
    await writeFile(bodyPath, "# Revised\n\nPolished body", "utf-8");

    await prepare(["--state", statePath, "--body", bodyPath]);

    const updated = await readState(statePath);
    expect(updated.redo_hint).toBeNull();
    const task = await getTaskByStatePath(statePath);
    expect(task.next_action.action).not.toBe("revise-content");
  });

  test("prepare recomputes requires.render/publish from route instead of OR-accumulating", async () => {
    const workspace = await makeTempDir("zzhub-prepare-requires-");
    const statePath = join(workspace, "state.json");
    const bodyPath = join(workspace, "post.md");
    const state = defaultState();
    state.run_id = "run-requires";
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.source_body_path = bodyPath;
    state.intent.task_kind = "publish";
    state.intent.content_form = "article";
    state.intent.content_origin = "user";
    // Previously required render for a wechat route.
    state.intent.requires.render = true;
    state.intent.requires.publish = true;
    state.phase.prepare.status = "pending";
    // Switch the task to an explicit blog-only target.
    state.publish_targets = [{ route: "blog", account: "default" }];
    state.route.primary = "blog";
    state.route.extras = [];
    state.route.account = "default";
    await writeState(statePath, state);
    await writeFile(bodyPath, "# Blog only\n\nBody", "utf-8");

    await prepare(["--state", statePath]);

    const updated = await readState(statePath);
    expect(updated.route.primary).toBe("blog");
    expect(updated.intent.requires.render).toBe(false);
    expect(updated.intent.requires.publish).toBe(true);
  });
});

describe("render", () => {
  test("rejects rendering content that has not passed review", async () => {
    const workspace = await makeTempDir("zzhub-render-review-");
    const assetPath = join(workspace, "posts", "review-gate");
    const statePath = join(assetPath, "workflow-state.json");
    await mkdir(assetPath, { recursive: true });
    await writeFile(join(assetPath, "post.md"), "Body", "utf-8");
    const state = defaultState();
    state.run_id = "run-review-gate";
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.asset_path = assetPath;
    state.metadata.title = "Review gate";
    state.metadata.slug = "review-gate";
    state.metadata.date = "2026-04-10";
    await writeState(statePath, state);

    await expect(render(["--state", statePath, "--skip-render"]))
      .rejects.toThrow("content_review.status");
  });

  test("respects explicit newspic multi-page render intent and page image markers", async () => {
    const workspace = await makeTempDir("zzhub-render-spec-");
    const assetPath = join(workspace, "posts", "2026-04-10-newspic");
    const statePath = join(assetPath, "workflow-state.json");
    const postPath = join(assetPath, "post.md");

    await mkdir(assetPath, { recursive: true });
    await writeFile(
      postPath,
      [
        "---",
        'title: "Spec Newspic"',
        "---",
        "这是一段原本会走短贴图路径的正文。",
      ].join("\n"),
      "utf-8",
    );

    const state = defaultState();
    state.workspace_root = workspace;
    state.asset_path = assetPath;
    state.state_path = statePath;
    state.run_id = "run-spec";
    state.route.primary = "wechat-newspic";
    state.metadata.title = "Spec Newspic";
    state.metadata.slug = "spec-newspic";
    state.metadata.date = "2026-04-10";
    state.content_review.status = "passed";
    state.intent.newspic_render = {
      pagination_mode: "multi",
      min_pages: 2,
      max_pages: 0,
      require_image_every_page: true,
      default_image_layout: "staggered",
      target_fill_ratio: 0.8,
      page_specs: [
        { page: 1, image_markers: ["插图1", "插图2"], image_layout: null, target_fill_ratio: null, note: null },
        { page: 2, image_markers: ["插图3"], image_layout: null, target_fill_ratio: null, note: null },
      ],
    };
    await writeState(statePath, state);

    await render(["--state", statePath, "--skip-render"]);

    const updated = await readState(statePath);
    expect(updated.images.plan.template).toBe("longform-3-4");
    expect(updated.images.body_inputs.scope).toBe("newspic-longform");
    expect(updated.images.body_inputs.expected).toBe(3);
    expect(updated.images.body_inputs.status).toBe("pending");
    expect(updated.images.body_inputs.layout).toBe("staggered");
  });

  test("preserves previously collected longform body images on resume", async () => {
    const workspace = await makeTempDir("zzhub-render-");
    const assetPath = join(workspace, "posts", "2026-04-08-longform");
    const statePath = join(assetPath, "workflow-state.json");
    const postPath = join(assetPath, "post.md");

    await mkdir(assetPath, { recursive: true });
    await writeFile(
      postPath,
      [
        "---",
        'title: "Longform"',
        "---",
        "第一段内容，足够长，用来介绍背景，并且长度足以进入长图文路径。",
        "",
        "第二段内容，继续展开细节，补充上下文和关键信息，保持正文长度稳定。",
        "",
        "第三段内容，用来稳定进入 longform 路径，同时不给标记计数制造重复噪音。",
        "",
        "插图1",
        "插图2",
      ].join("\n"),
      "utf-8",
    );

    const state = defaultState();
    state.workspace_root = workspace;
    state.asset_path = assetPath;
    state.state_path = statePath;
    state.run_id = "run-2";
    state.route.primary = "wechat-newspic";
    state.intent.newspic_render = {
      pagination_mode: "multi",
      min_pages: 2,
      max_pages: 0,
      require_image_every_page: false,
      default_image_layout: "staggered",
      target_fill_ratio: 0.8,
      page_specs: [],
    };
    state.metadata.title = "Longform";
    state.metadata.slug = "longform";
    state.metadata.date = "2026-04-08";
    state.content_review.status = "passed";
    state.images.body_inputs = {
      scope: "newspic-longform",
      expected: 2,
      received: [
        { marker: "插图1", path: "/tmp/img-1.png" },
        { marker: "插图2", path: "/tmp/img-2.png" },
      ],
      status: "ready",
      layout: "staggered",
    };
    await writeState(statePath, state);

    await render(["--state", statePath, "--skip-render"]);

    const updated = await readState(statePath);
    expect(updated.images.body_inputs.received).toHaveLength(2);
    expect(updated.images.body_inputs.status).toBe("ready");
    expect(updated.images.body_inputs.received[0]?.path).toBe("/tmp/img-1.png");
  });

  test("passes poster render args as plain strings without JSON quoting", async () => {
    const workspace = await makeTempDir("zzhub-render-poster-");
    const assetPath = join(workspace, "posts", "2026-04-09-recordly");
    const statePath = join(assetPath, "workflow-state.json");
    const postPath = join(assetPath, "post.md");
    const argsLogPath = join(workspace, "render-card-args.json");

    await mkdir(assetPath, { recursive: true });
    await writeFile(
      postPath,
      [
        "---",
        'title: "Recordly：开源跨平台录屏与演示视频编辑工具"',
        "---",
        "这是一段短正文，用来稳定走 poster-3-4 短贴图路径。",
      ].join("\n"),
      "utf-8",
    );

    const state = defaultState();
    state.workspace_root = workspace;
    state.asset_path = assetPath;
    state.state_path = statePath;
    state.run_id = "run-poster";
    state.route.primary = "wechat-newspic";
    state.route.account = "default";
    state.route.highlight_words = ["开源", "录屏"];
    state.route.account_visual_params = {
      footer: "公众号 · 早早集市",
      bg: "#e6f5ef",
      highlight: "#22a854",
      fallback_icon: "assets/icons/logo.png",
    };
    state.metadata.title = "Recordly：开源跨平台录屏与演示视频编辑工具";
    state.metadata.slug = "recordly";
    state.metadata.date = "2026-04-09";
    state.content_review.status = "passed";
    await writeState(statePath, state);

    const previousLogPath = process.env.TEST_RENDER_CARD_ARGS_PATH;
    const previousStubFlag = process.env.TEST_RENDER_CARD_STUB;
    process.env.TEST_RENDER_CARD_ARGS_PATH = argsLogPath;
    process.env.TEST_RENDER_CARD_STUB = "1";
    try {
      await render(["--state", statePath]);
    } finally {
      if (previousLogPath === undefined) {
        delete process.env.TEST_RENDER_CARD_ARGS_PATH;
      } else {
        process.env.TEST_RENDER_CARD_ARGS_PATH = previousLogPath;
      }
      if (previousStubFlag === undefined) {
        delete process.env.TEST_RENDER_CARD_STUB;
      } else {
        process.env.TEST_RENDER_CARD_STUB = previousStubFlag;
      }
    }

    const args = JSON.parse(await readFile(argsLogPath, "utf-8")) as string[];
    expect(args).toContain("--text");
    expect(args[args.indexOf("--text") + 1]).toBe("Recordly");
    expect(args).toContain("--footer");
    expect(args[args.indexOf("--footer") + 1]).toBe("公众号 · 早早集市");
    expect(args.filter((value) => value === "--highlight-words")).toHaveLength(1);
    expect(args[args.indexOf("--highlight-words") + 1]).toBe("开源,录屏");
  });
});

describe("prepare-finalize", () => {
  test("falls back to state.formatted_body_path when --body is omitted", async () => {
    const workspace = await makeTempDir("zzhub-finalize-managed-");
    const initOutput = await captureJsonOutput<{ state_path: string }>(() =>
      init([
        "--workspace",
        workspace,
        "--task-kind",
        "publish",
        "--content-form",
        "article",
        "--targets",
        "wechat",
        "--content-origin",
        "user",
        "--intent-text",
        "发公众号文章给大号",
        "--requires-render",
        "--requires-publish",
      ]));

    await attachBody([
      "--state",
      initOutput.state_path,
      "--body-text",
      "第一段\n\n第二段",
    ]);

    const prepared = await captureJsonOutput<{ body_formatted_path: string }>(() =>
      prepare([
        "--state",
        initOutput.state_path,
        "--suggested-title",
        "省掉隐藏路径这件事",
      ]));

    await review([
      "--state",
      initOutput.state_path,
      "--status",
      "passed",
    ]);

    const finalized = await captureJsonOutput<{ state_path: string; post_path: string }>(() =>
      prepareFinalize([
        "--state",
        initOutput.state_path,
      ]));

    const post = await readFile(finalized.post_path, "utf-8");
    expect(post).toContain("第一段");
    const state = await readState(finalized.state_path);
    expect(state.formatted_body_path).toBe(prepared.body_formatted_path);
  });

  test("creates a suffixed asset path when a new run collides with an existing slug/date", async () => {
    const workspace = await makeTempDir("zzhub-finalize-");
    const existingAssetPath = join(workspace, "posts", "2026-04-08-same-slug");
    const statePath = join(workspace, ".zzhub-media", "runs", "run-3.json");
    const bodyPath = join(workspace, "body.md");

    await mkdir(existingAssetPath, { recursive: true });
    await writeFile(bodyPath, "正文", "utf-8");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-3";
    state.metadata.title = "Same Slug";
    state.metadata.slug = "same-slug";
    state.metadata.date = "2026-04-08";
    state.content_review.status = "passed";
    await writeState(statePath, state);

    await prepareFinalize([
      "--state",
      statePath,
      "--body",
      bodyPath,
      "--workspace",
      workspace,
    ]);

    const updated = await readState(statePath);
    expect(updated.metadata.slug).toBe("same-slug-v2");
    expect(updated.asset_path.endsWith("2026-04-08-same-slug-v2")).toBe(true);
  });

  test("reserves distinct asset paths when two tasks finalize concurrently", async () => {
    const workspace = await makeTempDir("zzhub-finalize-concurrent-");
    const bodyPath = join(workspace, "body.md");
    await writeFile(bodyPath, "正文", "utf-8");

    const statePaths = ["run-a", "run-b"].map((runId) =>
      join(workspace, ".zzhub-media", "runs", `${runId}.json`));
    for (let index = 0; index < statePaths.length; index += 1) {
      const state = defaultState();
      state.workspace_root = workspace;
      state.state_path = statePaths[index];
      state.run_id = `run-${index}`;
      state.metadata.title = "Concurrent";
      state.metadata.slug = "concurrent";
      state.metadata.date = "2026-04-08";
      state.content_review.status = "passed";
      await writeState(statePaths[index], state);
    }

    await Promise.all(statePaths.map((statePath) =>
      prepareFinalize([
        "--state",
        statePath,
        "--body",
        bodyPath,
        "--workspace",
        workspace,
      ])));

    const finalized = await Promise.all(statePaths.map((statePath) => readState(statePath)));
    expect(new Set(finalized.map((state) => state.asset_path)).size).toBe(2);
    expect(finalized.map((state) => state.asset_path).sort()).toEqual([
      join(workspace, "posts", "2026-04-08-concurrent"),
      join(workspace, "posts", "2026-04-08-concurrent-v2"),
    ]);
  });

  test("reuses the canonical asset path during revision-style finalization", async () => {
    const workspace = await makeTempDir("zzhub-finalize-reuse-");
    const assetPath = join(workspace, "posts", "2026-04-08-existing");
    const statePath = join(assetPath, "workflow-state.json");
    const bodyPath = join(workspace, "body.md");

    await mkdir(assetPath, { recursive: true });
    await writeFile(bodyPath, "更新后的正文", "utf-8");

    const state = defaultState();
    state.workspace_root = workspace;
    state.asset_path = assetPath;
    state.state_path = statePath;
    state.run_id = "run-4";
    state.metadata.title = "Existing";
    state.metadata.slug = "existing";
    state.metadata.date = "2026-04-08";
    state.content_review.status = "passed";
    await writeState(statePath, state);

    await prepareFinalize([
      "--state",
      statePath,
      "--body",
      bodyPath,
      "--workspace",
      workspace,
    ]);

    const updated = await readState(statePath);
    expect(updated.asset_path).toBe(assetPath);
    expect(updated.metadata.slug).toBe("existing");
  });

  test("writes assets under posts/yyyy-MM/{title} when configured", async () => {
    const workspace = await makeTempDir("zzhub-finalize-pattern-");
    const statePath = join(workspace, ".zzhub-media", "runs", "run-5.json");
    const bodyPath = join(workspace, "body.md");

    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify(
        {
          paths: {
            workspaceRoot: workspace,
            postsPathPattern: "{yyyy-MM}/{title}",
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    await writeFile(bodyPath, "正文", "utf-8");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-5";
    state.metadata.title = "A Better Workflow";
    state.metadata.slug = "a-better-workflow";
    state.metadata.date = "2026-04-08";
    state.content_review.status = "passed";
    await writeState(statePath, state);

    await prepareFinalize([
      "--state",
      statePath,
      "--body",
      bodyPath,
    ]);

    const updated = await readState(statePath);
    expect(updated.asset_path).toBe(
      join(workspace, "posts", "2026-04", "A Better Workflow"),
    );
  });

  test("copies inline markdown images into the asset directory", async () => {
    const workspace = await makeTempDir("zzhub-finalize-inline-assets-");
    const bodySourceDir = join(workspace, "source");
    const assetImagePath = join(bodySourceDir, "demo.jpg");
    const bodyPath = join(workspace, "body.md");
    const statePath = join(workspace, ".zzhub-media", "runs", "run-6.json");

    await mkdir(bodySourceDir, { recursive: true });
    await writeFile(assetImagePath, "demo-image", "utf-8");
    await writeFile(bodyPath, '正文段落\n\n![示例](./demo.jpg "Demo")\n', "utf-8");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-6";
    state.source_body_path = join(bodySourceDir, "article.md");
    state.metadata.title = "Inline Asset";
    state.metadata.slug = "inline-asset";
    state.metadata.date = "2026-04-08";
    state.content_review.status = "passed";
    await writeState(statePath, state);

    await prepareFinalize([
      "--state",
      statePath,
      "--body",
      bodyPath,
      "--workspace",
      workspace,
    ]);

    const updated = await readState(statePath);
    const postPath = join(updated.asset_path, "post.md");
    const postContent = await readFile(postPath, "utf-8");
    const copiedImage = join(updated.asset_path, "demo.jpg");
    const copiedImageContent = await readFile(copiedImage, "utf-8");

    expect(postContent).toContain('![示例](./demo.jpg "Demo")');
    expect(copiedImageContent).toBe("demo-image");
  });

  test("removes the duplicated leading title heading from canonical post.md", async () => {
    const workspace = await makeTempDir("zzhub-finalize-title-heading-");
    const bodyPath = join(workspace, "body.md");
    const statePath = join(workspace, ".zzhub-media", "runs", "run-7.json");

    await writeFile(bodyPath, "## Inline Asset\n\n第一段正文\n", "utf-8");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-7";
    state.metadata.title = "Inline Asset";
    state.metadata.slug = "inline-asset";
    state.metadata.date = "2026-04-08";
    state.content_review.status = "passed";
    await writeState(statePath, state);

    await prepareFinalize([
      "--state",
      statePath,
      "--body",
      bodyPath,
      "--workspace",
      workspace,
    ]);

    const updated = await readState(statePath);
    const postContent = await readFile(join(updated.asset_path, "post.md"), "utf-8");

    expect(postContent).not.toContain("## Inline Asset");
    expect(postContent).toContain("第一段正文");
  });
});

describe("text", () => {
  test("stripLeadingH1 removes the leading title block only", () => {
    const input = "\n# 标题\n\n第一段\n\n## 小节\n";
    expect(stripLeadingH1(input)).toBe("\n第一段\n\n## 小节\n");
  });

  test("stripLeadingTitleHeading removes a duplicated top title heading", () => {
    const input = "\n## 标题\n\n第一段\n";
    expect(stripLeadingTitleHeading(input, "标题")).toBe("\n第一段\n");
  });
});

describe("config", () => {
  test("reports malformed config instead of silently using defaults", async () => {
    await writeFile(TEST_CONFIG_PATH, "{ invalid json", "utf-8");
    expect(() => loadConfig()).toThrow("Failed to read pipeline config");
  });

  test("uses configured workspace root when workspace is omitted", async () => {
    const workspace = await makeTempDir("zzhub-config-root-");

    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify(
        {
          paths: {
            workspaceRoot: workspace,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    expect(resolveWorkspaceRoot(undefined)).toBe(workspace);
  });

  test("init falls back to configured workspace root", async () => {
    const workspace = await makeTempDir("zzhub-init-config-root-");

    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify(
        {
          paths: {
            workspaceRoot: workspace,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (value?: unknown) => {
      logs.push(typeof value === "string" ? value : String(value));
    };

    try {
      await init([
        "--task-kind",
        "publish",
        "--content-form",
        "article",
        "--targets",
        "wechat",
        "--content-origin",
        "user",
      ]);
    } finally {
      console.log = originalLog;
    }

    const output = JSON.parse(logs.at(-1) ?? "{}") as { state_path?: string };
    expect(output.state_path?.startsWith(join(workspace, ".zzhub-media", "runs"))).toBe(true);
  });

  test("init persists newspic render spec from a JSON file", async () => {
    const workspace = await makeTempDir("zzhub-init-newspic-spec-");
    const specPath = join(workspace, "newspic-spec.json");

    await writeFile(
      specPath,
      JSON.stringify(
        {
          pagination_mode: "multi",
          min_pages: 3,
          require_image_every_page: true,
          default_image_layout: "editorial",
          target_fill_ratio: 0.82,
          page_specs: [
            { page: 1, image_markers: ["插图1", "插图2"], target_fill_ratio: 0.88 },
            { page: 2, image_markers: ["插图3"] },
          ],
        },
        null,
        2,
      ),
      "utf-8",
    );

    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (value?: unknown) => {
      logs.push(typeof value === "string" ? value : String(value));
    };

    try {
      await init([
        "--workspace",
        workspace,
        "--task-kind",
        "publish",
        "--content-form",
        "newspic",
        "--targets",
        "wechat",
        "--content-origin",
        "user",
        "--newspic-render-spec-file",
        specPath,
      ]);
    } finally {
      console.log = originalLog;
    }

    const output = JSON.parse(logs.at(-1) ?? "{}") as { state_path?: string };
    const state = await readState(output.state_path!);
    expect(state.intent.newspic_render?.pagination_mode).toBe("multi");
    expect(state.intent.newspic_render?.min_pages).toBe(3);
    expect(state.intent.newspic_render?.require_image_every_page).toBe(true);
    expect(state.intent.newspic_render?.default_image_layout).toBe("editorial");
    expect(state.intent.newspic_render?.target_fill_ratio).toBe(0.82);
    expect(state.intent.newspic_render?.page_specs[0]?.image_markers).toEqual(["插图1", "插图2"]);
    expect(state.intent.newspic_render?.page_specs[0]?.target_fill_ratio).toBe(0.88);
  });

  test("renders posts path patterns with safe title segments", () => {
    const relativePath = renderPostsRelativePath(
      {
        paths: {
          workspaceRoot: null,
          postsDirName: "posts",
          postsPathPattern: "{yyyy-MM}/{title}",
          blogRoot: null,
          zotepadExportHtml: null,
        },
        services: {
          zotepadBaseUrl: "http://127.0.0.1:54577",
          zotepadToken: "zotepad-dev-token",
        },
        commands: {
          blogPublish: ["pnpm", "publish:post"],
        },
        wx: {
          baseUrl: "https://api.example.com",
          timeout: 30000,
          defaultAccount: "default",
          accounts: {
            default: {
              name: "",
              pat: "",
              appId: "",
              appSecret: "",
              customCss: null,
              theme: { editorVars: {}, exportTheme: {} },
            },
          },
        },
        cos: {
          pat: "",
          baseUrl: null,
          publicBaseUrl: "https://img.example.com",
        },
        plugins: {
          imageRenderer: null,
          markdownRenderer: null,
        },
        imgx: {
          icon: null,
        },
      },
      {
        date: "2026-04-08",
        slug: "ignored-slug",
        title: "Agent / Prompt: 编排",
      },
    );

    expect(relativePath).toBe("2026-04/Agent - Prompt- 编排");
  });

  test("resolves workspace paths from defaults without hardcoded absolute roots", () => {
    const paths = resolveWorkspacePaths("/tmp/workspace");
    expect(paths.postsRoot).toBe("/tmp/workspace/posts");
    expect(paths.tempRoot).toBe("/tmp/workspace/.zzhub-media/tmp");
    expect(paths.blogRoot).toBe("/tmp/workspace/blog");
    expect(paths.zotepadExportHtml).toBe("/tmp/workspace/zotepad-exports/html/post.html");
  });
});

describe("publish validation", () => {
  test("blocks publish when content review has not passed and article images are still pending", async () => {
    const workspace = await makeTempDir("zzhub-publish-validate-");
    const statePath = join(workspace, "state.json");
    const state = defaultState();

    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-publish";
    state.asset_path = join(workspace, "posts", "2026-04-08-existing");
    state.phase.current = "publish";
    state.phase.prepare.status = "done";
    state.phase.render.status = "done";
    state.intent.content_form = "article";
    state.intent.targets = ["wechat"];
    state.intent.content_origin = "user";
    state.intent.requires.render = true;
    state.intent.requires.publish = true;
    state.route.primary = "wechat-article";
    state.metadata.title = "Existing";
    state.metadata.slug = "existing";
    state.metadata.date = "2026-04-08";
    state.content_review.status = "unchecked";
    state.images.plan.needed = true;
    state.images.plan.status = "rendered";
    state.images.body_inputs = {
      scope: "article",
      expected: 1,
      received: [],
      status: "pending",
      layout: "staggered",
    };

    await writeState(statePath, state);

    const errors = validateForPhase(state, "publish");
    expect(errors.map((item) => item.field)).toContain("content_review.status");
    expect(errors.map((item) => item.field)).toContain("images.body_inputs.status");

    await expect(
      publish(["--state", statePath, "--dry-run"]),
    ).rejects.toThrow("Publish validation failed");
  });

  test("keeps publish failures retryable instead of switching to handoff", async () => {
    const workspace = await makeTempDir("zzhub-publish-retry-");
    const assetPath = join(workspace, "posts", "2026-04-08-existing");
    const statePath = join(assetPath, "workflow-state.json");
    const blogRoot = join(workspace, "blog");
    const state = defaultState();

    await mkdir(assetPath, { recursive: true });
    await writeFile(join(assetPath, "post.md"), "正文", "utf-8");
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify({
        paths: {
          workspaceRoot: workspace,
          blogRoot,
        },
        commands: {
          blogPublish: ["false"],
        },
      }),
      "utf-8",
    );

    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-publish-retry";
    state.asset_path = assetPath;
    state.phase.current = "publish";
    state.phase.prepare.status = "done";
    state.phase.render.status = "done";
    state.intent.requires.render = true;
    state.intent.requires.publish = true;
    state.route.primary = "blog";
    state.metadata.title = "Existing";
    state.metadata.slug = "existing";
    state.metadata.date = "2026-04-08";
    state.content_review.status = "passed";
    await writeState(statePath, state);

    await publish(["--state", statePath]);

    const updated = await readState(statePath);
    expect(updated.mode).toBe("active");
    expect(updated.phase.current).toBe("publish");
    expect(updated.phase.publish.status).toBe("pending");
    expect(updated.publish.results[0]?.status).toBe("failed");
    expect(updated.publish.results[0]?.detail).toContain("blog publish command failed");
    const blogPost = await readFile(
      join(blogRoot, "content", "nezus", "2026", "04", "existing.md"),
      "utf-8",
    );
    expect(blogPost).toContain("author: Kairos");

    const task = await getTaskByStatePath(statePath);
    expect(task.blockers).toEqual([]);
    expect(task.next_action.action).toBe("publish");
  });
});

describe("blog sync", () => {
  test("sync-blog copies canonical markdown to the blog repo without joining workflow routing", async () => {
    const workspace = await makeTempDir("zzhub-blog-sync-");
    const assetPath = join(workspace, "posts", "2026-04-10-demo");
    const statePath = join(assetPath, "workflow-state.json");
    const postPath = join(assetPath, "post.md");
    const blogRoot = join(workspace, "blog");

    await mkdir(assetPath, { recursive: true });
    await mkdir(blogRoot, { recursive: true });
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify(
        {
          paths: {
            workspaceRoot: workspace,
            blogRoot,
          },
        },
        null,
        2,
      ),
      "utf-8",
    );
    await writeFile(postPath, "---\ntitle: Demo\n---\n\n正文内容\n", "utf-8");

    const state = defaultState();
    state.workspace_root = workspace;
    state.asset_path = assetPath;
    state.state_path = statePath;
    state.run_id = "20260410-130000-blog11";
    state.metadata.title = "Demo";
    state.metadata.slug = "demo";
    state.metadata.date = "2026-04-10";
    await writeState(statePath, state);

    const result = await captureJsonOutput<{ route: string; status: string }>(() =>
      syncBlog(["--state", statePath, "--dry-run"]),
    );
    expect(result.route).toBe("blog");
    expect(result.status).toBe("skipped");
  });
});

describe("cos upload", () => {
  test("uploads a local image with configured COS settings", async () => {
    await writeFile(
      TEST_CONFIG_PATH,
      JSON.stringify({
        wx: { baseUrl: "https://hub.example" },
        cos: { pat: "cos-pat-123", publicBaseUrl: "https://img.example.com" },
      }),
      "utf-8",
    );
    const workspace = await makeTempDir("zzhub-cos-upload-");
    const filePath = join(workspace, "cover.png");
    await writeFile(filePath, "fake image", "utf-8");

    const upload = createCosUploadCommand(async (input) => {
      expect(input).toEqual({
        localPath: filePath,
        folder: "notes/note-1",
        baseUrl: "https://hub.example",
        cosPat: "cos-pat-123",
        publicBaseUrl: "https://img.example.com",
      });
      return {
        localPath: filePath,
        key: "notes/note-1/cover.png",
        url: "https://img.example/notes/note-1/cover.png",
      };
    });

    const output = await captureJsonOutput<{
      local_path: string;
      key: string;
      url: string;
      markdown: string;
    }>(() => upload(["--file", filePath, "--folder", "notes/note-1", "--alt", "封面"]));

    expect(output).toEqual({
      local_path: filePath,
      key: "notes/note-1/cover.png",
      url: "https://img.example/notes/note-1/cover.png",
      markdown: "![封面](https://img.example/notes/note-1/cover.png)",
    });
  });
});

describe("managed tasks", () => {
  test("commands passed a run snapshot update canonical state", async () => {
    const workspace = await makeTempDir("zzhub-canonical-command-");
    const runPath = join(workspace, ".zzhub-media", "runs", "run-command.json");
    const canonicalPath = join(workspace, "posts", "canonical", "workflow-state.json");
    const runState = defaultState();
    runState.run_id = "run-command";
    runState.workspace_root = workspace;
    runState.state_path = canonicalPath;
    await writeState(runPath, runState);
    await writeState(canonicalPath, structuredClone(runState));

    await captureJsonOutput(() => review([
      "--state",
      runPath,
      "--status",
      "passed",
    ]));

    expect((await readState(canonicalPath)).content_review.status).toBe("passed");
    expect((await readState(runPath)).content_review.status).toBe("unchecked");
    const task = await getTaskByStatePath(runPath);
    expect(task.summary.state_path).toBe(canonicalPath);
    expect(task.state.content_review.status).toBe("passed");
  });

  test("init writes a collision-resistant run id and timestamps", async () => {
    const workspace = await makeTempDir("zzhub-managed-init-");
    const output = await captureJsonOutput<{ run_id: string; state_path: string }>(() =>
      init([
        "--workspace",
        workspace,
        "--task-kind",
        "publish",
        "--content-form",
        "article",
        "--targets",
        "wechat",
        "--content-origin",
        "user",
        "--requires-render",
        "--requires-publish",
      ]),
    );

    expect(output.run_id).toMatch(/^\d{8}-\d{6}-[a-z0-9]{6}$/);

    const state = await readState(output.state_path);
    expect(state.created_at).toBeTruthy();
    expect(state.updated_at).toBeTruthy();
  });

  test("tasks lists canonical tasks and status reports next action", async () => {
    const workspace = await makeTempDir("zzhub-managed-list-");
    const runStatePath = join(workspace, ".zzhub-media", "runs", "task-1.json");
    const assetPath = join(workspace, "posts", "2026-04", "Managed Task");
    const canonicalPath = join(assetPath, "workflow-state.json");

    await mkdir(join(workspace, ".zzhub-media", "runs"), { recursive: true });
    await mkdir(assetPath, { recursive: true });

    const state = defaultState();
    state.run_id = "20260410-120000-abc123";
    state.workspace_root = workspace;
    state.state_path = canonicalPath;
    state.asset_path = assetPath;
    state.created_at = "2026-04-10T12:00:00.000Z";
    state.updated_at = "2026-04-10T12:05:00.000Z";
    state.intent.task_kind = "publish";
    state.intent.content_form = "newspic";
    state.intent.targets = ["wechat"];
    state.intent.content_origin = "user";
    state.intent.requires.render = true;
    state.intent.requires.publish = true;
    state.route.primary = "wechat-newspic";
    state.route.account = "default";
    state.metadata.title = "Managed Task";
    state.metadata.slug = "managed-task";
    state.metadata.date = "2026-04-10";
    state.content_review.status = "passed";
    state.phase.current = "render";
    state.images.body_inputs = {
      scope: "newspic-longform",
      expected: 2,
      received: [{ marker: "插图1", path: "/tmp/1.png" }],
      status: "pending",
      layout: "staggered",
    };

    await writeState(runStatePath, state);
    await writeState(canonicalPath, state);

    const listed = await captureJsonOutput<Array<{
      summary: { run_id: string; route: { primary: string; account: string } };
      next_action: { action: string };
      blockers: Array<{ code: string }>;
    }>>(() => tasks(["--workspace", workspace]));

    expect(listed).toHaveLength(1);
    expect(listed[0]?.summary.run_id).toBe("20260410-120000-abc123");
    expect(listed[0]?.summary.route.primary).toBe("wechat-newspic");
    expect(listed[0]?.next_action.action).toBe("attach-body-images");
    expect(listed[0]?.blockers.map((item) => item.code)).toContain("missing-body-images");

    const taskStatus = await captureJsonOutput<{
      summary: { run_id: string };
      next_action: { action: string };
      blockers: Array<{ code: string }>;
    }>(() => status(["--workspace", workspace, "--run-id", "20260410-120000-abc123"]));

    expect(taskStatus.summary.run_id).toBe("20260410-120000-abc123");
    expect(taskStatus.next_action.action).toBe("attach-body-images");

    const found = await captureJsonOutput<{ run_id: string; route: { account: string; primary: string } }>(() =>
      findRun(["--workspace", workspace, "--route", "wechat-newspic"]),
    );
    expect(found.run_id).toBe("20260410-120000-abc123");
    expect(found.route.account).toBe("default");
  });

  test("material attachments let pipeline infer the next missing step", async () => {
    const workspace = await makeTempDir("zzhub-managed-materials-");
    const bodyPath = join(workspace, "body.md");
    const specPath = join(workspace, "newspic-spec.json");
    const imagesPath = join(workspace, "images.json");

    const initOutput = await captureJsonOutput<{ state_path: string; run_id: string }>(() =>
      init([
        "--workspace",
        workspace,
        "--task-kind",
        "publish",
        "--content-form",
        "newspic",
        "--targets",
        "wechat",
        "--content-origin",
        "user",
        "--requires-render",
        "--requires-publish",
      ]),
    );

    await writeFile(
      bodyPath,
      [
        "恋爱关系排行（7个人格）",
        "",
        "第一段解释整体排行逻辑。",
        "",
        "第二段解释为什么每一类人格都值得单独成图。",
        "",
        "第三段补充结论，保证贴图会进入多图路径。",
        "",
        "插图1",
        "插图2",
      ].join("\n"),
      "utf-8",
    );
    await writeFile(
      specPath,
      JSON.stringify(
        {
          pagination_mode: "multi",
          min_pages: 2,
          require_image_every_page: true,
          target_fill_ratio: 0.8,
          page_specs: [
            { page: 1, image_markers: ["插图1"], target_fill_ratio: null },
            { page: 2, image_markers: ["插图2"], target_fill_ratio: null },
          ],
        },
        null,
        2,
      ),
      "utf-8",
    );
    await writeFile(
      imagesPath,
      JSON.stringify(
        [
          { marker: "插图1", path: "/tmp/attach-1.png" },
          { marker: "插图2", path: "/tmp/attach-2.png" },
        ],
        null,
        2,
      ),
      "utf-8",
    );

    await captureJsonOutput(() => attachBody(["--state", initOutput.state_path, "--body", bodyPath]));
    await captureJsonOutput(() => attachNewspicSpec(["--state", initOutput.state_path, "--file", specPath]));
    await captureJsonOutput(() =>
      attachBodyImages([
        "--state",
        initOutput.state_path,
        "--images-file",
        imagesPath,
        "--scope",
        "newspic-longform",
      ]),
    );

    const afterAttachments = await captureJsonOutput<{
      summary: { images: { body_inputs: { status: string; expected: number } } };
      next_action: { action: string };
      blockers: Array<{ code: string }>;
    }>(() => status(["--state", initOutput.state_path]));

    expect(afterAttachments.summary.images.body_inputs.status).toBe("ready");
    expect(afterAttachments.summary.images.body_inputs.expected).toBe(2);
    expect(afterAttachments.next_action.action).toBe("prepare");
    expect(afterAttachments.blockers).toEqual([]);

    await prepare([
      "--state",
      initOutput.state_path,
      "--body",
      bodyPath,
    ]);

    const afterPrepare = await captureJsonOutput<{
      next_action: { action: string };
    }>(() => reconcile(["--state", initOutput.state_path]));
    expect(afterPrepare.next_action.action).toBe("review-content");

    await review([
      "--state",
      initOutput.state_path,
      "--status",
      "passed",
    ]);

    const afterReview = await captureJsonOutput<{
      next_action: { action: string };
    }>(() => status(["--state", initOutput.state_path]));
    expect(afterReview.next_action.action).toBe("prepare-finalize");
  });

  test("wechat article materials can be attached externally and resumed to publish", async () => {
    const workspace = await makeTempDir("zzhub-managed-article-materials-");
    const bodyPath = join(workspace, "body.md");
    const imagesPath = join(workspace, "images.json");

    const initOutput = await captureJsonOutput<{ state_path: string }>(() =>
      init([
        "--workspace",
        workspace,
        "--task-kind",
        "publish",
        "--content-form",
        "article",
        "--targets",
        "wechat",
        "--content-origin",
        "user",
        "--requires-render",
        "--requires-publish",
      ]),
    );

    await writeFile(
      bodyPath,
      [
        "这是一篇需要插图的公众号文章。",
        "",
        "第一部分铺垫背景。",
        "",
        "插图1",
        "",
        "第二部分继续展开结论。",
      ].join("\n"),
      "utf-8",
    );
    await writeFile(
      imagesPath,
      JSON.stringify([{ marker: "插图1", path: "/tmp/article-1.png" }], null, 2),
      "utf-8",
    );

    await captureJsonOutput(() => attachBody(["--state", initOutput.state_path, "--body", bodyPath]));
    await captureJsonOutput(() =>
      attachBodyImages([
        "--state",
        initOutput.state_path,
        "--images-file",
        imagesPath,
        "--scope",
        "article",
      ]),
    );

    const afterAttachments = await captureJsonOutput<{
      summary: { images: { body_inputs: { status: string; expected: number } } };
      next_action: { action: string };
    }>(() => status(["--state", initOutput.state_path]));
    expect(afterAttachments.summary.images.body_inputs.status).toBe("ready");
    expect(afterAttachments.summary.images.body_inputs.expected).toBe(1);
    expect(afterAttachments.next_action.action).toBe("prepare");

    await prepare([
      "--state",
      initOutput.state_path,
      "--body",
      bodyPath,
    ]);
    await review([
      "--state",
      initOutput.state_path,
      "--status",
      "passed",
    ]);
    await prepareFinalize([
      "--state",
      initOutput.state_path,
      "--body",
      bodyPath,
      "--workspace",
      workspace,
    ]);

    const beforeRender = await captureJsonOutput<{
      next_action: { action: string };
    }>(() => status(["--state", initOutput.state_path]));
    expect(beforeRender.next_action.action).toBe("render");

    const previousLogPath = process.env.TEST_RENDER_CARD_ARGS_PATH;
    const previousStubFlag = process.env.TEST_RENDER_CARD_STUB;
    process.env.TEST_RENDER_CARD_STUB = "1";
    process.env.TEST_RENDER_CARD_ARGS_PATH = join(workspace, "article-render-log.json");
    try {
      await render(["--state", initOutput.state_path]);
    } finally {
      if (previousLogPath === undefined) {
        delete process.env.TEST_RENDER_CARD_ARGS_PATH;
      } else {
        process.env.TEST_RENDER_CARD_ARGS_PATH = previousLogPath;
      }
      if (previousStubFlag === undefined) {
        delete process.env.TEST_RENDER_CARD_STUB;
      } else {
        process.env.TEST_RENDER_CARD_STUB = previousStubFlag;
      }
    }

    await publish(["--state", initOutput.state_path, "--dry-run"]);

    const finished = await captureJsonOutput<{
      summary: { mode: string; phase: { current: string } };
      next_action: { action: string };
    }>(() => status(["--state", initOutput.state_path]));
    expect(finished.summary.mode).toBe("active");
    expect(finished.summary.phase.current).toBe("publish");
    expect(finished.next_action.action).toBe("publish");
  });

  test("tasks and current-task queries handle multiple in-flight tasks", async () => {
    const workspace = await makeTempDir("zzhub-managed-parallel-");
    const runRoot = join(workspace, ".zzhub-media", "runs");
    await mkdir(runRoot, { recursive: true });

    const activeOlderPath = join(runRoot, "active-older.json");
    const activeNewerPath = join(runRoot, "active-newer.json");
    const donePath = join(runRoot, "done.json");

    const activeOlder = defaultState();
    activeOlder.run_id = "20260410-100000-older1";
    activeOlder.workspace_root = workspace;
    activeOlder.state_path = activeOlderPath;
    activeOlder.created_at = "2026-04-10T10:00:00.000Z";
    activeOlder.updated_at = "2026-04-10T10:10:00.000Z";
    activeOlder.intent.content_form = "article";
    activeOlder.intent.targets = ["wechat"];
    activeOlder.intent.content_origin = "user";
    activeOlder.intent.requires.render = true;
    activeOlder.intent.requires.publish = true;
    activeOlder.source_body_path = "/tmp/older.md";
    activeOlder.metadata.title = "Older Active";
    activeOlder.metadata.slug = "older-active";
    activeOlder.metadata.date = "2026-04-10";
    activeOlder.route.primary = "wechat-article";
    activeOlder.route.account = "default";
    activeOlder.phase.current = "prepare";
    await writeState(activeOlderPath, activeOlder);

    const activeNewer = defaultState();
    activeNewer.run_id = "20260410-110000-newer1";
    activeNewer.workspace_root = workspace;
    activeNewer.state_path = activeNewerPath;
    activeNewer.created_at = "2026-04-10T11:00:00.000Z";
    activeNewer.updated_at = "2026-04-10T11:30:00.000Z";
    activeNewer.intent.content_form = "newspic";
    activeNewer.intent.targets = ["wechat"];
    activeNewer.intent.content_origin = "user";
    activeNewer.intent.requires.render = true;
    activeNewer.intent.requires.publish = true;
    activeNewer.source_body_path = "/tmp/newer.md";
    activeNewer.metadata.title = "Newer Active";
    activeNewer.metadata.slug = "newer-active";
    activeNewer.metadata.date = "2026-04-10";
    activeNewer.route.primary = "wechat-newspic";
    activeNewer.route.account = "big";
    activeNewer.phase.current = "render";
    activeNewer.images.body_inputs = {
      scope: "newspic-longform",
      expected: 2,
      received: [{ marker: "插图1", path: "/tmp/a.png" }],
      status: "pending",
      layout: "staggered",
    };
    await writeState(activeNewerPath, activeNewer);

    const done = defaultState();
    done.run_id = "20260410-090000-done11";
    done.workspace_root = workspace;
    done.state_path = donePath;
    done.created_at = "2026-04-10T09:00:00.000Z";
    done.updated_at = "2026-04-10T09:30:00.000Z";
    done.intent.content_form = "article";
    done.intent.targets = ["wechat"];
    done.intent.content_origin = "user";
    done.metadata.title = "Done Task";
    done.metadata.slug = "done-task";
    done.metadata.date = "2026-04-10";
    done.route.primary = "wechat-article";
    done.mode = "done";
    done.phase.current = "done";
    done.phase.prepare.status = "done";
    done.phase.render.status = "done";
    done.phase.publish.status = "done";
    await writeState(donePath, done);

    const activeTasks = await captureJsonOutput<Array<{ summary: { run_id: string } }>>(() =>
      tasks(["--workspace", workspace, "--active"]),
    );
    expect(activeTasks.map((item) => item.summary.run_id)).toEqual([
      "20260410-110000-newer1",
      "20260410-100000-older1",
    ]);

    const currentTask = await captureJsonOutput<{
      run_id: string;
      route: { account: string; primary: string };
    }>(() => findRun(["--workspace", workspace, "--active"]));
    expect(currentTask.run_id).toBe("20260410-110000-newer1");
    expect(currentTask.route.account).toBe("big");

    const currentStatus = await captureJsonOutput<{
      summary: { run_id: string };
      next_action: { action: string };
    }>(() => status(["--workspace", workspace]));
    expect(currentStatus.summary.run_id).toBe("20260410-110000-newer1");
    expect(currentStatus.next_action.action).toBe("attach-body-images");
  });

  test("active task filtering excludes stale tasks whose phase is already done", async () => {
    const workspace = await makeTempDir("zzhub-active-filter-");
    const runRoot = join(workspace, ".zzhub-media", "runs");
    await mkdir(runRoot, { recursive: true });

    const stalePath = join(runRoot, "stale.json");
    const freshPath = join(runRoot, "fresh.json");

    const stale = defaultState();
    stale.run_id = "20260410-120000-stale1";
    stale.workspace_root = workspace;
    stale.state_path = stalePath;
    stale.mode = "active";
    stale.phase.current = "done";
    stale.metadata.title = "Stale Done";
    await writeState(stalePath, stale);

    const fresh = defaultState();
    fresh.run_id = "20260410-130000-fresh1";
    fresh.workspace_root = workspace;
    fresh.state_path = freshPath;
    fresh.mode = "active";
    fresh.phase.current = "prepare";
    fresh.metadata.title = "Fresh Active";
    await writeState(freshPath, fresh);

    const activeTasks = await captureJsonOutput<Array<{ summary: { run_id: string } }>>(() =>
      tasks(["--workspace", workspace, "--active"]),
    );

    expect(activeTasks.map((item) => item.summary.run_id)).toEqual([
      "20260410-130000-fresh1",
    ]);
  });

  test("can resume from an interrupted mid-task state and preview publish", async () => {
    const workspace = await makeTempDir("zzhub-managed-resume-");
    const bodyPath = join(workspace, "body.md");

    await writeFile(
      bodyPath,
      [
        "恢复测试标题",
        "",
        "这是一段正文，用来模拟从中途中断后继续执行。",
      ].join("\n"),
      "utf-8",
    );

    const initOutput = await captureJsonOutput<{ state_path: string }>(() =>
      init([
        "--workspace",
        workspace,
        "--task-kind",
        "publish",
        "--content-form",
        "article",
        "--targets",
        "wechat",
        "--content-origin",
        "user",
        "--requires-render",
        "--requires-publish",
      ]),
    );

    await captureJsonOutput(() => attachBody(["--state", initOutput.state_path, "--body", bodyPath]));
    await prepare([
      "--state",
      initOutput.state_path,
      "--body",
      bodyPath,
    ]);
    await review([
      "--state",
      initOutput.state_path,
      "--status",
      "passed",
    ]);
    await prepareFinalize([
      "--state",
      initOutput.state_path,
      "--body",
      bodyPath,
      "--workspace",
      workspace,
    ]);

    const interrupted = await captureJsonOutput<{
      summary: { phase: { current: string } };
      next_action: { action: string };
    }>(() => status(["--state", initOutput.state_path]));
    expect(interrupted.summary.phase.current).toBe("render");
    expect(interrupted.next_action.action).toBe("render");

    const previousLogPath = process.env.TEST_RENDER_CARD_ARGS_PATH;
    const previousStubFlag = process.env.TEST_RENDER_CARD_STUB;
    process.env.TEST_RENDER_CARD_STUB = "1";
    process.env.TEST_RENDER_CARD_ARGS_PATH = join(workspace, "render-log.json");
    try {
      await render(["--state", initOutput.state_path]);
    } finally {
      if (previousLogPath === undefined) {
        delete process.env.TEST_RENDER_CARD_ARGS_PATH;
      } else {
        process.env.TEST_RENDER_CARD_ARGS_PATH = previousLogPath;
      }
      if (previousStubFlag === undefined) {
        delete process.env.TEST_RENDER_CARD_STUB;
      } else {
        process.env.TEST_RENDER_CARD_STUB = previousStubFlag;
      }
    }

    const afterRender = await captureJsonOutput<{
      summary: { phase: { current: string } };
      next_action: { action: string };
    }>(() => status(["--state", initOutput.state_path]));
    expect(afterRender.summary.phase.current).toBe("publish");
    expect(afterRender.next_action.action).toBe("publish");

    await publish(["--state", initOutput.state_path, "--dry-run"]);

    const completed = await captureJsonOutput<{
      summary: { mode: string; phase: { current: string } };
      next_action: { action: string };
    }>(() => status(["--state", initOutput.state_path]));
    expect(completed.summary.mode).toBe("active");
    expect(completed.summary.phase.current).toBe("publish");
    expect(completed.next_action.action).toBe("publish");
  });

  test("keeps render as the next action after finalize when init uses underscore flags", async () => {
    const workspace = await makeTempDir("zzhub-newspic-render-");

    const initOutput = await captureJsonOutput<{ state_path: string }>(() =>
      init([
        "--workspace",
        workspace,
        "--task-kind",
        "publish",
        "--content-form",
        "newspic",
        "--targets",
        "wechat",
        "--content-origin",
        "user",
        "--intent-text",
        "写一篇公众号贴图，发到大号",
        "--requires_render",
        "--requires_publish",
      ]));

    await captureJsonOutput(() =>
      attachBody([
        "--state",
        initOutput.state_path,
        "--body-text",
        "今天天气太好了。\n\n阳光很好，风也很轻，适合出门走一走，把心情也晒亮一点。",
      ]));

    const prepared = await captureJsonOutput<{ body_formatted_path: string }>(() =>
      prepare([
        "--state",
        initOutput.state_path,
        "--intent-text",
        "写一篇公众号贴图，发到大号",
        "--suggested-title",
        "今天天气太好了。",
      ]));

    await review([
      "--state",
      initOutput.state_path,
      "--status",
      "passed",
    ]);

    const finalized = await captureJsonOutput<{ state_path: string }>(() =>
      prepareFinalize([
        "--state",
        initOutput.state_path,
        "--body",
        prepared.body_formatted_path,
      ]));

    const taskStatus = await captureJsonOutput<{
      next_action: { action: string };
      summary: { phase: { current: string } };
    }>(() => status(["--state", finalized.state_path]));

    expect(taskStatus.summary.phase.current).toBe("render");
    expect(taskStatus.next_action.action).toBe("render");
  });
});

describe("newspic_render default behavior", () => {
  test("does not auto-infer pagination_mode — defaults to single", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "zzhub-infer-spec-"));
    const initOutput = await captureJsonOutput<{ state_path: string }>(() =>
      init([
        "--workspace", tmpDir,
        "--task-kind", "publish",
        "--content-form", "newspic",
        "--targets", "wechat",
        "--content-origin", "user",
        "--intent-text", "写一篇公众号贴图，发到大号",
        "--requires_render",
      ]),
    );

    const longBody = "段落一：" + "AI技术正在改变世界。".repeat(15) + "\n\n"
      + "段落二：" + "大模型的能力越来越强。".repeat(15) + "\n\n"
      + "段落三：" + "未来的应用场景无限广阔。".repeat(15);

    await attachBody(["--state", initOutput.state_path, "--body-text", longBody]);

    const finalState = await readState(initOutput.state_path);
    // Default is "single" — no auto-inference from content length
    expect(finalState.intent.newspic_render?.pagination_mode ?? "single").toBe("single");
  });
});

describe("publish_targets and multi-account", () => {
  test("PublishResult schema accepts account field with default", () => {
    const state = WorkflowStateSchema.parse({});
    // publish.results should accept items with account field
    const result = {
      route: "wechat-article" as const,
      account: "ancientone",
      status: "success" as const,
      detail: null,
      published_at: "2026-06-14T10:00:00Z",
      content_version: 1,
      render_version: 1,
    };
    state.publish.results.push(result);
    const parsed = WorkflowStateSchema.parse(state);
    expect(parsed.publish.results[0].account).toBe("ancientone");
  });

  test("PublishResult defaults account to 'default' when missing", () => {
    const result = {
      route: "wechat-article",
      status: "success",
      detail: null,
      published_at: null,
      content_version: 0,
      render_version: 0,
    };
    const state = WorkflowStateSchema.parse({
      publish: { results: [result] },
    });
    expect(state.publish.results[0].account).toBe("default");
  });

  test("publish_targets field defaults to empty array", () => {
    const state = WorkflowStateSchema.parse({});
    expect(state.publish_targets).toEqual([]);
  });

  test("publish_targets accepts array of {route, account}", () => {
    const state = WorkflowStateSchema.parse({
      publish_targets: [
        { route: "wechat-article", account: "default" },
        { route: "wechat-article", account: "ancientone" },
        { route: "blog", account: "default" },
      ],
    });
    expect(state.publish_targets).toHaveLength(3);
    expect(state.publish_targets[1].account).toBe("ancientone");
  });

  test("publish_targets account defaults to 'default' when omitted", () => {
    const state = WorkflowStateSchema.parse({
      publish_targets: [{ route: "blog" }],
    });
    expect(state.publish_targets[0].account).toBe("default");
  });
});

describe("provider accountOverride", () => {
  test("PublishRouteContext accepts accountOverride", () => {
    // Type-level test: this should compile
    const ctx: import("./providers").PublishRouteContext = {
      state: {} as any,
      dryRun: true,
      config: {} as any,
      workspacePaths: {} as any,
      accountOverride: "ancientone",
    };
    expect(ctx.accountOverride).toBe("ancientone");
  });
});

describe("PUBLISH_PROVIDERS", () => {
  test("blog is registered as publish provider", () => {
    const provider = getPublishProvider("blog");
    expect(provider).toBeDefined();
    expect(typeof provider).toBe("function");
  });

  test("listPublishProviders includes blog", () => {
    const providers = listPublishProviders();
    expect(providers).toContain("blog");
  });
});

describe("executePublishTargets helpers", () => {
  test("dedupeTargets deduplicates by route+account", () => {
    const targets = [
      { route: "wechat-article" as const, account: "default" },
      { route: "wechat-article" as const, account: "default" },  // duplicate
      { route: "blog" as const, account: "default" },
    ];
    const deduped = dedupeTargets(targets);
    expect(deduped).toHaveLength(2);
  });

  test("filterIdempotent filters out already-published targets", () => {
    const targets = [
      { route: "wechat-article" as const, account: "default" },
      { route: "blog" as const, account: "default" },
    ];
    const existingResults = [
      {
        route: "wechat-article" as const,
        account: "default",
        status: "success" as const,
        detail: null,
        published_at: "2026-06-14T10:00:00Z",
        content_version: 1,
        render_version: 1,
      },
    ];
    const filtered = filterIdempotent(targets, existingResults, 1, 1);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].route).toBe("blog");
  });

  test("does not retry result persistence as a provider failure", async () => {
    const workspace = await makeTempDir("zzhub-persist-result-");
    const state = defaultState();
    state.workspace_root = workspace;
    state.asset_path = workspace;
    state.metadata.title = "Test";
    let persistenceCalls = 0;

    await expect(executePublishTargets({
      state,
      targets: [{ route: "wechat-article", account: "default" }],
      dryRun: true,
      config: loadConfig(),
      workspacePaths: resolveWorkspacePaths(workspace),
      onResult: async () => {
        persistenceCalls += 1;
        throw new Error("persistence failed");
      },
    })).rejects.toThrow("persistence failed");
    expect(persistenceCalls).toBe(1);
  });
});

describe("publish command with publish_targets", () => {
  test("publish iterates publish_targets when present", async () => {
    const tmpDir = await makeTempDir("zzhub-test-publish-targets-");
    const statePath = join(tmpDir, "state.json");
    const state = defaultState();
    state.run_id = "test-run";
    state.workspace_root = tmpDir;
    state.state_path = statePath;
    state.asset_path = tmpDir;
    state.route.primary = "wechat-article";
    state.route.account = "default";
    state.intent.content_form = "article";
    state.publish_targets = [
      { route: "wechat-article", account: "default" },
      { route: "wechat-article", account: "ancientone" },
    ];
    state.metadata.title = "Test";
    state.metadata.slug = "test";
    state.metadata.date = "2026-06-14";
    state.content_review.status = "passed";
    await writeFile(join(tmpDir, "post.md"), "正文", "utf-8");
    await writeState(statePath, state);

    const output = await captureJsonOutput<{
      publish_results: Array<{ account: string; status: string }>;
      dry_run: boolean;
    }>(() => publish(["--state", statePath, "--dry-run"]));

    const finalState = await readState(statePath);
    expect(finalState.publish.results).toHaveLength(0);
    expect(output.dry_run).toBe(true);
    expect(output.publish_results).toHaveLength(2);
    expect(output.publish_results[0].account).toBe("default");
    expect(output.publish_results[0].status).toBe("skipped");
    expect(output.publish_results[1].account).toBe("ancientone");
    expect(output.publish_results[1].status).toBe("skipped");
  });
});

describe("init with multi-target --targets", () => {
  test("single target leaves publish_targets empty", async () => {
    const tmpDir = await makeTempDir("zzhub-test-init-single-");
    const output = await captureJsonOutput<any>(() =>
      init([
        "--workspace", tmpDir,
        "--task-kind", "publish",
        "--content-form", "article",
        "--targets", "wechat-article",
        "--content-origin", "user",
        "--account", "default",
      ]),
    );
    const state = await readState(output.state_path);
    expect(state.publish_targets).toEqual([]);
    expect(state.route.primary).toBe("wechat-article");
    expect(state.route.account).toBe("default");
  });

  test("multi-target populates publish_targets", async () => {
    const tmpDir = await makeTempDir("zzhub-test-init-multi-");
    const output = await captureJsonOutput<any>(() =>
      init([
        "--workspace", tmpDir,
        "--task-kind", "publish",
        "--content-form", "article",
        "--targets", "wechat-article@default,wechat-article@ancientone,blog@default",
        "--content-origin", "user",
      ]),
    );
    const state = await readState(output.state_path);
    expect(state.publish_targets).toHaveLength(3);
    expect(state.publish_targets[0]).toEqual({ route: "wechat-article", account: "default" });
    expect(state.publish_targets[1]).toEqual({ route: "wechat-article", account: "ancientone" });
    expect(state.publish_targets[2]).toEqual({ route: "blog", account: "default" });
    expect(state.route.primary).toBe("wechat-article");
    expect(state.route.account).toBe("default");
  });

  test("--targets without @ uses --account value", async () => {
    const tmpDir = await makeTempDir("zzhub-test-init-no-at-");
    const output = await captureJsonOutput<any>(() =>
      init([
        "--workspace", tmpDir,
        "--task-kind", "publish",
        "--content-form", "article",
        "--targets", "wechat-article,blog",
        "--content-origin", "user",
        "--account", "ancientone",
      ]),
    );
    const state = await readState(output.state_path);
    expect(state.publish_targets).toHaveLength(2);
    expect(state.publish_targets[0].account).toBe("ancientone");
    expect(state.publish_targets[1].account).toBe("ancientone");
  });

  test("rejects mixed WeChat content routes", async () => {
    const tmpDir = await makeTempDir("zzhub-test-init-mixed-");
    await expect(init([
      "--workspace", tmpDir,
      "--task-kind", "publish",
      "--content-form", "article",
      "--targets", "wechat-article,wechat-newspic",
      "--content-origin", "user",
    ])).rejects.toThrow("cannot mix wechat-article and wechat-newspic");
  });

  test("preserves an explicit blog-only target through prepare", async () => {
    const tmpDir = await makeTempDir("zzhub-test-init-blog-");
    const output = await captureJsonOutput<any>(() =>
      init([
        "--workspace", tmpDir,
        "--task-kind", "publish",
        "--content-form", "article",
        "--targets", "blog@default",
        "--content-origin", "user",
        "--intent-text", "发布博客",
        "--requires-publish",
      ]),
    );

    await captureJsonOutput(() => attachBody([
      "--state", output.state_path,
      "--body-text", "# Blog post\n\nBody",
    ]));
    await captureJsonOutput(() => prepare(["--state", output.state_path]));

    const state = await readState(output.state_path);
    expect(state.route.primary).toBe("blog");
    expect(state.intent.requires.render).toBe(false);
    expect(getStatePublishTargets(state)).toEqual([
      { route: "blog", account: "default" },
    ]);
  });
});

test("getStatePublishTargets prefers explicit publish targets", () => {
  const state = defaultState();
  state.route.primary = "wechat-article";
  state.route.account = "default";
  state.publish_targets = [{ route: "blog", account: "default" }];

  expect(getStatePublishTargets(state)).toEqual([
    { route: "blog", account: "default" },
  ]);
});

test("getStatePublishTargets derives targets from the route as a fallback", () => {
  const state = defaultState();
  state.route.primary = "wechat-article";
  state.route.extras = ["blog"];
  state.route.account = "default";

  expect(getStatePublishTargets(state)).toEqual([
    { route: "wechat-article", account: "default" },
    { route: "blog", account: "default" },
  ]);
});

describe("republish command", () => {
  test("republish dry-run previews targets without mutating state", async () => {
    const tmpDir = await makeTempDir("zzhub-test-republish-");
    const statePath = join(tmpDir, "state.json");
    const state = defaultState();
    state.run_id = "test-run";
    state.workspace_root = tmpDir;
    state.asset_path = tmpDir;
    state.route.primary = "wechat-article";
    state.route.account = "default";
    state.metadata.title = "Test";
    state.metadata.slug = "test";
    state.metadata.date = "2026-06-14";
    state.content_review.status = "passed";
    state.mode = "done";
    state.publish.results = [
      {
        route: "wechat-article",
        account: "default",
        status: "success",
        detail: null,
        published_at: "2026-06-14T10:00:00Z",
        content_version: 1,
        render_version: 1,
      },
    ];
    await writeState(statePath, state);

    // Republish to another account with dry-run
    const output = await captureJsonOutput<{
      new_targets: Array<{ route: string; account: string }>;
      dry_run: boolean;
    }>(() => republish(["--state", statePath, "--account", "ancientone", "--dry-run"]));

    const finalState = await readState(statePath);
    expect(output.new_targets).toContainEqual({
      route: "wechat-article",
      account: "ancientone",
    });
    expect(output.dry_run).toBe(true);
    expect(finalState.publish_targets).toEqual([]);
    expect(finalState.publish.results).toHaveLength(1);
    expect(finalState.mode).toBe("done");
  });

  test("republish skips idempotent targets", async () => {
    const tmpDir = await makeTempDir("zzhub-test-republish-idem-");
    const statePath = join(tmpDir, "state.json");
    const state = defaultState();
    state.run_id = "test-run";
    state.workspace_root = tmpDir;
    state.asset_path = tmpDir;
    state.route.primary = "wechat-article";
    state.route.account = "default";
    state.metadata.title = "Test";
    state.metadata.slug = "test";
    state.metadata.date = "2026-06-14";
    state.content_review.status = "passed";
    state.mode = "done";
    state.artifacts.content_version = 1;
    state.artifacts.render_version = 1;
    state.publish.results = [
      {
        route: "wechat-article",
        account: "default",
        status: "success",
        detail: null,
        published_at: "2026-06-14T10:00:00Z",
        content_version: 1,
        render_version: 1,
      },
    ];
    await writeState(statePath, state);

    // Try to republish same target - should skip
    await republish(["--state", statePath, "--account", "default", "--dry-run"]);

    const finalState = await readState(statePath);
    // Should still have only 1 result (skipped duplicate)
    expect(finalState.publish.results).toHaveLength(1);
  });

  test("rejects a WeChat target incompatible with the content form", async () => {
    const tmpDir = await makeTempDir("zzhub-test-republish-route-");
    const statePath = join(tmpDir, "state.json");
    const state = defaultState();
    state.run_id = "test-run";
    state.workspace_root = tmpDir;
    state.asset_path = tmpDir;
    state.route.primary = "wechat-article";
    state.intent.content_form = "article";
    state.metadata.title = "Test";
    state.metadata.slug = "test";
    state.metadata.date = "2026-06-14";
    state.content_review.status = "passed";
    await writeState(statePath, state);

    await expect(republish([
      "--state", statePath,
      "--targets", "wechat-newspic@default",
      "--dry-run",
    ])).rejects.toThrow("cannot mix wechat-article and wechat-newspic");
  });
});
