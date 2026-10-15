import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { ARTICLE_COVER_FONT, DEFAULT_ARTICLE_COVER_CONTROLS } from "@akairos/typeset-studio/cover";
import { createCoverSnapshot } from "../../cover-snapshot";
import { coverCapabilities, materializeCoverSnapshot } from "./cover";
import { executeCloudJob } from "./pipeline";
import { AccountStore, JobStore, defaultJobWorkspace, type StoredCloudJob } from "./store";

function snapshot() {
  const bytes = createCanvas(1000, 1000).toBuffer("image/jpeg");
  return createCoverSnapshot({
    id: "7bf76dce-379a-4f0c-8fa2-8cb345c03631", revision: 1, name: "已冻结封面",
    controls: { ...DEFAULT_ARTICLE_COVER_CONTROLS, backgroundColor: "#ffccee" },
    asset: { id: "c5951764-3e4b-4bd8-9fea-0bad725381ca", sha256: createHash("sha256").update(bytes).digest("hex"), contentType: "image/jpeg", dataBase64: bytes.toString("base64") },
    font: { id: ARTICLE_COVER_FONT.id, sha256: ARTICLE_COVER_FONT.sha256 },
  });
}

test("字体文件缺失不声明封面能力且禁止落盘执行", async () => {
  const root = await mkdtemp(join(tmpdir(), "zzp-cover-font-"));
  const previous = process.env.TYPESET_ARTICLE_COVER_FONT_PATH;
  try {
    process.env.TYPESET_ARTICLE_COVER_FONT_PATH = join(root, "missing.ttc");
    expect((await coverCapabilities()).coverSnapshotSchemaVersions).toEqual([]);
    await expect(materializeCoverSnapshot(root, snapshot())).rejects.toThrow("font file is unavailable");
    await writeFile(process.env.TYPESET_ARTICLE_COVER_FONT_PATH, "not a font");
    await expect(materializeCoverSnapshot(root, snapshot())).rejects.toThrow("font hash mismatch");
  } finally {
    if (previous === undefined) delete process.env.TYPESET_ARTICLE_COVER_FONT_PATH; else process.env.TYPESET_ARTICLE_COVER_FONT_PATH = previous;
    await rm(root, { recursive: true, force: true });
  }
});

// 主控提供固定 hash 的字体文件；CLI 边界替身只证明参数与身份，不冒充真实草稿。
test.skipIf(!process.env.TYPESET_ARTICLE_COVER_FONT_PATH)("Worker 私有封面材料与子进程环境贯穿 render/status/publish", async () => {
  const root = await mkdtemp(join(tmpdir(), "zzp-cover-worker-"));
  const previous = process.env.BUN_BIN;
  const previousDataDir = process.env.TYPESET_DATA_DIR;
  try {
    const runner = join(root, "cli-fixture");
    const recordPath = join(root, "commands.json");
    const renderedPath = join(root, "rendered.json");
    const publishedPath = join(root, "published");
    await writeFile(runner, `#!${process.execPath}
import { readFile, writeFile } from "node:fs/promises";
const args=process.argv.slice(2), action=args[1];
const records=JSON.parse(await readFile(${JSON.stringify(recordPath)},"utf8").catch(()=>"[]"));
records.push({args, dataDir:process.env.TYPESET_DATA_DIR,font:process.env.TYPESET_ARTICLE_COVER_FONT_PATH,cover:process.env.ZZHUB_PIPELINE_COVER_SNAPSHOT});
await writeFile(${JSON.stringify(recordPath)},JSON.stringify(records));
if(action==="init") console.log(JSON.stringify({state_path:${JSON.stringify(join(root, "state.json"))},run_id:"cover-fixture"}));
else if(action==="render") {
 const template=args[args.indexOf("--studio-cover-template")+1];
 const mapping=JSON.parse(await readFile(args[args.indexOf("--template-images-file")+1],"utf8"));
 await writeFile(${JSON.stringify(renderedPath)},JSON.stringify({templates:{cover:template},image_overrides:mapping}));
 console.log("{}");
} else if(action==="publish") {await writeFile(${JSON.stringify(publishedPath)},"1"); console.log("{}");}
else if(action==="status") {
 const studio=JSON.parse(await readFile(${JSON.stringify(renderedPath)},"utf8").catch(()=>"null"));
 const done=await Bun.file(${JSON.stringify(publishedPath)}).exists();
 console.log(JSON.stringify({summary:{state_path:${JSON.stringify(join(root, "state.json"))},mode:done?"done":"active",publish:{results:done?[{account:"test",status:"success",external_id:"SIMULATED_ONLY"}]:[]}},
 ...(args.includes("--full")?{state:{intent:{studio_render:studio}}}:{}),next_action:{action:studio?"publish":"render"}}));
} else throw Error("Unexpected action "+action);
`, { mode: 0o700 });
    process.env.BUN_BIN = runner;
    process.env.TYPESET_DATA_DIR = join(root, "shared-must-not-change");
    const coverSnapshot = snapshot();
    const input = { idempotencyKey: "cover-test", title: "测试", body: "正文", contentForm: "article" as const, account: "test", coverSnapshot };
    const { body, ...publicInput } = input;
    const now = new Date().toISOString();
    const job: StoredCloudJob = { id: "cover-job", requestHash: "fixture", input: publicInput, body, status: "running", step: "starting", runId: null, error: null, result: null, statePath: null, createdAt: now, updatedAt: now, startedAt: now, finishedAt: null };
    const accounts = new AccountStore(join(root, "accounts.json"));
    await accounts.set({ account: "test", appId: "FAKE", appSecret: "FAKE", pat: "FAKE", updatedAt: now });
    await executeCloudJob(job, input, new JobStore(join(root, "jobs.json")), accounts, root);
    const workspace = defaultJobWorkspace(root, job.id);
    const records = JSON.parse(await readFile(recordPath, "utf8")) as Array<{ args: string[]; dataDir: string; font: string; cover: string }>;
    expect(records.filter(item => item.args[1] === "status").every(item => item.args.includes("--full"))).toBe(true);
    expect(records.every(item => item.dataDir === join(workspace, "cover", "typeset") && item.cover === "1" && item.font === process.env.TYPESET_ARTICLE_COVER_FONT_PATH)).toBe(true);
    expect(JSON.parse(await readFile(join(workspace, "cover", "typeset", "templates", `${coverSnapshot.id}.json`), "utf8"))).toEqual(coverSnapshot.config);
    const bytes = await readFile(join(workspace, "cover", "image.jpg"));
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(coverSnapshot.asset.sha256);
    expect(JSON.parse(await readFile(join(workspace, "cover", "snapshot.json"), "utf8"))).toEqual(coverSnapshot);
    expect(job.result).toMatchObject({ coverSnapshotHash: coverSnapshot.hash, coverAssetHash: coverSnapshot.asset.sha256, coverFontHash: coverSnapshot.font.sha256 });
    expect(job.step).toBe("done");
    expect(process.env.TYPESET_DATA_DIR).toBe(join(root, "shared-must-not-change"));
  } finally {
    if (previous === undefined) delete process.env.BUN_BIN; else process.env.BUN_BIN = previous;
    if (previousDataDir === undefined) delete process.env.TYPESET_DATA_DIR; else process.env.TYPESET_DATA_DIR = previousDataDir;
    await rm(root, { recursive: true, force: true });
  }
});
