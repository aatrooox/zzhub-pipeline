import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createArticleStyleSnapshot } from "../../src/article-style";
import { readArticleTheme } from "../../src/article-theme";
import { executeCloudJob } from "./pipeline";
import { AccountStore, JobStore, defaultJobWorkspace, type StoredCloudJob } from "./store";

// 仅替换 CLI 执行边界，确认 Worker 私有材料与参数；不模拟为真实微信结果。
test.each([true, false])("Worker 固化正文样式并拒绝 CLI 主题 hash 不匹配：%s", async (matching) => {
  const root = await mkdtemp(join(tmpdir(), "zzp-style-worker-"));
  const previous = process.env.BUN_BIN;
  try {
    const runner = join(root, "cli-fixture");
    await writeFile(runner, `#!${process.execPath}
import { readFile, writeFile } from "node:fs/promises";
import { readArticleTheme } from ${JSON.stringify(join(import.meta.dir, "../../src/article-theme.ts"))};
const args=process.argv.slice(2);
if(args[1]==="init") {
  await writeFile(${JSON.stringify(join(root, "args.json"))},JSON.stringify(args));
  console.log(JSON.stringify({state_path:${JSON.stringify(join(root, "state.json"))},run_id:"fixture-run"}));
} else {
  const init=JSON.parse(await readFile(${JSON.stringify(join(root, "args.json"))},"utf8"));
  const theme=await readArticleTheme(init[init.indexOf("--article-theme")+1]);
  console.log(JSON.stringify({summary:{state_path:${JSON.stringify(join(root, "state.json"))},mode:"done",publish:{results:[{account:"test",status:"success",external_id:"SIMULATED_ONLY",article_theme_hash:${matching ? "theme.hash" : '"mismatched-theme"'}}]}}}));
}
`, { mode: 0o700 });
    process.env.BUN_BIN = runner;
    const articleStyle = createArticleStyleSnapshot({ schemaVersion: 1, engineVersion: 1, id: "style", name: "正文", version: "1.0.0", syntaxPresets: { h2: "bottom-line" } }, "style", 1);
    const input = { idempotencyKey: "style-task", title: "测试", body: "正文", contentForm: "article" as const, account: "test", articleStyle };
    const { body, ...publicInput } = input;
    const now = new Date().toISOString();
    const job: StoredCloudJob = { id: "style-job", requestHash: "fixture", input: publicInput, body, status: "running", step: "starting", runId: null, error: null, result: null, statePath: null, createdAt: now, updatedAt: now, startedAt: now, finishedAt: null };
    const accounts = new AccountStore(join(root, "accounts.json"));
    await accounts.set({ account: "test", appId: "FAKE", appSecret: "FAKE", pat: "FAKE", updatedAt: now });
    const execution = executeCloudJob(job, input, new JobStore(join(root, "jobs.json")), accounts, root);
    if (matching) await execution;
    else await expect(execution).rejects.toThrow("expected article theme hash");
    const path = join(defaultJobWorkspace(root, job.id), "article-style.json");
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(articleStyle.manifest);
    const args = JSON.parse(await readFile(join(root, "args.json"), "utf8"));
    expect(args[args.indexOf("--article-theme") + 1]).toBe(path);
    expect(job.result?.articleStyleHash).toBe(articleStyle.hash);
    expect(job.result?.articleThemeHash).toBe((await readArticleTheme(path)).hash);
    expect(job.result?.articleThemeHash).not.toBe(articleStyle.hash);
    if (matching) expect(job.step).toBe("done");
    else {
      expect(job.step).not.toBe("done");
      expect(job.result?.runId).toBe("fixture-run");
      expect(job.result?.phase).toBe("done");
      expect(job.result?.publishResults).toEqual([{
        account: "test", status: "success", external_id: "SIMULATED_ONLY", article_theme_hash: "mismatched-theme",
      }]);
    }
  } finally {
    if (previous === undefined) delete process.env.BUN_BIN; else process.env.BUN_BIN = previous;
    await rm(root, { recursive: true, force: true });
  }
});
