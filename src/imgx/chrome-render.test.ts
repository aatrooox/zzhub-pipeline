import { expect, test } from "bun:test";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG } from "pngjs";
import { dumpReadyHtml, screenshotReadyHtml } from "./chrome-render";
import { findChrome } from "./runtime";

test("capture waits for image and layout readiness instead of a fixed delay", async () => {
  const directory = await mkdtemp(join(tmpdir(), "zzhub-ready-check-"));
  const requested = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, async fetch() {
    requested.resolve();
    await release.promise;
    return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><rect width="1" height="1" fill="white"/></svg>', { headers: { "content-type": "image/svg+xml" } });
  } });
  let finished = false;
  const outPath = join(directory, "ready.png");
  const capturing = screenshotReadyHtml({
    chromePath: findChrome()!, outPath, width: 200, height: 100,
    html: `<html><body style="margin:0;background:#ff0000"><img id="image" src="http://127.0.0.1:${server.port}/image.svg"><script>window.__zzhubRenderReady = document.getElementById('image').decode().then(() => {document.body.style.background='#22aa66'});</script></body></html>`,
  }).then(() => { finished = true; });
  try {
    await Promise.race([requested.promise, capturing]);
    expect(finished).toBe(false);
    release.resolve();
    await capturing;
    const png = PNG.sync.read(await readFile(outPath));
    const offset = (50 * png.width + 100) * 4;
    expect([...png.data.slice(offset, offset + 4)]).toEqual([34, 170, 102, 255]);
  } finally {
    release.resolve();
    await capturing.catch(() => {});
    await server.stop(true);
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);

test("DOM export uses a real deadline and cleans up Chrome after timeout or startup failure", async () => {
  const directories = async () => (await readdir(tmpdir())).filter(name => name.startsWith("zzhub-chrome-")).sort();
  const before = await directories();
  const started = Date.now();
  await expect(dumpReadyHtml({
    chromePath: findChrome()!, timeoutMs: 2000,
    html: '<html><body><script>window.__zzhubRenderReady = new Promise(() => {});</script></body></html>',
  })).rejects.toMatchObject({ kind: "timeout" });
  expect(Date.now() - started).toBeGreaterThanOrEqual(1900);
  expect(Date.now() - started).toBeLessThan(8000);
  await expect(dumpReadyHtml({ chromePath: "/missing/chrome", html: "", timeoutMs: 2000 }))
    .rejects.toMatchObject({ kind: "chrome_failed" });
  expect(await directories()).toEqual(before);
}, 15_000);
