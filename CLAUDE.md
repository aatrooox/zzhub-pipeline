# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Agent-oriented content-publishing state machine for WeChat articles and newspic image sets. CLI tool (`zzp`) that manages workflow state from intent → prepare → render → publish.

## Runtime & toolchain

- **Bun** runtime, not Node. All commands use `bun run src/cli.ts`.
- TypeScript strict mode, `noUnusedLocals`, `noUnusedParameters` — compiler rejects unused variables.
- ESM only, `"moduleResolution": "bundler"`.
- Test runner: `bun test` (not Jest/Vitest). Main test file: `src/workflow.test.ts`.
- Typecheck: `bun x tsc --noEmit`.

## Common commands

```bash
bun test                              # all tests
bun test src/workflow.test.ts         # single test file
bun x tsc --noEmit                    # typecheck
bun run src/cli.ts <command>          # run CLI in dev mode
bun run build:npm                     # build for npm publish
bun run build:wechat-preview          # rebuild wechat-preview Vite bundle
bun run release:patch                 # changelogen version bump + push
```

## Architecture

**State machine**: Workflow state (`WorkflowState`) drives everything. Commands read state, do work, write updated state. Never edit `workflow-state.json` by hand — use `updateState(path, mutate)`.

**Two workflow routes**: `wechat-article` (HTML export) and `wechat-newspic` (multi-page PNG set). `blog` is post-hoc sync only.

**Plugin system**: Rendering is pluggable via `config.plugins`. Two adapter interfaces:
- `ImageRenderPlugin` — replaces imgx (`src/adapters/builtin-image-renderer.ts`)
- `MarkdownRenderPlugin` — replaces wechat-preview (`src/adapters/builtin-markdown-renderer.ts`)

Loader: `src/adapter-loader.ts` — `resolveImageRenderer(config)` / `resolveMarkdownRenderer(config)`. When `config.plugins.*` is unset, built-in adapters are used.

**Rendering pipeline**: `render.ts` uses the image adapter to generate cover + page images. `providers/index.ts` uses the markdown adapter for WeChat HTML export. Both go through adapter-loader.

**Runtime paths**: `src/runtime-paths.ts` handles three modes — dev (source tree), compiled (`bun build --compile` binary), npm (`dist/` in package). Font cache at `~/.config/zzhub-pipeline/fonts/`, auto-downloaded from CDN.

**Key subsystems**:
- `src/imgx/` — image rendering (Chrome headless + `@napi-rs/canvas`). `pretext-runtime.ts` lazy-loads canvas.
- `src/wechat-preview/` — markdown → WeChat HTML (Milkdown + Chrome). Vite-bundled browser scripts.
- `src/providers/` — publish providers (wechat, cos, blog).
- `src/schema/config.ts` — Zod config schema. `config.ts` loads/merges/saves config.

## State file locations

- Temporary run state: `{workspace}/.zzhub-media/runs/{run_id}.json`
- Canonical state (after finalize): `{workspace}/posts/{date-slug}/workflow-state.json`
- Body text (never in state): `{workspace}/.zzhub-media/tmp/{run_id}/`

## Config

macOS: `~/Library/Application Support/zzhub-pipeline/config.json`
Linux: `~/.config/zzhub-pipeline/config.json`
Override: `ZZHUB_PIPELINE_CONFIG=/abs/path/config.json`

Tests isolate config with `process.env.ZZHUB_PIPELINE_CONFIG = <tmp path>`.

Config import/export: `zzp config --export --raw > backup.json` / `zzp config --import backup.json`. Import merges through Zod schema (unknown fields stripped, defaults applied).

## Adding a new command

1. Create `src/commands/<name>.ts` exporting `async function <camelName>(args: string[]): Promise<void>`
2. Register in `src/plugins.ts`
3. Parse args with `parseArgs` from `src/args.ts`
4. Output with `printResult(data, renderer)` from `src/output.ts`, never raw `console.log`

## Release

Uses changelogen. `bun run release:patch` / `release:minor` / `release:major` — bumps version, updates CHANGELOG.md, commits, tags, and pushes.

## Dependencies note

- `@napi-rs/canvas` and `cos-nodejs-sdk-v5` are **optional** — excluded from npm bundle (`--external`). Canvas is lazy-loaded in `pretext-runtime.ts`.
- Chrome is required for rendering but not bundled. `doctor` command checks availability.
- CJK fonts are NOT in the npm package — downloaded at runtime when `ZZHUB_FONT_CDN_BASE_URL` is set.
