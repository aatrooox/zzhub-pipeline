import { afterAll, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { defaultState, writeState } from "./state";
import { loadTaskState } from "./task-manager";

const TEST_CONFIG_PATH = join(
  tmpdir(),
  `zzhub-pipeline-test-config-loadtask-${process.pid}.json`,
);
process.env.ZZHUB_PIPELINE_CONFIG = TEST_CONFIG_PATH;

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

afterAll(async () => {
  await writeFile(TEST_CONFIG_PATH, "{}", "utf-8").catch(() => undefined);
});

describe("loadTaskState", () => {
  test("returns a reconciled view when body_inputs drift from the body on disk", async () => {
    const workspace = await makeTempDir("zzhub-loadtask-");
    const statePath = join(workspace, "workflow-state.json");
    const bodyPath = join(workspace, "post.md");

    const state = defaultState();
    state.run_id = "run-loadtask";
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.source_body_path = bodyPath;
    state.route.primary = "wechat-article";
    state.intent.content_form = "article";
    state.metadata.title = "T";
    state.metadata.slug = "t";
    state.metadata.date = "2026-04-10";
    state.phase.prepare.status = "done";
    // State claims one illustration input is pending, but the rewritten body
    // no longer contains any markers.
    state.images.body_inputs = {
      scope: "article",
      expected: 1,
      received: [],
      status: "pending",
      layout: "staggered",
    };
    await writeFile(bodyPath, "# T\n\nBody without any markers", "utf-8");
    await writeState(statePath, state);

    const resolved = await loadTaskState(statePath);

    expect(resolved.state.images.body_inputs.status).toBe("none");
    expect(resolved.state.images.body_inputs.expected).toBe(0);
  });
});
