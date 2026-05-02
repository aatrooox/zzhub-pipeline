import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { reset } from "./reset";
import { defaultState, readState, writeState } from "../state";

const TEST_CONFIG_PATH = join(tmpdir(), `zzhub-pipeline-test-config-reset-${process.pid}.json`);
process.env.ZZHUB_PIPELINE_CONFIG = TEST_CONFIG_PATH;

async function makeTempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function captureJsonOutput<T>(fn: () => Promise<void>): Promise<T> {
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
  return JSON.parse(lines.join("\n").trim()) as T;
}

beforeEach(async () => {
  await writeFile(TEST_CONFIG_PATH, "{}", "utf-8");
});

describe("reset", () => {
  test("mode=content resets all three phases and clears content_review", async () => {
    const workspace = await makeTempDir("zzhub-reset-content-");
    const statePath = join(workspace, "state.json");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-reset-content";
    state.phase.prepare = { status: "done", error: null };
    state.phase.render = { status: "done", error: null };
    state.phase.publish = { status: "done", error: null };
    state.phase.current = "done";
    state.content_review = { status: "passed", feedback: null };
    await writeState(statePath, state);

    const output = await captureJsonOutput<{ reset_mode: string; start_step: string | null }>(() =>
      reset(["--state", statePath, "--mode", "content"]),
    );

    expect(output.reset_mode).toBe("content");
    expect(output.start_step).toBe("writer");

    const updated = await readState(statePath);
    expect(updated.phase.prepare.status).toBe("pending");
    expect(updated.phase.render.status).toBe("pending");
    expect(updated.phase.publish.status).toBe("pending");
    expect(updated.phase.current).toBe("prepare");
    expect(updated.mode).toBe("active");
    expect(updated.content_review.status).toBe("unchecked");
    expect(updated.redo_hint).toBe("writer");
  });

  test("mode=render keeps prepare=done but resets render and publish", async () => {
    const workspace = await makeTempDir("zzhub-reset-render-");
    const statePath = join(workspace, "state.json");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-reset-render";
    state.phase.prepare = { status: "done", error: null };
    state.phase.render = { status: "done", error: null };
    state.phase.publish = { status: "done", error: null };
    state.phase.current = "done";
    await writeState(statePath, state);

    await captureJsonOutput(() => reset(["--state", statePath, "--mode", "render"]));

    const updated = await readState(statePath);
    expect(updated.phase.prepare.status).toBe("done");
    expect(updated.phase.render.status).toBe("pending");
    expect(updated.phase.publish.status).toBe("pending");
    expect(updated.phase.current).toBe("render");
    expect(updated.mode).toBe("active");
    expect(updated.redo_hint).toBeNull();
  });

  test("mode=redo.style sets redo_hint to style", async () => {
    const workspace = await makeTempDir("zzhub-reset-redo-");
    const statePath = join(workspace, "state.json");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-reset-redo";
    state.phase.prepare = { status: "done", error: null };
    state.phase.render = { status: "done", error: null };
    await writeState(statePath, state);

    const output = await captureJsonOutput<{ start_step: string | null }>(() =>
      reset(["--state", statePath, "--mode", "redo.style"]),
    );

    expect(output.start_step).toBe("style");

    const updated = await readState(statePath);
    expect(updated.redo_hint).toBe("style");
    expect(updated.phase.prepare.status).toBe("pending");
    expect(updated.phase.render.status).toBe("pending");
    expect(updated.phase.publish.status).toBe("pending");
    expect(updated.phase.current).toBe("prepare");
  });

  test("mode=full marks state as failed", async () => {
    const workspace = await makeTempDir("zzhub-reset-full-");
    const statePath = join(workspace, "state.json");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-reset-full";
    state.phase.prepare = { status: "done", error: null };
    await writeState(statePath, state);

    await captureJsonOutput(() => reset(["--state", statePath, "--mode", "full"]));

    const updated = await readState(statePath);
    expect(updated.mode).toBe("failed");
    expect(updated.phase.current).toBe("failed");
    expect(updated.content_review.status).toBe("unchecked");
    expect(updated.redo_hint).toBeNull();
  });

  test("invalid mode throws descriptive error", async () => {
    const workspace = await makeTempDir("zzhub-reset-invalid-");
    const statePath = join(workspace, "state.json");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    await writeState(statePath, state);

    expect(
      reset(["--state", statePath, "--mode", "bogus"]),
    ).rejects.toThrow("Invalid reset mode: bogus");
  });
});
