# zzhub-pipeline Handoff

## Current Focus

Next session should focus on making render and markdown export replaceable through user plugins before trying to split official packages or publish npm binaries.

The immediate goal is:

- Keep existing default behavior unchanged.
- Add a stable adapter boundary for image rendering and markdown rendering.
- Allow config to override the default adapters with user-provided local plugins.
- Keep `zzp` responsible for workflow state, gaps, next action, command routing, and state writeback.

Do not start by building a full plugin marketplace or splitting packages into separate npm modules.

## Product Decision

`zzhub-pipeline` should move toward:

```text
zzp core
  - init / attach / prepare / status / tasks / publish state machine
  - workflow-state contract
  - config loading
  - doctor aggregation
  - adapter loading and invocation

default adapters
  - built-in imgx image renderer
  - built-in WeChat markdown renderer

user adapters
  - local plugin path first
  - npm package support later
```

This keeps the core small enough to distribute independently while leaving render and layout choices replaceable.

## Why

The two largest and most opinionated parts are:

- `src/imgx/` image rendering: deterministic fallback when AI image generation is not desired.
- `src/wechat-preview/` markdown to WeChat HTML/export rendering: personal layout and account style varies heavily.

Users may want to replace these with AI image generation, ComfyUI, a custom HTML renderer, a SaaS API, or their own WeChat formatting rules.

## Non-Goals For First Pass

- Do not remove built-in imgx.
- Do not remove built-in WeChat markdown rendering.
- Do not publish official plugin packages yet.
- Do not redesign workflow-state broadly.
- Do not move external app, desktop, or agent runtime concerns into this repo.

## Suggested First Implementation Slice

1. Add internal adapter interfaces.
   - Image renderer adapter.
   - Markdown renderer adapter.
   - Doctor check adapter shape if needed.

2. Wrap existing implementations.
   - Built-in image adapter delegates to current `render` / `src/imgx` behavior.
   - Built-in markdown adapter delegates to current `src/wechat-preview` behavior.

3. Add config overrides.
   - Start with local file paths only.
   - Example shape:

```json
{
  "plugins": {
    "imageRenderer": "./plugins/my-image-renderer.js",
    "markdownRenderer": "./plugins/my-wechat-renderer.js"
  }
}
```

4. Load configured adapters.
   - If unset, use built-in adapters.
   - If configured path fails to load, fail clearly with a doctor/check error.
   - Avoid silent fallback when a user explicitly configured a plugin.

5. Update `doctor`.
   - Core doctor should report configured adapter identity.
   - Adapter doctor checks should report missing runtime dependencies such as Chrome.
   - Chrome should belong to the built-in imgx adapter check, not the core check.

6. Add focused tests.
   - Default behavior still uses built-ins.
   - Configured local image adapter is called.
   - Configured local markdown adapter is called.
   - Broken configured adapter surfaces a clear error.

## Possible Interfaces

Keep the contracts small and state-oriented.

```ts
export interface PipelinePluginDoctorCheck {
  name: string
  ok: boolean
  message?: string
  detail?: unknown
}

export interface ImageRenderPlugin {
  name: string
  version?: string
  doctor?: () => Promise<PipelinePluginDoctorCheck[]>
  render: (input: ImageRenderInput) => Promise<ImageRenderOutput>
}

export interface MarkdownRenderPlugin {
  name: string
  version?: string
  doctor?: () => Promise<PipelinePluginDoctorCheck[]>
  render: (input: MarkdownRenderInput) => Promise<MarkdownRenderOutput>
}
```

Image output should map cleanly back to existing `state.images.render_assets`.
Markdown output should map cleanly to current WeChat export results.

## Files To Inspect First

- `src/commands/render.ts` — current image render command and state writeback.
- `src/imgx/` — built-in image rendering subsystem and asset paths.
- `src/wechat-preview/index.ts` — current markdown export implementation.
- `src/commands/wechat-export.ts` — current command entry for markdown export.
- `src/config.ts` — config shape and file loading.
- `src/commands/doctor.ts` — environment checks.
- `src/task-manager.ts` — gaps and next action behavior.
- `src/state.ts` — workflow-state contract.
- `src/workflow.test.ts` — broad workflow regression coverage.

## Important Constraints

- Runtime is Bun.
- Existing commands use `bun run src/cli.ts`.
- Default output is JSON unless TTY pretty printing is active.
- `--view agent` is the contract surface for agents.
- Do not hand-edit `workflow-state.json`; use existing state helpers.
- Rendering requires Chrome only for the built-in render/export paths.
- A future compiled `zzp` binary should not imply Chrome is bundled.

## Verification Baseline

Run at least:

```bash
bun test
bun x tsc --noEmit
```

For CLI smoke:

```bash
bun run src/cli.ts doctor
bun run src/cli.ts --help
```

If touching WeChat preview assets:

```bash
bun run build:wechat-preview
```

## Distribution Direction After Adapter Boundary

Only after adapter replacement works locally:

- Compile `zzp` core as a standalone binary.
- Consider publishing npm packages that contain binary artifacts only.
- Consider splitting official adapters into packages:
  - `@zzhub-pipeline/render-imgx`
  - `@zzhub-pipeline/markdown-wechat`

Do this after the adapter contract is stable enough to avoid package churn.
