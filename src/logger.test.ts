import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDailyLogPath, getLogDir, runWithCommandLog } from "./logger";

describe("pipeline daily logger", () => {
  const previousLogDir = process.env.ZZHUB_PIPELINE_LOG_DIR;
  let tempDir: string | null = null;

  afterEach(() => {
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
