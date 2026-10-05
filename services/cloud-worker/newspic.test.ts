import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeCloudJob } from "./pipeline";
import { AccountStore, JobStore, type CloudJobInput, type StoredCloudJob } from "./store";

// 执行真实 CLI 状态机，仅以回环服务代替微信和图片网络边界。
test("贴图发送已选图片和正文，不生成海报，也不读取原文章里的其他配图", async () => {
  const root = await mkdtemp(join(tmpdir(), "zzp-newspic-"));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1SMAAAAASUVORK5CYII=", "base64");
  const uploaded: string[] = [];
  let draft: any;
  const relay = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/photos/")) return new Response(png, { headers: { "content-type": "image/png" } });
    if (path.endsWith("/token")) return Response.json({ data: { accessToken: "test-token" } });
    if (path.endsWith("/material/add_material")) {
      const data = await request.formData();
      uploaded.push((data.get("media") as File).name);
      return Response.json({ media_id: `image-${uploaded.length}` });
    }
    if (path.endsWith("/draft/add")) {
      draft = await request.json();
      return Response.json({ media_id: "confirmed-draft" });
    }
    return new Response("unexpected request", { status: 500 });
  } });
  const previous = { config: process.env.PIPELINE_CONFIG_FILE, relay: process.env.ZZHUB_WX_BASE_URL };
  try {
    const config = join(root, "config.json");
    await writeFile(config, "{}");
    process.env.PIPELINE_CONFIG_FILE = config;
    process.env.ZZHUB_WX_BASE_URL = relay.url.origin;
    const accounts = new AccountStore(join(root, "accounts.json"));
    await accounts.set({ account: "test-account", appId: "test-app", appSecret: "test-secret", pat: "test-pat", updatedAt: new Date().toISOString() });
    const store = new JobStore(join(root, "jobs.json"));
    const input: CloudJobInput = {
      idempotencyKey: "newspic-check", account: "test-account", title: "贴图标题", contentForm: "newspic",
      body: "原始文章不可外发 ![旧图](https://invalid.example/unused.png)",
      newspic: { content: "第一段正文\n\n第二段正文，保留 **原样** 与 ![示例](https://invalid.example/code.png)", photos: [`${relay.url.origin}/photos/first.png`, `${relay.url.origin}/photos/second.png`] },
    };
    const { body, ...publicInput } = input;
    const job: StoredCloudJob = { id: "job", requestHash: "test", input: publicInput, body, status: "running", step: "queued", runId: null, statePath: null, error: null, result: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), startedAt: null, finishedAt: null };
    await executeCloudJob(job, input, store, accounts, root);
    expect(job.step).toBe("done");
    expect(uploaded).toEqual(["first.png", "second.png"]);
    expect(draft.articles[0].article_type).toBe("newspic");
    expect(draft.articles[0].content.trim()).toBe(input.newspic!.content);
    expect(draft.articles[0].image_info.image_list).toEqual([{ image_media_id: "image-1" }, { image_media_id: "image-2" }]);
    expect(draft.articles[0].thumb_media_id).toBe("image-1");
    const state = JSON.parse(await readFile(job.statePath!, "utf8"));
    expect(state.intent.requires.render).toBe(false);
    expect(state.images.render_assets).toEqual([]);
    expect(input.body).toContain("原始文章不可外发");
  } finally {
    if (previous.config === undefined) delete process.env.PIPELINE_CONFIG_FILE; else process.env.PIPELINE_CONFIG_FILE = previous.config;
    if (previous.relay === undefined) delete process.env.ZZHUB_WX_BASE_URL; else process.env.ZZHUB_WX_BASE_URL = previous.relay;
    relay.stop(true);
    await rm(root, { recursive: true, force: true });
  }
}, 30_000);
