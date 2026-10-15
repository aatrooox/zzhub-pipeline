import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { createArticleSnapshot, hashArtifactManifest } from "../../article-snapshot";
import { putBodyAsset, validateSystemAsset } from "./assets";
import { JobStore } from "./store";
import { prepareArticleMaterials } from "./job-materials";
import { getDefaultConfig } from "@akairos/typeset-studio";

test.skipIf(!process.env.TYPESET_ARTICLE_COVER_FONT_PATH)("同输入默认普通图片槽位重复固化得到稳定snapshotHash", async () => {
  const root = await mkdtemp(join(tmpdir(), "zzp-stable-default-"));
  const previous = process.env.PIPELINE_CONFIG_FILE;
  try {
    const templates = join(root, "typeset", "templates"); await mkdir(templates, { recursive: true });
    await writeFile(join(templates, ".initialized"), "1"); await writeFile(join(templates, ".canvas-presets-v1"), "1");
    const imagePath = join(root, "logo.png"); await writeFile(imagePath, createCanvas(20, 20).toBuffer("image/png"));
    const config = getDefaultConfig("wechat-cover-2.35"); config.id = "stable-default"; config.name = "默认图片模板"; config.slot = "article_cover";
    config.images = [{ id: "ordinary-slot", src: imagePath, alt: "默认素材", width: 20, height: 20, isAbsolute: true, x: 10, y: 10 }];
    await writeFile(join(templates, "stable-default.json"), JSON.stringify(config));
    await writeFile(join(root, "typeset", "default-template.json"), JSON.stringify({ defaultTemplateId: config.id }));
    const configPath = join(root, "pipeline.json");
    await writeFile(configPath, JSON.stringify({ plugins: { imageRenderer: { module: "@akairos/typeset-studio/adapter", options: { dataDir: join(root, "typeset") } }, markdownRenderer: "@akairos/myno/adapter" }, render: { branding: { logo: "", footerText: "" } } }));
    process.env.PIPELINE_CONFIG_FILE = configPath;
    const content = { title: "稳定默认", body: "正文", account: "test" };
    const articleSnapshot = createArticleSnapshot({ ...content, documentId: "32a6a1e0-74f9-430e-a248-153a3a48efce", documentRevision: 1, bodyAssets: [] });
    const request = { ...content, idempotencyKey: "stable", operation: "preview" as const, contentForm: "article" as const, articleSnapshot };
    const first = await prepareArticleMaterials(join(root, "job-one"), request, root);
    const second = await prepareArticleMaterials(join(root, "job-two"), request, root);
    expect(first.snapshotHash).toBe(second.snapshotHash);
    const frozen = JSON.parse(await readFile(join(root, "job-one", "snapshot.json"), "utf8"));
    expect(frozen.cover.images).toHaveLength(1);
    expect(frozen.cover.images[0].id).toBe("frozen-image-0");
  } finally {
    if (previous === undefined) delete process.env.PIPELINE_CONFIG_FILE; else process.env.PIPELINE_CONFIG_FILE = previous;
    await rm(root, { recursive: true, force: true });
  }
});

