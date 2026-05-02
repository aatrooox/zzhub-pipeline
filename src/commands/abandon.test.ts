import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { abandon } from "./abandon";
import { defaultState, readState, writeState } from "../state";

const TEST_CONFIG_PATH = join(tmpdir(), `zzhub-pipeline-test-config-abandon-${process.pid}.json`);
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

describe("abandon", () => {
  test("abandon by --state sets mode to abandoned", async () => {
    const workspace = await makeTempDir("zzhub-abandon-state-");
    const statePath = join(workspace, "state.json");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-abandon-1";
    state.metadata.title = "To Abandon";
    await writeState(statePath, state);

    const output = await captureJsonOutput<Array<{ run_id: string; ok: boolean }>>(() =>
      abandon(["--state", statePath]),
    );

    expect(output).toHaveLength(1);
    expect(output[0].run_id).toBe("run-abandon-1");
    expect(output[0].ok).toBe(true);

    const updated = await readState(statePath);
    expect(updated.mode).toBe("abandoned");
  });

  test("abandon by --run-id finds and abandons the correct task", async () => {
    const workspace = await makeTempDir("zzhub-abandon-runid-");
    const runRoot = join(workspace, ".zzhub-media", "runs");
    await mkdir(runRoot, { recursive: true });

    const statePath1 = join(runRoot, "run-keep.json");
    const statePath2 = join(runRoot, "run-drop.json");

    const state1 = defaultState();
    state1.run_id = "run-keep";
    state1.workspace_root = workspace;
    state1.state_path = statePath1;
    state1.metadata.title = "Keep";
    await writeState(statePath1, state1);

    const state2 = defaultState();
    state2.run_id = "run-drop";
    state2.workspace_root = workspace;
    state2.state_path = statePath2;
    state2.metadata.title = "Drop";
    await writeState(statePath2, state2);

    const output = await captureJsonOutput<Array<{ run_id: string; ok: boolean }>>(() =>
      abandon(["--workspace", workspace, "--run-id", "run-drop"]),
    );

    expect(output).toHaveLength(1);
    expect(output[0].run_id).toBe("run-drop");
    expect(output[0].ok).toBe(true);

    const kept = await readState(statePath1);
    expect(kept.mode).toBe("active");

    const dropped = await readState(statePath2);
    expect(dropped.mode).toBe("abandoned");
  });

  test("abandon with non-existent --run-id throws", async () => {
    const workspace = await makeTempDir("zzhub-abandon-miss-");
    const runRoot = join(workspace, ".zzhub-media", "runs");
    await mkdir(runRoot, { recursive: true });

    expect(
      abandon(["--workspace", workspace, "--run-id", "nonexistent"]),
    ).rejects.toThrow("No task found with run_id: nonexistent");
  });
});
