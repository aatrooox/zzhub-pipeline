import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDailyLogPath, getLogDir, runWithCommandLog } from "./logger";

describe("pipeline daily logger", () => {
  const previousLogDir = process.env.ZZHUB_PIPELINE_LOG_DIR;
  const previousMonitor = process.env.ZZHUB_PIPELINE_MONITOR;
  beforeEach(() => { process.env.ZZHUB_PIPELINE_MONITOR = "0"; });
  let tempDir: string | null = null;

  afterEach(() => {
    if (previousMonitor === undefined) delete process.env.ZZHUB_PIPELINE_MONITOR;
    else process.env.ZZHUB_PIPELINE_MONITOR = previousMonitor;
    if (previousLogDir === undefined) {
      delete process.env.ZZHUB_PIPELINE_LOG_DIR;
    } else {
      process.env.ZZHUB_PIPELINE_LOG_DIR = previousLogDir;
    }
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
  });

  test("logs returned business failures as FAIL without throwing or exiting the host", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "zzhub-pipeline-log-"));
    process.env.ZZHUB_PIPELINE_LOG_DIR = tempDir;
    const outcome = await runWithCommandLog("publish", [], async () => ({ status: "failed", errors: [{ code: "PUBLISH_FAILED", message: "upload failed" }] }));
    expect(outcome.status).toBe("failed");
    expect(readFileSync(getDailyLogPath(), "utf8")).toContain("=== FAIL command=publish");
  });

  test("an explicit nonzero exit code cannot be logged as success", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "zzhub-pipeline-log-"));
    process.env.ZZHUB_PIPELINE_LOG_DIR = tempDir;
    // Bun 需要显式恢复 0；写回 undefined 不会清除已经设置的退出码。
    const previousCode = process.exitCode ?? 0;
    try {
      const outcome = await runWithCommandLog("legacy", [], async () => {
        process.exitCode = 1;
        return { status: "success" };
      });
      expect(outcome.status).toBe("failed");
      expect(readFileSync(getDailyLogPath(), "utf8")).toContain("=== FAIL command=legacy");
    } finally { process.exitCode = previousCode; }
  });

  test("writes command start/ok markers and console output to the daily log", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "zzhub-pipeline-log-"));
    process.env.ZZHUB_PIPELINE_LOG_DIR = tempDir;

    await runWithCommandLog("status", ["--state", "/tmp/x.json"], async () => {
      console.log("hello-from-status");
    });

    const logPath = getDailyLogPath();
    expect(getLogDir()).toBe(tempDir);
    expect(existsSync(logPath)).toBe(true);
    const body = readFileSync(logPath, "utf-8");
    expect(body).toContain("=== START command=status ===");
    expect(body).toContain("=== OK command=status");
    expect(body).toContain("[console.log] hello-from-status");
    expect(body).toContain(`"--state"`);
  });

  test("records failure stack and rethrows", async () => {
    tempDir = mkdtempSync(join(tmpdir(), "zzhub-pipeline-log-"));
    process.env.ZZHUB_PIPELINE_LOG_DIR = tempDir;

    await expect(
      runWithCommandLog("publish", [], async () => {
        throw new Error("boom-upload");
      }),
    ).rejects.toThrow("boom-upload");

    const body = readFileSync(getDailyLogPath(), "utf-8");
    expect(body).toContain("=== FAIL command=publish");
    expect(body).toContain("Error: boom-upload");
    expect(body).toContain("boom-upload");
  });
});
