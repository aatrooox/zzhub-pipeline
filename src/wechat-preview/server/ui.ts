import { escapeHtml } from "../../imgx/runtime";

export function renderDashboardHtml(baseUrl: string): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>WeChat Preview Server</title>
  <style>
    :root {
      --bg: #f3f1f2;
      --panel: #ffffff;
      --ink: #292526;
      --muted: #6f696b;
      --border: #e2dcdf;
      --ok: #2f7d4a;
      --fail: #b42318;
      --accent: #a94473;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      color: var(--ink);
      background: var(--bg);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }
    header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px;
      background: var(--panel);
      border-bottom: 1px solid var(--border);
    }
    header h1 {
      margin: 0;
      font-size: 15px;
      font-weight: 650;
      letter-spacing: 0.02em;
    }
    header .meta { color: var(--muted); font-size: 12px; margin-left: auto; }
    header button {
      border: 1px solid var(--border);
      background: #fff;
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 12px;
      cursor: pointer;
    }
    header button:hover { border-color: var(--accent); color: var(--accent); }
    .layout { display: flex; flex: 1; min-height: 0; }
    aside {
      width: 300px;
      background: var(--panel);
      border-right: 1px solid var(--border);
      overflow: auto;
      padding: 8px;
    }
    .entry {
      display: block;
      width: 100%;
      text-align: left;
      border: 1px solid transparent;
      background: transparent;
      border-radius: 10px;
      padding: 10px 10px;
      margin-bottom: 4px;
      cursor: pointer;
      color: inherit;
      font: inherit;
    }
    .entry:hover { background: #faf7f8; }
    .entry.active { border-color: #e8c9d7; background: #fdf6f9; }
    .entry .title {
      font-size: 13px;
      font-weight: 600;
      line-height: 1.35;
      margin-bottom: 4px;
      word-break: break-word;
    }
    .entry .row {
      display: flex;
      gap: 8px;
      align-items: center;
      font-size: 11px;
      color: var(--muted);
    }
    .badge {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 999px;
      font-size: 10px;
      font-weight: 650;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .badge.ok { background: #e8f6ec; color: var(--ok); }
    .badge.fail { background: #fdecea; color: var(--fail); }
    main {
      flex: 1;
      min-width: 0;
      display: flex;
      flex-direction: column;
    }
    .toolbar {
      display: flex;
      gap: 10px;
      align-items: center;
      padding: 10px 16px;
      border-bottom: 1px solid var(--border);
      background: rgba(255,255,255,0.7);
      font-size: 12px;
      color: var(--muted);
    }
    .toolbar a { color: var(--accent); }
    .stage {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 20px 16px 40px;
    }
    iframe {
      display: block;
      width: min(430px, 100%);
      height: calc(100vh - 140px);
      min-height: 640px;
      margin: 0 auto;
      border: 0;
      border-radius: 16px;
      background: #fff;
      box-shadow: 0 12px 36px rgba(38, 30, 34, 0.10);
    }
    .empty, .error-panel {
      max-width: 560px;
      margin: 48px auto;
      background: var(--panel);
      border-radius: 14px;
      padding: 24px;
      box-shadow: 0 8px 24px rgba(38, 30, 34, 0.06);
    }
    .error-panel h2 { margin: 0 0 8px; font-size: 16px; color: var(--fail); }
    .error-panel pre {
      white-space: pre-wrap;
      word-break: break-word;
      background: #faf7f8;
      border-radius: 10px;
      padding: 12px;
      font-size: 12px;
      line-height: 1.5;
      overflow: auto;
    }
    .empty { color: var(--muted); text-align: center; }
  </style>
</head>
<body>
  <header>
    <h1>WeChat Preview</h1>
    <button type="button" id="btn-refresh">刷新</button>
    <button type="button" id="btn-clear">清空</button>
    <span class="meta" id="server-meta">${escapeHtml(baseUrl)}</span>
  </header>
  <div class="layout">
    <aside id="list"></aside>
    <main>
      <div class="toolbar" id="toolbar">选择左侧导出结果进行预览</div>
      <div class="stage" id="stage">
        <div class="empty">还没有预览条目。运行 <code>wechat-export</code> 后会自动登记到这里。</div>
      </div>
    </main>
  </div>
  <script>
    const state = { entries: [], activeId: null };

    async function api(path, options) {
      const res = await fetch(path, options);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || res.statusText);
      }
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) return res.json();
      return res.text();
    }

    function fmtTime(iso) {
      try {
        const d = new Date(iso);
        return d.toLocaleString();
      } catch { return iso; }
    }

    function renderList() {
      const list = document.getElementById("list");
      if (!state.entries.length) {
        list.innerHTML = '<div class="empty" style="margin:16px;box-shadow:none;padding:12px;">暂无条目</div>';
        return;
      }
      list.innerHTML = state.entries.map((e) => {
        const active = e.id === state.activeId ? " active" : "";
        const badge = e.status === "success"
          ? '<span class="badge ok">ok</span>'
          : '<span class="badge fail">fail</span>';
        return \`<button type="button" class="entry\${active}" data-id="\${e.id}">
          <div class="title">\${escape(e.title)}</div>
          <div class="row">\${badge}<span>\${escape(e.account)}</span><span>\${e.duration_ms}ms</span></div>
          <div class="row">\${escape(fmtTime(e.created_at))}</div>
        </button>\`;
      }).join("");
      list.querySelectorAll(".entry").forEach((btn) => {
        btn.addEventListener("click", () => selectEntry(btn.getAttribute("data-id")));
      });
    }

    function escape(s) {
      return String(s ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");
    }

    async function selectEntry(id) {
      state.activeId = id;
      renderList();
      const entry = state.entries.find((e) => e.id === id);
      const toolbar = document.getElementById("toolbar");
      const stage = document.getElementById("stage");
      if (!entry) return;

      toolbar.innerHTML = \`
        <strong style="color:var(--ink)">\${escape(entry.title)}</strong>
        <span>· \${escape(entry.account)}</span>
        <span>· \${entry.duration_ms}ms</span>
        <a href="/e/\${encodeURIComponent(id)}" target="_blank" rel="noreferrer">新窗口打开</a>
        \${entry.html_path ? \`<span title="\${escape(entry.html_path)}">disk</span>\` : ""}
      \`;

      if (entry.status === "failed") {
        const detail = await api("/api/entries/" + encodeURIComponent(id));
        const debug = detail.debug ? JSON.stringify(detail.debug, null, 2) : "";
        stage.innerHTML = \`
          <div class="error-panel">
            <h2>渲染失败 · \${escape(detail.error_kind || "error")}</h2>
            <pre>\${escape(detail.error || "unknown error")}</pre>
            \${debug ? \`<h3 style="font-size:13px;margin:16px 0 8px;color:var(--muted)">debug</h3><pre>\${escape(debug)}</pre>\` : ""}
          </div>
        \`;
        return;
      }

      stage.innerHTML = \`<iframe title="preview" src="/e/\${encodeURIComponent(id)}"></iframe>\`;
    }

    async function refresh() {
      state.entries = await api("/api/entries");
      renderList();
      if (state.activeId && state.entries.some((e) => e.id === state.activeId)) {
        await selectEntry(state.activeId);
      } else if (state.entries[0]) {
        await selectEntry(state.entries[0].id);
      } else {
        state.activeId = null;
        document.getElementById("stage").innerHTML =
          '<div class="empty">还没有预览条目。运行 <code>wechat-export</code> 后会自动登记到这里。</div>';
        document.getElementById("toolbar").textContent = "选择左侧导出结果进行预览";
      }
    }

    document.getElementById("btn-refresh").addEventListener("click", () => refresh().catch(alert));
    document.getElementById("btn-clear").addEventListener("click", async () => {
      if (!confirm("清空全部预览条目？")) return;
      await api("/api/entries", { method: "DELETE" });
      state.activeId = null;
      await refresh();
    });

    refresh().catch((err) => {
      document.getElementById("stage").innerHTML =
        '<div class="error-panel"><h2>加载失败</h2><pre>' + escape(err.message) + "</pre></div>";
    });

    // Auto-refresh list every 3s while page is open
    setInterval(() => {
      refresh().catch(() => {});
    }, 3000);
  </script>
</body>
</html>`;
}

export function renderFailedEntryHtml(entry: {
  title: string;
  error?: string;
  error_kind?: string;
  debug?: unknown;
}): string {
  const debug = entry.debug ? JSON.stringify(entry.debug, null, 2) : "";
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(entry.title)} · failed</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", sans-serif; background: #f3f1f2; color: #292526; }
    main { max-width: 640px; margin: 40px auto; background: #fff; border-radius: 14px; padding: 24px; box-shadow: 0 8px 24px rgba(38,30,34,.08); }
    h1 { font-size: 18px; color: #b42318; margin: 0 0 8px; }
    pre { white-space: pre-wrap; word-break: break-word; background: #faf7f8; padding: 12px; border-radius: 10px; font-size: 12px; line-height: 1.5; }
  </style>
</head>
<body>
  <main>
    <h1>渲染失败 · ${escapeHtml(entry.error_kind || "error")}</h1>
    <p>${escapeHtml(entry.title)}</p>
    <pre>${escapeHtml(entry.error || "unknown error")}</pre>
    ${debug ? `<h2 style="font-size:14px;color:#6f696b">debug</h2><pre>${escapeHtml(debug)}</pre>` : ""}
  </main>
</body>
</html>`;
}
