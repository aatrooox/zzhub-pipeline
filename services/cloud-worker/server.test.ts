import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("worker defaults to loopback and authenticates health and job requests", async () => {
  const root = await mkdtemp(join(tmpdir(), "zzp-worker-test-"));
  const command = [process.execPath, join(import.meta.dir, "server.ts")];
  // 独立子进程和临时目录避免读取生产任务或账号配置。
  const env = {
    ...process.env,
    PIPELINE_WORKER_HOST: "",
    PIPELINE_WORKER_PRIVATE_NETWORK: "",
    PIPELINE_WORKER_PORT: "0",
    PIPELINE_WORKER_TOKEN: "test-worker-token",
    PIPELINE_WORKSPACE_ROOT: root,
    PIPELINE_WORKER_STATE_FILE: join(root, "jobs.json"),
  };
  const child = Bun.spawn(command, { env, stdout: "pipe", stderr: "inherit" });
  try {
    const reader = child.stdout.getReader();
    const { value } = await reader.read();
    reader.releaseLock();
    const address = new TextDecoder().decode(value).match(/listening on (127\.0\.0\.1:\d+)/)?.[1];
    expect(address).toBeTruthy();
    const url = `http://${address}`;
    const headers = { Authorization: `Bearer ${env.PIPELINE_WORKER_TOKEN}` };
    expect((await fetch(`${url}/health`)).status).toBe(401);
    expect((await fetch(`${url}/health`, { headers: { Authorization: "Bearer wrong" } })).status).toBe(401);
    expect((await fetch(`${url}/health`, { headers })).status).toBe(200);
    expect((await fetch(`${url}/v1/jobs/missing`)).status).toBe(401);
    expect((await fetch(`${url}/v1/jobs/missing`, { headers })).status).toBe(404);

    expect((await fetch(`${url}/v1/accounts/test-account`, { method: "PUT", headers, body: JSON.stringify({
      account: "test-account",
      appId: "app-id",
      appSecret: "app-secret",
      pat: "pat",
    }) })).status).toBe(200);
    expect((await fetch(`${url}/v1/accounts/test-account`, { method: "DELETE", headers })).status).toBe(200);

    // 未配置的测试账号会在执行前停止，只验证快照契约与幂等保存。
    const input = { idempotencyKey: "newspic-input", title: "贴图", body: "原文", contentForm: "newspic", account: "missing-account", newspic: { content: "发送正文", photos: ["https://example.test/a.png", "https://example.test/b.png"] } };
    const submit = (value: unknown) => fetch(`${url}/v1/jobs`, { method: "POST", headers, body: JSON.stringify(value) });
    for (const photos of [[], ["file:///private/photo.png"], Array(21).fill("https://example.test/a.png")])
      expect((await submit({ ...input, newspic: { ...input.newspic, photos } })).status).toBe(400);
    const created = await submit(input);
    expect(created.status).toBe(202);
    const job = await created.json();
    expect(job.input.newspic).toEqual(input.newspic);
    expect((await (await submit(input)).json()).id).toBe(job.id);
    expect((await submit({ ...input, newspic: { ...input.newspic, content: "另一份正文" } })).status).toBe(409);

    const rejected = Bun.spawnSync(command, { env: { ...env, PIPELINE_WORKER_HOST: "0.0.0.0" } });
    expect(rejected.exitCode).not.toBe(0);
    expect(rejected.stderr.toString()).toContain("PIPELINE_WORKER_HOST must be loopback");
  } finally {
    child.kill();
    await child.exited;
    await rm(root, { recursive: true, force: true });
  }
});
