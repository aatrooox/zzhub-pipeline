import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { executeCloudJob } from "./pipeline";
import { AccountStore, JobStore, type CloudJobInput, type StoredCloudJob } from "./store";

// 执行真实 CLI 状态机，仅以回环服务代替微信和图片网络边界。
test.each(["uploaded", "generated", "legacy"])("贴图配图优先上传，否则自动生成封面与内容页：%s", async (mode) => {
  const root = await mkdtemp(join(tmpdir(), "zzp-newspic-"));
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1SMAAAAASUVORK5CYII=", "base64");
  const uploaded: string[] = [];
  const uploadSizes: number[] = [];
  let draft: any;
  const relay = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path.startsWith("/photos/")) return new Response(png, { headers: { "content-type": "image/png" } });
    if (path.endsWith("/token")) return Response.json({ data: { accessToken: "test-token" } });
    if (path.endsWith("/material/add_material")) {
      const data = await request.formData();
      uploaded.push((data.get("media") as File).name);
      uploadSizes.push((data.get("media") as File).size);
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
      body: mode === "legacy" ? "未上传图片，自动生成封面和内容图。\n\n".repeat(20) : "原始文章不可外发 ![旧图](https://invalid.example/unused.png)",
      ...(mode === "legacy" ? {} : { newspic: {
        content: mode === "uploaded" ? "第一段正文\n\n第二段正文，保留 **原样** 与 ![示例](https://invalid.example/code.png)" : "用户确认的贴图正文，由 worker 自动排版生成内容图片。\n\n".repeat(20).trim(),
        photos: mode === "uploaded" ? [`${relay.url.origin}/photos/first.png`, `${relay.url.origin}/photos/second.png`] : [],
      } }),
    };
    const { body, ...publicInput } = input;
    const job: StoredCloudJob = { id: "job", requestHash: "test", input: publicInput, body, status: "running", step: "queued", runId: null, statePath: null, error: null, result: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), startedAt: null, finishedAt: null };
    await executeCloudJob(job, input, store, accounts, root);
    expect(job.step).toBe("done");
    expect(draft.articles[0].article_type).toBe("newspic");
    expect(draft.articles[0].content.trim()).toBe((input.newspic?.content || input.body).trim());
    expect(draft.articles[0].image_info.image_list).toEqual(uploaded.map((_, index) => ({ image_media_id: `image-${index + 1}` })));
    expect(draft.articles[0].thumb_media_id).toBe("image-1");
    const state = JSON.parse(await readFile(job.statePath!, "utf8"));
    if (mode === "uploaded") {
      expect(uploaded).toEqual(["first.png", "second.png"]);
      expect(state.intent.requires.render).toBe(false);
      expect(state.images.render_assets).toEqual([]);
    } else {
      expect(state.intent.requires.render).toBe(true);
      expect(uploaded[0]).toBe("cover.png");
      expect(uploaded.slice(1).every(name => /^article-\d+\.png$/.test(name))).toBe(true);
      expect(uploaded.length).toBeGreaterThanOrEqual(3);
      expect(uploaded.length).toBeLessThanOrEqual(20);
      expect(uploadSizes.every(size => size > 1024)).toBe(true);
      for (const asset of state.images.render_assets)
        expect((await readFile(asset.path)).subarray(1, 4).toString()).toBe("PNG");
    }
  } finally {
    if (previous.config === undefined) delete process.env.PIPELINE_CONFIG_FILE; else process.env.PIPELINE_CONFIG_FILE = previous.config;
    if (previous.relay === undefined) delete process.env.ZZHUB_WX_BASE_URL; else process.env.ZZHUB_WX_BASE_URL = previous.relay;
    relay.stop(true);
    await rm(root, { recursive: true, force: true });
  }
}, 60_000);
