import { describe, expect, test } from "bun:test";
import { mkdtemp, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { checkpoint } from "./checkpoint";
import { defaultState, writeState } from "../state";

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

async function captureTextOutput(fn: () => Promise<void>): Promise<string> {
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

describe("checkpoint", () => {
  test("reports validation passing for a well-formed prepare state", async () => {
    const configPath = join(tmpdir(), `zzhub-test-checkpoint-${process.pid}-${Date.now()}.json`);
    await writeFile(configPath, "{}", "utf-8");
    process.env.ZZHUB_PIPELINE_CONFIG = configPath;

    const workspace = await makeTempDir("zzhub-checkpoint-");
    const statePath = join(workspace, "state.json");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-checkpoint-1";
    state.phase.current = "prepare";
    await writeState(statePath, state);

    const output = await captureJsonOutput<{
      validation: { phase_checked: string; valid: boolean; errors: unknown[] };
      next_action: { action: string };
    }>(() => checkpoint(["--state", statePath]));

    expect(output.validation.phase_checked).toBe("prepare");
    expect(output.validation.valid).toBe(true);
    expect(output.validation.errors).toEqual([]);
    expect(output.next_action).toBeDefined();
  });

  test("agent view renders markdown with next action", async () => {
    const configPath = join(tmpdir(), `zzhub-test-checkpoint-${process.pid}-${Date.now()}.json`);
    await writeFile(configPath, "{}", "utf-8");
    process.env.ZZHUB_PIPELINE_CONFIG = configPath;

    const workspace = await makeTempDir("zzhub-checkpoint-view-");
    const statePath = join(workspace, "state.json");

    const state = defaultState();
    state.workspace_root = workspace;
    state.state_path = statePath;
    state.run_id = "run-checkpoint-view";
    state.route.primary = "wechat-article";
    state.metadata.title = "Test Title";
    await writeState(statePath, state);

    const output = await captureTextOutput(() =>
      checkpoint(["--state", statePath, "--view", "agent"]),
    );

    expect(output).toContain("# Current Task");
    expect(output).toContain("## Next Action");
  });
});
