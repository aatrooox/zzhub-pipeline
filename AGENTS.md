# AGENTS.md — zzhub-pipeline

Agent-oriented content-publishing state machine for WeChat articles and newspic image sets.

## Runtime & toolchain

- Runtime: Bun, not Node. All commands use `bun run src/cli.ts`.
- TypeScript: strict mode, `noUnusedLocals`, `noUnusedParameters`, so the compiler rejects unused variables.
- Module resolution: `"bundler"`, use ESM imports only, no CommonJS.
- Test runner: `bun test`, not Jest or Vitest. Main test file: `src/workflow.test.ts`.
- Typecheck: `bun x tsc --noEmit`, separate from tests.

## Key commands

```bash
# Run any CLI command, two equivalent aliases
bun run src/cli.ts <command> [options]
# or via installed binary:
zzhub-pipeline <command> [options]
zzp <command> [options]

# Run all tests
bun test

# Run a specific test file
bun test src/workflow.test.ts

# Typecheck without building
bun x tsc --noEmit

# Build WeChat preview bundle, separate Vite config
bun run build:wechat-preview
```

## Agent workflow loop

The only correct agent procedure is:

1. Find the active task:
   `bun run src/cli.ts find-run --workspace {ws} --active --view agent`
   Or list all active tasks:
   `bun run src/cli.ts tasks --workspace {ws} --active --view agent`
2. If no task exists, create one with `init`.
3. Check current state:
   `bun run src/cli.ts status --state {state_path} --view agent`
4. Read `next_action` from the output.
5. Execute only the action identified by `next_action.action`.
6. Re-run `status` to confirm progress.
7. Repeat until `mode` is `done`.

Do not:

- Scan session history to guess the current task.
- Modify `workflow-state.json` directly.
- Skip `status` or `reconcile` and assume the next step.
- Execute multiple steps without checking status between them.

`--view agent` output includes:

- `next_action.action`, the next step/action identifier.
- `next_action.reason`, why this action is needed.
- `next_action.params`, which may include `state_path`, `spawn`, `requires_research`, `source_body_path`, and `feedback`.
- `gaps`, missing materials.
- `blockers`, blocking issues.

Use `--view agent` for `find-run`, `tasks`, and `status` whenever an agent needs the next step.

## State machine rules

- Prefer `updateState(path, mutate)` for new work. Some existing commands still use `readState` and `writeState` directly in parts of the codebase.
- Never write `workflow-state.json` by hand.
- `content_review.status` must be `"passed"` before `render` or `publish` can proceed.
- `redo_hint` is set by `reset --mode redo.*` and cleared by `prepare-finalize`, so leave it alone.
- Body text is never stored in state. It lives in `{workspace}/.zzhub-media/tmp/{run_id}/`.

## State file locations

- Run state, temporary: `{workspace}/.zzhub-media/runs/{run_id}.json`
- Canonical state, after finalize: `{workspace}/posts/{date-slug}/workflow-state.json`
- Body text workspace: `{workspace}/.zzhub-media/tmp/{run_id}/`

## Workflow routes and targets

Only two active workflow routes exist:

- `wechat-article`, WeChat public account article, HTML export.
- `wechat-newspic`, WeChat image message, multi-page PNG set.

`blog` is not a workflow route. It is only a post-hoc sync via `sync-blog`.

## Output and view modes

- Default output is raw JSON, which works well for agents, pipes, and redirects.
- `--view markdown` renders a structured markdown table.
- `--view agent` renders agent-optimized markdown with an explicit `next_action.params` block.
- Agents should use `--view agent` for `find-run`, `tasks`, and `status`.
- TTY output is pretty-printed when stdout is a terminal, raw JSON otherwise.
- `NO_COLOR=1` forces raw JSON.
- `FORCE_COLOR=1` forces pretty output.

## Directory layout

```text
src/
  cli.ts               # Entrypoint, dispatches to command registry
  plugins.ts           # Command registry, workflow and ops plugin groups
  state.ts             # WorkflowState type + CRUD, authoritative contract
  task-manager.ts      # listTasks / findTask / getTaskByStatePath
  task-views.ts        # markdown and agent view renderers
  workflow-materials.ts# body path resolution, body-input reconciliation
  routes.ts            # deterministic routing, keyword match + account resolution
  profiles.ts          # authoring rules, rewrite_allowed, style_mode decision tree
  output.ts            # TTY-aware output layer, printResult and pretty renderers
  config.ts            # config loading, env overrides, workspace path resolution
  adapter-types.ts     # ImageRenderPlugin / MarkdownRenderPlugin interfaces
  adapter-loader.ts    # resolveImageRenderer / resolveMarkdownRenderer / runPluginDoctorChecks
  runtime-paths.ts     # asset path resolution (dev/compiled/npm modes), font cache
  adapters/            # built-in adapter implementations
  commands/            # one file per CLI command
  imgx/                # image rendering subsystem, Chrome headless + @napi-rs/canvas
  providers/           # publish providers, wechat, cos, blog
  wechat-preview/      # WeChat article HTML preview, Milkdown + themes
```

