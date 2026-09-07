import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { injectStaticRenderStyle } from "./runtime";

/** 等待真实资源和排版 Promise，就绪后在同一浏览器页面立即截图。 */
export async function screenshotReadyHtml(options: {
  chromePath: string; html: string; outPath: string; width: number; height: number;
  cover?: boolean;
}): Promise<void> {
  const directory = await mkdtemp(join(tmpdir(), "zzhub-chrome-"));
  const htmlPath = join(directory, "render.html");
  await writeFile(htmlPath, injectStaticRenderStyle(options.html));
  const chrome = Bun.spawn([
    options.chromePath, "--headless", "--disable-gpu", "--no-sandbox", "--no-first-run",
    "--no-default-browser-check", "--disable-background-networking", "--allow-file-access-from-files",
    "--remote-debugging-port=0", `--user-data-dir=${join(directory, "profile")}`, "about:blank",
  ], { stdout: "ignore", stderr: "pipe" });
  let socket: WebSocket | undefined;
  let nextId = 0;
  let timedOut = false;
  const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
  let onLoad: (() => void) | undefined;
  let rejectLoad: ((error: Error) => void) | undefined;
  function fail(error: Error) {
    for (const operation of pending.values()) operation.reject(error);
    pending.clear();
    rejectLoad?.(error);
  }
  // 仅作为卡死保护，成功路径不会等满这个上限。
  const deadline = setTimeout(() => {
    timedOut = true;
    fail(new Error("图片渲染超时：字体、图片或排版未就绪"));
    socket?.close();
    if (chrome.exitCode === null) chrome.kill("SIGKILL");
  }, 30_000);
  try {
    let stderr = "";
    let endpoint = "";
    const reader = chrome.stderr.getReader();
    const decoder = new TextDecoder();
    while (!endpoint) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(timedOut ? "Chrome 启动超时" : "Chrome 未能启动渲染会话");
      stderr = (stderr + decoder.decode(chunk.value, { stream: true })).slice(-16_384);
      endpoint = stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1] ?? "";
    }
    // 继续消费日志，避免浏览器因 stderr 管道满而阻塞。
    const drain = (async () => { while (!(await reader.read()).done) { /* 丢弃运行日志 */ } })();
    void drain.catch(() => {});
    socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => {
      socket!.addEventListener("open", () => resolve(), { once: true });
      socket!.addEventListener("error", () => reject(new Error("无法连接 Chrome 渲染会话")), { once: true });
      socket!.addEventListener("close", () => reject(new Error("Chrome 渲染会话已关闭")), { once: true });
    });
    socket.addEventListener("message", event => {
      const message = JSON.parse(String(event.data));
      if (message.method === "Page.loadEventFired") onLoad?.();
      const operation = pending.get(message.id);
      if (!operation) return;
      pending.delete(message.id);
      if (message.error) operation.reject(new Error(message.error.message));
      else operation.resolve(message.result);
    });
    socket.addEventListener("close", () => fail(new Error("Chrome 渲染会话意外关闭")));
    function send(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<any> {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket!.send(JSON.stringify({ id, method, params, sessionId }));
      });
    }
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    await send("Page.enable", {}, sessionId);
    await send("Emulation.setDeviceMetricsOverride", { width: options.width, height: options.height, deviceScaleFactor: 1, mobile: false }, sessionId);
    const loaded = new Promise<void>((resolve, reject) => { onLoad = resolve; rejectLoad = reject; });
    await Promise.all([
      send("Page.navigate", { url: pathToFileURL(htmlPath).href }, sessionId).then(navigation => {
        if (navigation.errorText) throw new Error(navigation.errorText);
      }),
      loaded,
    ]);
    const ready = await send("Runtime.evaluate", {
      expression: `(async () => {
        await window.__zzhubRenderReady;
        await document.fonts.ready;
        await Promise.all([...document.images].map(image => image.decode()));
        if (${Boolean(options.cover)} && document.documentElement.dataset.coverStatus !== 'ready') {
          throw new Error(decodeURIComponent(document.documentElement.dataset.coverError || '封面排版未就绪'));
        }
        await new Promise(resolve => requestAnimationFrame(resolve));
        return true;
      })()`,
      awaitPromise: true, returnByValue: true,
    }, sessionId);
    if (ready.exceptionDetails) throw new Error(ready.exceptionDetails.exception?.description ?? ready.exceptionDetails.text);
    const screenshot = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }, sessionId);
    await mkdir(dirname(options.outPath), { recursive: true });
    await writeFile(options.outPath, Buffer.from(screenshot.data, "base64"));
  } finally {
    clearTimeout(deadline);
    socket?.close();
    if (chrome.exitCode === null) chrome.kill("SIGKILL");
    await chrome.exited;
    await rm(directory, { recursive: true, force: true });
  }
}