test("有界正文素材传输只接受解码成功的同hash PNG/JPEG/WebP", async () => {
  const root = await mkdtemp(join(tmpdir(), "zzp-body-assets-"));
  try {
    const png = createCanvas(20, 10).toBuffer("image/png");
    const hash = createHash("sha256").update(png).digest("hex");
    const request = () => new Request("http://worker.test", { method: "PUT", body: new Uint8Array(png), headers: { "content-type": "image/png" } });
    expect(await putBodyAsset(root, hash, request())).toMatchObject({ sha256: hash, width: 20, height: 10, byteLength: png.byteLength });
    expect(await putBodyAsset(root, hash, request())).toMatchObject({ sha256: hash });
    await expect(putBodyAsset(root, "0".repeat(64), request())).rejects.toThrow("hash");
    await expect(putBodyAsset(root, hash, new Request("http://worker.test", { method: "PUT", body: new Uint8Array(png), headers: { "content-type": "image/jpeg" } }))).rejects.toThrow("format");
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("系统页首GIF保留字节，用户正文GIF仍拒绝", async () => {
  const bytes = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  const identity = await validateSystemAsset(bytes, "image/gif");
  expect(identity).toMatchObject({ contentType: "image/gif", width: 1, height: 1, byteLength: bytes.byteLength, sha256: createHash("sha256").update(bytes).digest("hex") });
  const root = await mkdtemp(join(tmpdir(), "zzp-user-gif-"));
  try { await expect(putBodyAsset(root, identity.sha256, new Request("http://worker.test", { method: "PUT", headers: { "content-type": "image/gif" }, body: new Uint8Array(bytes) }))).rejects.toThrow("type"); }
  finally { await rm(root, { recursive: true, force: true }); }
});

test("preview_ready重启保持待确认，只有正在执行的原任务标为interrupted", async () => {
  const root = await mkdtemp(join(tmpdir(), "zzp-preview-restart-"));
  try {
    const file = join(root, "jobs.json");
    const now = new Date().toISOString();
    const base = { requestHash: "fixture", input: { idempotencyKey: "preview", account: "test", title: "test", contentForm: "article" }, body: "body", step: "preview_ready", runId: "original", error: null, result: {}, statePath: "/original", createdAt: now, updatedAt: now, startedAt: now, finishedAt: null, publicationRequested: false };
    await writeFile(file, JSON.stringify({ jobs: [{ ...base, id: "ready", status: "preview_ready" }, { ...base, id: "running", status: "running", publicationRequested: true }] }));
    const store = new JobStore(file); await store.load();
    expect(store.get("ready")!.status).toBe("preview_ready");
    expect(store.get("ready")!.publicationRequested).toBe(false);
    expect(store.get("running")!.status).toBe("interrupted");
    expect(store.get("running")!.runId).toBe("original");
  } finally { await rm(root, { recursive: true, force: true }); }
});

// 主控显式提供固定字体与Chrome运行环境；CLI/Worker真实执行，微信边界仅用可计数HTTP中转替身。
test.skipIf(!process.env.TYPESET_ARTICLE_COVER_FONT_PATH)("真实Worker预览零微信写，确认复用原run/HTML/封面且并发确认幂等", async () => {
  const root = await mkdtemp(join(tmpdir(), "zzp-preview-real-cli-"));
  const calls: string[] = [];
  const relay = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const path = new URL(request.url).pathname; calls.push(path);
    if (path.endsWith("/token")) return Response.json({ accessToken: "FAKE_TOKEN" });
    if (path.includes("material")) return Response.json({ media_id: `FAKE_IMAGE_${calls.length}`, url: `https://mmbiz.test/${calls.length}.png` });
    return Response.json({ media_id: "SIMULATED_DRAFT_ONLY" });
  } });
  const configPath = join(root, "config.json");
  const typeset = join(root, "shared-typeset"); await mkdir(join(typeset, "templates"), { recursive: true });
  await writeFile(join(typeset, "templates", ".initialized"), "1"); await writeFile(join(typeset, "templates", ".canvas-presets-v1"), "1");
  const headerImage = createCanvas(30, 15).toBuffer("image/png");
  const headerTheme = join(root, "default-article.json");
  await writeFile(headerTheme, JSON.stringify({ schemaVersion: 1, engineVersion: 1, id: "header-default", name: "页首图默认", version: "1.0.0", css: "", structure: { headerImageUrl: `data:image/png;base64,${headerImage.toString("base64")}` } }));
  await writeFile(configPath, JSON.stringify({ wx: { baseUrl: `http://127.0.0.1:${relay.port}`, accounts: { default: { articleTheme: headerTheme } } }, plugins: {
    imageRenderer: { module: "@akairos/typeset-studio/adapter", options: { dataDir: typeset } }, markdownRenderer: "@akairos/myno/adapter",
  }, render: { branding: { logo: "", footerText: "" } } }));
  const env = { ...process.env, PIPELINE_WORKER_TOKEN: "preview-token", PIPELINE_WORKER_HOST: "127.0.0.1", PIPELINE_WORKER_PORT: "0", PIPELINE_WORKSPACE_ROOT: root, PIPELINE_WORKER_STATE_FILE: join(root, "jobs.json"), PIPELINE_CONFIG_FILE: configPath };
  let worker: ReturnType<typeof Bun.spawn> | undefined;
  let passed = false;
  const launch = async () => {
    worker = Bun.spawn([process.execPath, join(import.meta.dir, "server.ts")], { env, stdout: "pipe", stderr: "inherit" });
    const reader = (worker.stdout as ReadableStream<Uint8Array>).getReader(); const { value } = await reader.read(); reader.releaseLock();
    const address = new TextDecoder().decode(value).match(/listening on (127\.0\.0\.1:\d+)/)?.[1];
    if (!address) throw new Error("Worker did not start"); return `http://${address}`;
  };
  try {
    let url = await launch();
    const headers = { Authorization: "Bearer preview-token" };
    const json = (path: string, method: string, body: unknown) => fetch(`${url}${path}`, { method, headers, body: JSON.stringify(body) });
    const png = createCanvas(80, 40).toBuffer("image/png");
    const imageHash = createHash("sha256").update(png).digest("hex");
    const asset = { id: "663e6cfa-2a17-4777-83de-56f9b8ad61a5", sha256: imageHash, contentType: "image/png" as const, byteLength: png.byteLength, width: 80, height: 40 };
    expect((await fetch(`${url}/v1/assets/${imageHash}`, { method: "PUT", headers: { ...headers, "Content-Type": asset.contentType }, body: new Uint8Array(png) })).status).toBe(200);
    expect((await json("/v1/accounts/test", "PUT", { appId: "FAKE_APP", appSecret: "FAKE_SECRET", pat: "FAKE_PAT" })).status).toBe(200);
    const content = { title: "完整预览验收", body: `## 正文\n\n![图像\\[描述\\]尾](asset:${asset.id} "图片图注")\n\n\`\`\`md\n![代码示例](/missing-example-image.png)\n\`\`\`\n\n| 不换行表头 | 列二 |\n|---|---|\n| 内容 | 内容 |`, account: "test" };
    const articleSnapshot = createArticleSnapshot({ ...content, documentId: "353ed538-bde2-482e-a11d-89b9c4e77f39", documentRevision: 1, bodyAssets: [asset] });
    const submitted = await json("/v1/jobs", "POST", { ...content, contentForm: "article", idempotencyKey: "preview-original", operation: "preview", articleSnapshot });
    const job = await submitted.json();
    if (submitted.status !== 202) throw new Error(`Preview submit HTTP ${submitted.status}: ${JSON.stringify(job)}`);
    const waitFor = async (states: string[]) => {
      for (let count = 0; count < 600; count++) {
        const current = await (await fetch(`${url}/v1/jobs/${job.id}`, { headers })).json();
        if (states.includes(current.status)) return current;
        if (current.status === "failed") throw new Error(current.error);
        await Bun.sleep(100);
      }
      throw new Error("Worker timed out");
    };
    const ready = await waitFor(["preview_ready"]);
    expect(calls).toEqual([]);
    expect(ready.result.inputHash).toBe(articleSnapshot.inputHash);
    expect(hashArtifactManifest(ready.result.artifactManifest)).toBe(ready.result.artifactManifestHash);
    const previewHtml = await (await fetch(`${url}/v1/jobs/${job.id}/artifacts/article`, { headers })).text();
    expect(previewHtml).toContain(`asset:${asset.id}`); expect(previewHtml).toContain("图片图注");
    expect(previewHtml).toContain('alt="图像[描述]尾"');
    expect(previewHtml).toContain("/missing-example-image.png");
    expect(ready.result.artifactManifest.artifacts.filter((artifact: any) => artifact.kind === "media")).toHaveLength(2);
    const originalRun = ready.runId;
    worker!.kill(); await worker!.exited; url = await launch();
    expect((await waitFor(["preview_ready"])).runId).toBe(originalRun); expect(calls).toEqual([]);
    const confirmation = { snapshotHash: ready.result.snapshotHash, artifactManifestHash: ready.result.artifactManifestHash };
    expect((await json(`/v1/jobs/${job.id}/publish`, "POST", { ...confirmation, snapshotHash: "0".repeat(64) })).status).toBe(409);
    const privateConfig = join(root, "jobs", job.id, "pipeline-config.json");
    const originalConfig = await readFile(privateConfig);
    await writeFile(privateConfig, "{}");
    expect((await json(`/v1/jobs/${job.id}/publish`, "POST", confirmation)).status).toBe(400);
    expect(calls).toEqual([]);
    await writeFile(privateConfig, originalConfig);
    const privateHtml = join(root, "jobs", job.id, "artifacts", "article.html");
    const originalHtml = await readFile(privateHtml);
    await writeFile(privateHtml, "<p>tampered</p>");
    expect((await json(`/v1/jobs/${job.id}/publish`, "POST", confirmation)).status).toBe(400);
    expect(calls).toEqual([]);
    await writeFile(privateHtml, originalHtml);
    const accepted = await Promise.all([json(`/v1/jobs/${job.id}/publish`, "POST", confirmation), json(`/v1/jobs/${job.id}/publish`, "POST", confirmation)]);
    expect(accepted.every(response => [200, 202].includes(response.status))).toBe(true);
    const done = await waitFor(["succeeded"]);
    expect(done.runId).toBe(originalRun);
    expect(done.result.artifactManifestHash).toBe(ready.result.artifactManifestHash);
    expect(done.result.publishResults[0].external_id).toBe("SIMULATED_DRAFT_ONLY");
    expect(calls.filter(path => /draft\/(add|create)/.test(path))).toHaveLength(1);
    expect(await (await fetch(`${url}/v1/jobs/${job.id}/artifacts/article`, { headers })).text()).toBe(previewHtml);
    expect((await json(`/v1/jobs/${job.id}/publish`, "POST", confirmation)).status).toBe(200);
    passed = true;
  } finally {
    worker?.kill(); await worker?.exited; relay.stop(true);
    if (passed) await rm(root, { recursive: true, force: true });
    else console.error(`Preview fixture evidence retained: ${root}`);
  }
}, 120_000);
