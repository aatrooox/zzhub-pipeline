import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { RenderBroker } from "./render-broker";
import type { RenderJobSurface } from "./render-broker-types";
import { defaultState, writeState } from "../state";
import type { RasterTask } from "../imgx/runtime";

const TEST_CONFIG_PATH = join(
  tmpdir(),
  `zzhub-pipeline-test-broker-${process.pid}.json`,
);
process.env.ZZHUB_PIPELINE_CONFIG = TEST_CONFIG_PATH;

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

function pngSurface(workspace: string, id: string): RenderJobSurface {
  const task: RasterTask = { html: "<html></html>", width: 100, height: 100 };
  return {
    id,
    kind: "cover",
    route: "wechat-article",
    task,
    outPath: join(workspace, "posts", "x", "images", "wechat", `${id}.png`),
  };
}

// 1x1 transparent PNG, base64.
const PNG_1x1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

describe("RenderBroker", () => {
  let workspace: string;
  let statePath: string;

  beforeEach(async () => {
    workspace = await makeTempDir("zzhub-broker-");
    statePath = join(workspace, "workflow-state.json");
    const state = defaultState();
    state.run_id = "run-broker";
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.intent.requires.render = true;
    state.intent.requires.publish = true;
    state.asset_path = join(workspace, "posts", "x");
    state.metadata.title = "T";
    state.metadata.slug = "t";
    state.metadata.date = "2026-04-10";
    state.route.primary = "wechat-article";
    state.content_review = { status: "passed", feedback: null };
    state.phase.prepare = { status: "done", error: null };
    state.mode = "handoff";
    state.phase.render = { status: "handoff", error: null };
    state.phase.current = "render";
    await writeState(statePath, state);
  });

  afterEach(async () => {
    await rm(workspace, { recursive: true, force: true });
  });

  test("creates a pending job on disk", () => {
    const broker = new RenderBroker();
    const job = broker.createJob({
      workspaceRoot: workspace,
      runId: "run-broker",
      statePath,
      surfaces: [pngSurface(workspace, "cover")],
    });
    expect(job.status).toBe("pending");
    const fetched = broker.getJob(workspace, job.id);
    expect(fetched?.id).toBe(job.id);
    expect(fetched?.surfaces).toHaveLength(1);
  });

  test("submitResult writes PNGs and advances workflow state out of handoff", async () => {
    const broker = new RenderBroker();
    const job = broker.createJob({
      workspaceRoot: workspace,
      runId: "run-broker",
      statePath,
      surfaces: [pngSurface(workspace, "cover")],
    });

    const completed = await broker.submitResult(
      {
        jobId: job.id,
        results: [{ surfaceId: "cover", pngBase64: PNG_1x1_BASE64 }],
      },
      workspace,
    );

    expect(completed.assets).toHaveLength(1);
    expect(completed.assets[0]?.kind).toBe("cover");
    // PNG bytes were written.
    const bytes = await readFile(completed.assets[0]!.path);
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50);

    // Workflow state advanced to publish and cleared the handoff.
    const { readState } = await import("../state");
    const state = await readState(statePath);
    expect(state.phase.render.status).toBe("done");
    expect(state.phase.current).toBe("publish");
    expect(state.mode).toBe("active");
    expect(state.render_job_id).toBeNull();
    expect(state.images.render_assets).toHaveLength(1);
  });

  test("waitForCompletion resolves once submitResult fires", async () => {
    const broker = new RenderBroker();
    const job = broker.createJob({
      workspaceRoot: workspace,
      runId: "run-broker",
      statePath,
      surfaces: [pngSurface(workspace, "cover")],
    });

    const waiter = broker.waitForCompletion(job.id, 2000);
    // Submit on next microtask tick.
    queueMicrotask(() => {
      broker.submitResult(
        {
          jobId: job.id,
          results: [{ surfaceId: "cover", pngBase64: PNG_1x1_BASE64 }],
        },
        workspace,
      ).catch(() => undefined);
    });

    const completed = await waiter;
    expect(completed).not.toBeNull();
    expect(completed!.assets).toHaveLength(1);
  });
});
