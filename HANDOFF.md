# zzhub-pipeline Handoff

## Status: Plugin System Complete

The adapter-based plugin system described in the previous handoff is fully implemented and wired up.

### What was done

1. **Adapter interfaces** — `src/adapter-types.ts`
   - `ImageRenderPlugin` with `render()` + `doctor()`
   - `MarkdownRenderPlugin` with `render()` + `doctor()`

2. **Built-in adapters** — `src/adapters/`
   - `builtin-image-renderer.ts` — wraps imgx (runRenderCardCli + runRenderArticleCli)
   - `builtin-markdown-renderer.ts` — wraps wechat-preview (exportMarkdownToWechatHtml)

3. **Adapter loader** — `src/adapter-loader.ts`
   - `resolveImageRenderer(config)` — loads user plugin or returns builtin
   - `resolveMarkdownRenderer(config)` — same for markdown
   - `runPluginDoctorChecks(config)` — runs doctor on all plugins

4. **Wired into commands**
   - `render.ts` — calls `resolveImageRenderer(config).render()`
   - `providers/index.ts` — calls `resolveMarkdownRenderer(config).render()`
   - `wechat-export.ts` — calls `resolveMarkdownRenderer(config).render()`
   - `providers/zotepad.ts` — deleted (replaced by adapter)

5. **Doctor checks** — `doctor` command reports plugin health
   - `@napi-rs/canvas` availability (image renderer)
   - Chrome availability (markdown renderer)

6. **Runtime error guidance**
   - Chrome missing → install instructions
   - Canvas missing → install instructions
   - Fonts missing → auto-download from CDN

7. **npm distribution** — `@zzhub/pipeline`
   - `bun run build:npm` → 0.59MB bundle + assets
   - Fonts downloaded at runtime via `ZZHUB_FONT_CDN_BASE_URL`

### Verification

```bash
bun x tsc --noEmit    # clean
bun test               # 328/328 pass
bun run build:npm      # 0.59MB bundle
bun src/cli.ts doctor  # reports canvas ✓, chrome ✓
```

### Config override

```json
{
  "plugins": {
    "imageRenderer": "./my-image-renderer.js",
    "markdownRenderer": "./my-md-renderer.js"
  }
}
```

### Next possible directions

- Split official adapters into separate npm packages (`@zzhub-pipeline/render-imgx`, `@zzhub-pipeline/markdown-wechat`)
- Plugin marketplace or registry
- Compiled standalone binary distribution
