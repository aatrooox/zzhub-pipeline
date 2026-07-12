import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import {
  acquireStateOperationLock,
  defaultState,
  readResolvedState,
  readState,
  updateState,
  writeState,
} from "./state";

async function makeTempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "zzhub-state-"));
}

describe("state persistence", () => {
  test("follows a temporary run snapshot to canonical state", async () => {
    const workspace = await makeTempDir();
    const runPath = join(workspace, ".zzhub-media", "runs", "run-1.json");
    const canonicalPath = join(workspace, "posts", "post-1", "workflow-state.json");
    const runState = defaultState();
    runState.run_id = "run-1";
    runState.workspace_root = workspace;
    runState.state_path = canonicalPath;
    runState.phase.current = "render";
    await writeState(runPath, runState);

    const canonicalState = structuredClone(runState);
    canonicalState.phase.current = "publish";
    await writeState(canonicalPath, canonicalState);

    const resolved = await readResolvedState(runPath);
    expect(resolved.redirected).toBe(true);
    expect(resolved.path).toBe(canonicalPath);
    expect(resolved.state.phase.current).toBe("publish");
  });

  test("fills the authoritative path for a legacy state without state_path", async () => {
    const workspace = await makeTempDir();
    const statePath = join(workspace, "legacy-state.json");
    const state = defaultState();
    state.run_id = "legacy-run";
    state.workspace_root = workspace;
    await writeState(statePath, state);

    const resolved = await readResolvedState(statePath);
    expect(resolved.path).toBe(statePath);
    expect(resolved.state.state_path).toBe(statePath);
  });

  test("updateState follows a run snapshot to the canonical state", async () => {
    const workspace = await makeTempDir();
    const runPath = join(workspace, ".zzhub-media", "runs", "run-update.json");
    const canonicalPath = join(workspace, "posts", "post-update", "workflow-state.json");
    const state = defaultState();
    state.run_id = "run-update";
    state.workspace_root = workspace;
    state.state_path = canonicalPath;
    await writeState(runPath, state);
    await writeState(canonicalPath, structuredClone(state));

    await updateState(runPath, (current) => {
      current.mode = "abandoned";
    });

    expect((await readState(canonicalPath)).mode).toBe("abandoned");
    expect((await readState(runPath)).mode).toBe("active");
  });

  test("rejects invalid state without replacing the last valid file", async () => {
    const workspace = await makeTempDir();
    const statePath = join(workspace, "state.json");
    const state = defaultState();
    state.run_id = "run-valid";
    state.workspace_root = workspace;
    state.state_path = statePath;
    await writeState(statePath, state);
    const before = await readFile(statePath, "utf-8");

    (state.route as { primary: string }).primary = "invalid-route";
    await expect(writeState(statePath, state)).rejects.toThrow();

    expect(await readFile(statePath, "utf-8")).toBe(before);
    expect((await readState(statePath)).route.primary).toBe("wechat-article");
  });

  test("rejects a stale writer instead of losing a concurrent update", async () => {
    const workspace = await makeTempDir();
    const statePath = join(workspace, "state.json");
    const initial = defaultState();
    initial.run_id = "run-concurrent";
    initial.workspace_root = workspace;
    initial.state_path = statePath;
    await writeState(statePath, initial);

    const first = await readState(statePath);
    const stale = await readState(statePath);
    first.metadata.title = "First writer";
    await writeState(statePath, first);
    stale.metadata.title = "Stale writer";

    await expect(writeState(statePath, stale)).rejects.toThrow(
      "State changed since it was read",
    );
    expect((await readState(statePath)).metadata.title).toBe("First writer");
  });

  test("rejects writes while another long operation owns the state", async () => {
    const workspace = await makeTempDir();
    const statePath = join(workspace, "state.json");
    const initial = defaultState();
    initial.run_id = "run-busy";
    initial.workspace_root = workspace;
    initial.state_path = statePath;
    await writeState(statePath, initial);
    const state = await readState(statePath);
    const operationLockPath = `${statePath}.operation.lock`;
    await writeFile(operationLockPath, "busy", "utf-8");

    await expect(writeState(statePath, state)).rejects.toThrow(
      "another operation in progress",
    );
    await rm(operationLockPath, { force: true });
  });

  test("a waiting operation does not block the current owner from writing", async () => {
    const workspace = await makeTempDir();
    const statePath = join(workspace, "state.json");
    const initial = defaultState();
    initial.run_id = "run-operation-wait";
    initial.workspace_root = workspace;
    initial.state_path = statePath;
    await writeState(statePath, initial);

    const current = await readState(statePath);
    const releaseCurrent = await acquireStateOperationLock(statePath);
    const waiting = acquireStateOperationLock(statePath);
    await new Promise((resolveWait) => setTimeout(resolveWait, 20));

    current.metadata.title = "Current owner";
    await writeState(statePath, current);
    await releaseCurrent();

    const releaseWaiting = await waiting;
    await releaseWaiting();
    expect((await readState(statePath)).metadata.title).toBe("Current owner");
  });
});
