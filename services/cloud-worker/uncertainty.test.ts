import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// 使用真实 Worker HTTP 和子进程，CLI fixture 仅制造可定位的发布边界结果。
test("uncertain publication retains the original job/run and receipt without restart or same-key retries", async () => {
  const root = await mkdtemp(join(tmpdir(), "zzp-publication-uncertain-"));
  const runner = join(root, "cli-fixture"); const headers = { Authorization: "Bearer uncertainty-test" };
  await writeFile(runner, `#!${process.execPath}
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
const args=process.argv.slice(2), command=args[1], workspace=process.env.ZZHUB_PIPELINE_WORKSPACE_ROOT;
const state=join(workspace,"fixture-state.json"), counter=join(workspace,"publish-count.txt");
if(command==="init") {
  const scenario=args[args.indexOf("--intent-text")+1];
  await writeFile(state,JSON.stringify({scenario,results:[]}));
  console.log(JSON.stringify({state_path:state,run_id:"original-"+scenario}));
} else {
  const current=JSON.parse(await readFile(state,"utf8"));
  if(command==="status") {
    if(current.scenario==="receipt-status"&&current.published) { console.error("status unavailable after receipt"); process.exit(1); }
    console.log(JSON.stringify({summary:{state_path:state,mode:"active",phase:{current:"publish"},publish:{results:current.results}},next_action:{action:"publish"}}));
  } else if(command==="publish") {
    await appendFile(counter,"publish\\n");
    if(current.scenario==="overflow") { await writeFile(join(workspace,"possible-external-write"),"fixture only"); console.log("x".repeat(9*1024*1024)); await Bun.sleep(5000); }
    else if(current.scenario==="invalid") { console.log("invalid JSON after possible external write"); process.exit(1); }
    else {
      current.results=[{account:"test",route:"wechat-article",status:current.scenario==="receipt-status"?"success":"failed",
        ...(current.scenario==="receipt-status"?{external_id:"SIMULATED_RECEIPT_ONLY"}:{detail:current.scenario==="unknown"?"WX_RESULT_UNKNOWN: response lost":"WX_INVALID_INPUT: explicit rejection"})}];
      current.published=true; await writeFile(state,JSON.stringify(current));
      console.log(JSON.stringify({publish_results:current.results}));
      process.exit(current.scenario==="receipt-status"?0:1);
    }
  }
}
`, { mode: 0o700 });
  const environment = { ...process.env, PIPELINE_WORKER_HOST: "127.0.0.1", PIPELINE_WORKER_PORT: "0", PIPELINE_WORKER_TOKEN: "uncertainty-test",
    PIPELINE_WORKSPACE_ROOT: root, PIPELINE_WORKER_STATE_FILE: join(root, "jobs.json"), PIPELINE_WORKER_ACCOUNT_STATE_FILE: join(root, "accounts.json"),
    PIPELINE_WORKER_FREE_BYTES: "1", PIPELINE_WORKER_JOB_RESERVE_BYTES: "1", BUN_BIN: runner };
  let child: ReturnType<typeof Bun.spawn> | undefined;
  const launch = async () => {
    child = Bun.spawn([process.execPath, join(import.meta.dir, "server.ts")], { env: environment, stdout: "pipe", stderr: "inherit" });
    const reader = (child.stdout as ReadableStream<Uint8Array>).getReader(); const { value } = await reader.read(); reader.releaseLock();
    const address = new TextDecoder().decode(value).match(/listening on (127\.0\.0\.1:\d+)/)?.[1];
    if (!address) throw new Error("Worker did not start"); return `http://${address}`;
  };
  try {
    let url = await launch();
    expect((await fetch(`${url}/v1/accounts/test`, { method: "PUT", headers, body: JSON.stringify({ appId: "FAKE", appSecret: "FAKE", pat: "FAKE" }) })).status).toBe(200);
    const inputs = ["unknown", "overflow", "invalid", "explicit", "receipt-status", "before"].map(scenario => ({ scenario, input: {
      idempotencyKey: scenario, title: "test", body: "body", account: scenario === "before" ? "missing" : "test", contentForm: "article", intentText: scenario,
    } }));
    const finished: Array<{ id: string; scenario: string }> = [];
    for (const { scenario, input } of inputs) {
      const response = await fetch(`${url}/v1/jobs`, { method: "POST", headers, body: JSON.stringify(input) }); expect(response.status).toBe(202);
      const submitted = await response.json(); let current: any;
      for (let attempt = 0; attempt < 200; attempt++) {
        current = await (await fetch(`${url}/v1/jobs/${submitted.id}`, { headers })).json();
        if (["failed", "interrupted"].includes(current.status)) break;
        await Bun.sleep(25);
      }
      expect(current.status).toBe(["explicit", "before"].includes(scenario) ? "failed" : "interrupted");
      if (scenario !== "before") {
        expect(current.runId).toBe(`original-${scenario}`);
        expect(await readFile(join(root, "jobs", current.id, "publish-count.txt"), "utf8")).toBe("publish\n");
      } else expect(current.runId).toBeNull();
      if (scenario === "unknown") expect(current.result.publishResults[0].detail).toContain("WX_RESULT_UNKNOWN");
      if (scenario === "receipt-status") expect(current.result.publishResults[0].external_id).toBe("SIMULATED_RECEIPT_ONLY");
      expect((await (await fetch(`${url}/v1/jobs`, { method: "POST", headers, body: JSON.stringify(input) })).json()).id).toBe(submitted.id);
      finished.push({ id: current.id, scenario });
    }
    child!.kill(); await child!.exited; url = await launch();
    for (const { id, scenario } of finished) {
      const current = await (await fetch(`${url}/v1/jobs/${id}`, { headers })).json();
      expect(current.status).toBe(["explicit", "before"].includes(scenario) ? "failed" : "interrupted");
      if (scenario !== "before") expect(await readFile(join(root, "jobs", id, "publish-count.txt"), "utf8")).toBe("publish\n");
    }
    expect((await readdir(join(root, "jobs"))).length).toBe(5);
  } finally { child?.kill(); await child?.exited; await rm(root, { recursive: true, force: true }); }
}, 30_000);