## Config

Config file location on macOS: `~/Library/Application Support/zzhub-pipeline/config.json`

Override with `ZZHUB_PIPELINE_CONFIG=/abs/path/config.json`

Other env overrides: `ZZHUB_PIPELINE_WORKSPACE_ROOT`, `ZZHUB_PIPELINE_POSTS_DIR`, `ZZHUB_PIPELINE_BLOG_ROOT`.

Tests isolate config with `process.env.ZZHUB_PIPELINE_CONFIG = <tmp path>`.

## Chrome dependency

Rendering requires headless Chrome. `findChrome()` in `src/imgx/runtime.ts` probes these paths in order:

1. `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
2. `/Applications/Chromium.app/Contents/MacOS/Chromium`
3. `google-chrome` from PATH
4. `chromium` from PATH

Chrome must be installed for `render` and `wechat-export`. Checked by the builtin markdown renderer adapter's `doctor()` method.

Viewport inset quirk: Chrome CLI `--window-size=900,1200` does not guarantee `innerHeight=1200`. The runtime measures the real inset, over-captures, then crops. If a footer looks clipped, check this layer first, not the template CSS.

## Plugin system

Rendering is pluggable via `config.plugins`. Two adapter interfaces exist:

- `ImageRenderPlugin` — replaces imgx for image rendering (poster, longform, cover)
- `MarkdownRenderPlugin` — replaces wechat-preview for WeChat HTML export

Config override (local file path or npm package):

```json
{
  "plugins": {
    "imageRenderer": "./my-image-renderer.js",
    "markdownRenderer": "./my-md-renderer.js"
  }
}
```

When unset, built-in adapters (`builtin-imgx`, `builtin-wechat-preview`) are used.

Key files:
- `src/adapter-types.ts` — interfaces (`ImageRenderPlugin`, `MarkdownRenderPlugin`, `PipelinePluginDoctorCheck`)
- `src/adapter-loader.ts` — `resolveImageRenderer()`, `resolveMarkdownRenderer()`, `runPluginDoctorChecks()`
- `src/adapters/builtin-image-renderer.ts` — wraps imgx
- `src/adapters/builtin-markdown-renderer.ts` — wraps wechat-preview

Runtime dependency checks:
- `@napi-rs/canvas` — checked by image renderer `doctor()`, lazy-loaded in `pretext-runtime.ts`
- Chrome — checked by markdown renderer `doctor()`, error includes install guidance
- CJK fonts — auto-downloaded via `ensureFonts()` in `runtime-paths.ts`

## npm distribution

Published as `@zzhub/pipeline`. Build: `bun run build:npm`.

- CLI entry: `dist/cli.js` (0.59MB bundle, `--external @napi-rs/canvas --external cos-nodejs-sdk-v5`)
- Static assets: `dist/assets/` (templates, icons, browser-dist, pretext)
- Fonts: NOT bundled — downloaded at runtime from `ZZHUB_FONT_CDN_BASE_URL` to `~/.config/zzhub-pipeline/fonts/`
- Usage: `npx zzp <command>` or `npx zzhub-pipeline <command>`

## Adding a new command

1. Create `src/commands/<name>.ts` exporting `async function <camelName>(args: string[]): Promise<void>`.
2. Register it in `src/plugins.ts` under the correct plugin group.
3. The CLI auto-discovers registered commands, so no other wiring is needed.

Key patterns:

- Parse args with `parseArgs` from `src/args.ts`.
- Output with `printResult(data, renderer)` from `src/output.ts`, never raw `console.log`.
- Prefer `updateState(path, mutate)` from `src/state.ts` for new stateful work; existing commands may still use `readState` and `writeState` directly.
- Load config through `loadConfig()` from `src/config.ts`.

## newspic longform pagination

Two pagination modes coexist:

- Auto-flow, the default, fills pages in order.
- Spec-driven, enabled when `page_specs` is present in `newspic_render`, follows the spec.

To pin text to a page, add explicit markers in the body and provide `page_specs`:

```text
【第一页】
...
【第二页】
...
```

`【Page 1】` is also accepted. Without `page_specs`, these markers are ignored.

`target_fill_ratio` is clamped to `0.35` to `0.95`, with `0.8` as the default. Page-level spec takes priority over the top-level value.
