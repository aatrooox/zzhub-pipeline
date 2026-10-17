import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCanvas } from "@napi-rs/canvas";
import { createArticleStyleSnapshotV2 } from "../../article-style";
import { createRenderedCoverSnapshot, coverSnapshotIdentity, hashRenderedCoverTitle } from "../../cover-snapshot";
import { canonicalHash, createArticleSnapshot } from "../../article-snapshot";

// 主控按需开启真实 CLI/Chrome；只有微信 HTTP 边界使用可计数替身。
test.skipIf(process.env.PIPELINE_V2_PREVIEW_TEST !== "1")("v2完整样式与原PNG预览、确认复用同run及微信写入幂等", async () => {
  const root = await mkdtemp(join(tmpdir(), "zzp-rendered-preview-"));
  const calls: string[] = [];
  const relay = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch(request) {
    const path = new URL(request.url).pathname; calls.push(path);
    if (path.endsWith("/token")) return Response.json({ accessToken: "FAKE_TOKEN" });
    if (path.includes("material")) return Response.json({ media_id: `FAKE_IMAGE_${calls.length}`, url: `https://mmbiz.test/${calls.length}.png` });
    return Response.json({ media_id: "SIMULATED_V2_DRAFT_ONLY" });
  } });
  const configPath = join(root, "config.json");
  await writeFile(configPath, JSON.stringify({ wx: { baseUrl: `http://127.0.0.1:${relay.port}` }, plugins: {
    imageRenderer: "@akairos/typeset-studio/adapter", markdownRenderer: "@akairos/myno/adapter",
  } }));
  const canvas = createCanvas(3350, 1000); const context = canvas.getContext("2d"); context.fillStyle = "#123456"; context.fillRect(0, 0, 3350, 1000);
  const png = canvas.toBuffer("image/png");
  const coverSnapshot = createRenderedCoverSnapshot({ id: "5c045c5e-b432-4cf5-b136-2db3514bcbb8", revision: 1, name: "多层保真封面", sourceHash: canonicalHash({ full: "source-config" }), assetsHash: canonicalHash([]), fontHashes: [{ id: "app-font", sha256: "a".repeat(64) }], titleHash: hashRenderedCoverTitle("完整v2预览"), renderedAsset: {
    id: "273e5a78-563c-4d15-884e-9078d146fcf3", contentType: "image/png", byteLength: png.length, width: 3350, height: 1000, sha256: createHash("sha256").update(png).digest("hex"),
  } });
  const articleStyle = createArticleStyleSnapshotV2({ schemaVersion: 1, engineVersion: 1, id: "full-v2", name: "完整排版", version: "1.0.0", css: ".milkdown .editor p { letter-spacing: 0.25px; }", editorVars: { "--brand": "#123456" }, exportTheme: { bodyFontSize: "22px", bodyLineHeight: "1.9", primaryColor: "#123456" }, syntaxPresets: { h2: "bottom-line", blockquote: "card", table: "zebra" }, structure: { numberedHeadings: true, headingLabel: "章节", quoteLabel: "摘录" } }, "full-v2", 1);
  const content = { title: "完整v2预览", body: "## 配置保真\n\n正文段落\n\n> 摘录内容\n\n| 表头一 | 表头二 |\n|---|---|\n| 内容 | 内容 |", account: "test", articleStyle, coverSnapshot };
  const articleSnapshot = createArticleSnapshot({ ...content, documentId: "9c79586c-71d9-4241-ae1c-b812b3d12ba4", documentRevision: 1, bodyAssets: [] });
  let worker: ReturnType<typeof Bun.spawn> | undefined;
  let passed = false;
  try {
    worker = Bun.spawn([process.execPath, join(import.meta.dir, "server.ts")], { env: {
      ...process.env, TYPESET_ARTICLE_COVER_FONT_PATH: join(root, "not-needed-for-v2.ttc"),
      PIPELINE_WORKER_HOST: "127.0.0.1", PIPELINE_WORKER_PORT: "0", PIPELINE_WORKER_TOKEN: "rendered-preview-token",
      PIPELINE_WORKSPACE_ROOT: root, PIPELINE_WORKER_STATE_FILE: join(root, "jobs.json"), PIPELINE_CONFIG_FILE: configPath,
    }, stdout: "pipe", stderr: "inherit" });
    const reader = worker.stdout.getReader(); const { value } = await reader.read(); reader.releaseLock();
    const address = new TextDecoder().decode(value).match(/listening on (127\.0\.0\.1:\d+)/)?.[1];
    if (!address) throw new Error("Worker did not start");
    const url = `http://${address}`, headers = { Authorization: "Bearer rendered-preview-token" };
    const json = (path: string, method: string, body: unknown) => fetch(`${url}${path}`, { method, headers, body: JSON.stringify(body) });
    const capabilities = (await (await fetch(`${url}/health`, { headers })).json()).capabilities;
    expect(capabilities.coverSnapshotSchemaVersions).toEqual([2]);
    expect((await json("/v1/jobs", "POST", { ...content, contentForm: "article", idempotencyKey: "v2-direct" })).status).toBe(400);
    expect((await fetch(`${url}/v1/assets/${coverSnapshot.renderedAsset.sha256}`, { method: "PUT", headers: { ...headers, "Content-Type": "image/png" }, body: new Uint8Array(png) })).status).toBe(200);
    expect((await json("/v1/accounts/test", "PUT", { appId: "FAKE_APP", appSecret: "FAKE_SECRET", pat: "FAKE_PAT" })).status).toBe(200);
    const submitted = await json("/v1/jobs", "POST", { ...content, contentForm: "article", idempotencyKey: "v2-original", operation: "preview", articleSnapshot });
    const job = await submitted.json();
    if (submitted.status !== 202) throw new Error(`Preview submit HTTP ${submitted.status}: ${JSON.stringify(job)}`);
    const waitFor = async (status: string) => {
      for (let count = 0; count < 600; count++) {
        const current = await (await fetch(`${url}/v1/jobs/${job.id}`, { headers })).json();
        if (current.status === status) return current;
        if (["failed", "interrupted"].includes(current.status)) throw new Error(current.error);
        await Bun.sleep(100);
      }
      throw new Error("Worker timed out");
    };
    const ready = await waitFor("preview_ready");
    expect(calls).toEqual([]);
    expect(ready.result).toMatchObject(coverSnapshotIdentity(coverSnapshot));
    expect(Buffer.from(await (await fetch(`${url}/v1/jobs/${job.id}/artifacts/cover`, { headers })).arrayBuffer())).toEqual(png);
    const prepared = JSON.parse(await readFile(join(root, "jobs", job.id, "prepared.json"), "utf8"));
    expect(prepared.renderedCover.snapshot).toEqual(coverSnapshot);
    expect(prepared.fileHashes[prepared.renderedCover.path]).toBeTruthy();
    const frozen = JSON.parse(await readFile(join(root, "jobs", job.id, "snapshot.json"), "utf8"));
    expect(frozen.renderedCover).toEqual(coverSnapshot);
    expect(frozen.article.syntaxPresets).toMatchObject(articleStyle.manifest.syntaxPresets);
    expect(frozen.article.structure).toMatchObject(articleStyle.manifest.structure);
    const html = await (await fetch(`${url}/v1/jobs/${job.id}/artifacts/article`, { headers })).text();
    expect(html).toContain("22px"); expect(html).toContain("0.25px");
    const confirmation = { snapshotHash: ready.result.snapshotHash, artifactManifestHash: ready.result.artifactManifestHash };
    const accepted = await Promise.all([json(`/v1/jobs/${job.id}/publish`, "POST", confirmation), json(`/v1/jobs/${job.id}/publish`, "POST", confirmation)]);
    expect(accepted.every(response => [200, 202].includes(response.status))).toBe(true);
    const done = await waitFor("succeeded");
    expect(done.runId).toBe(ready.runId);
    expect(done.result.artifactManifestHash).toBe(ready.result.artifactManifestHash);
    expect(done.result.publishResults[0].external_id).toBe("SIMULATED_V2_DRAFT_ONLY");
    expect(calls.filter(path => /draft\/(add|create)/.test(path))).toHaveLength(1);
    passed = true;
  } finally {
    worker?.kill(); await worker?.exited; relay.stop(true);
    if (passed) await rm(root, { recursive: true, force: true });
    else console.error(`Rendered preview fixture retained: ${root}`);
  }
}, 90_000);
