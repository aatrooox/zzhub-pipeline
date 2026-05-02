# Rewrite README.md, AGENTS.md & Create Agent Skills

## TL;DR
> **Summary**: Rewrite outdated README.md (human-developer focused) and AGENTS.md (agent-focused), then create 4 agent skills in `skills/` directory covering workflow operation, code contribution, imgx rendering, and debugging.
> **Deliverables**: README.md, AGENTS.md, skills/workflow-operation/SKILL.md, skills/code-contribution/SKILL.md, skills/imgx-rendering/SKILL.md, skills/debugging-troubleshooting/SKILL.md
> **Effort**: Medium
> **Parallel**: YES - 3 waves
> **Critical Path**: Task 1 (README) + Task 2 (AGENTS) -> Tasks 3-6 (skills, parallel) -> Task 7 (verification)

## Context

### Original Request
User wants to rewrite README.md and AGENTS.md because they are outdated, and create agent-friendly skills at project root.

### Interview Summary
- README targets human developers primarily; agent guidance goes to AGENTS.md and skills
- All 4 skill categories: workflow-operation, code-contribution, imgx-rendering, debugging-troubleshooting
- Agent.md reference in AGENTS.md removed (file doesn't exist)
- Skills in English, docs in Chinese (matching current style)

### Metis Review (gaps addressed)
- Documentation ownership matrix defined: README = human onboarding, AGENTS.md = agent rules, skills = task playbooks
- Anti-duplication guardrails: each doc has Must NOT Have section
- All command/subsystem claims validated against actual code
- Terminology consistency enforced (binary aliases, Bun usage, Chinese/English split)

## Work Objectives

### Core Objective
Replace outdated documentation with accurate, well-structured docs reflecting the actual codebase state (22 commands, imgx subsystem, providers, config system, output layer).

### Deliverables
- `README.md` — human-developer focused project overview and reference
- `AGENTS.md` — agent-focused workflow rules, constraints, verification commands
- `skills/workflow-operation/SKILL.md` — agent playbook for operating the workflow state machine
- `skills/code-contribution/SKILL.md` — agent playbook for code changes
- `skills/imgx-rendering/SKILL.md` — agent playbook for image rendering subsystem
- `skills/debugging-troubleshooting/SKILL.md` — agent playbook for diagnosing issues

### Definition of Done (verifiable conditions with commands)
- `cat README.md | head -5` shows updated content
- `grep 'Agent.md' AGENTS.md` returns empty (no stale reference)
- `ls skills/*/SKILL.md` returns exactly 4 files
- All 22 commands mentioned across docs match `src/plugins.ts` registry
- `bun test` still passes (no code changes)
- `bun x tsc --noEmit` still passes (no code changes)

### Must Have
- Complete command inventory (all 22 commands from plugins.ts)
- Accurate directory layout reflecting actual src/ structure
- Config system documentation (paths, env overrides, platform detection)
- imgx subsystem coverage (templates, themes, geometry, pretext)
- Provider documentation (wechat, cos, zotepad, blog)
- Output system (TTY detection, --view modes, JSON/pretty)
- Binary aliases (`zzhub-pipeline` and `zzp`)

### Must NOT Have (guardrails)
- README must NOT contain agent workflow loop (that belongs in AGENTS.md)
- AGENTS.md must NOT reference nonexistent files (Agent.md, state-contract.md)
- Skills must NOT duplicate entire command reference tables (link to README/AGENTS instead)
- No invented behavior — every claim must be verifiable in source code
- No absolute file paths in docs (use relative paths or `{workspace}` placeholders)

## Documentation Ownership Matrix

| Topic | README.md | AGENTS.md | Skills |
|-------|-----------|-----------|--------|
| Project overview & architecture | PRIMARY | brief mention | - |
| Getting started / installation | PRIMARY | - | - |
| Command reference (all 22) | PRIMARY (full table) | subset (workflow-critical) | link only |
| Directory layout | PRIMARY | brief (key files only) | - |
| Config system | PRIMARY | env overrides only | - |
| State machine concepts | overview | PRIMARY (rules) | workflow skill |
| Agent workflow loop | - | PRIMARY | workflow skill (playbook) |
| State mutation rules | - | PRIMARY | - |
| Workflow routes & routing | overview | rules | workflow skill |
| imgx subsystem | overview | - | imgx skill (full) |
| Testing & typecheck | PRIMARY | PRIMARY (commands) | code skill |
| Adding new commands | PRIMARY | - | code skill (playbook) |
| Debugging & doctor | brief | - | debug skill (full) |
| newspic pagination | reference | rules | imgx skill |
| Chrome dependency | PRIMARY | brief | debug skill |
| Provider details | PRIMARY | - | - |
| wechat-preview | PRIMARY | - | - |

## Verification Strategy
> ZERO HUMAN INTERVENTION - all verification is agent-executed.
- Test decision: No code changes, so no new tests. Existing `bun test` and `bun x tsc --noEmit` as regression check.
- QA policy: Every task has agent-executed scenarios verifying file existence, section coverage, and cross-reference consistency.
- Evidence: .sisyphus/evidence/task-{N}-{slug}.{ext}

## Execution Strategy

### Parallel Execution Waves

Wave 1: [Foundation — README + AGENTS rewrite]
- Task 1: Rewrite README.md (writing)
- Task 2: Rewrite AGENTS.md (writing)

Wave 2: [Skills — all 4 in parallel]
- Task 3: Create skills/workflow-operation/SKILL.md (writing)
- Task 4: Create skills/code-contribution/SKILL.md (writing)
- Task 5: Create skills/imgx-rendering/SKILL.md (writing)
- Task 6: Create skills/debugging-troubleshooting/SKILL.md (writing)

Wave 3: [Verification]
- Task 7: Cross-reference validation

### Dependency Matrix
| Task | Blocks | Blocked By |
|------|--------|------------|
| 1 (README) | 3,4,5,6 | - |
| 2 (AGENTS) | 3,4,5,6 | - |
| 3 (workflow skill) | 7 | 1,2 |
| 4 (code skill) | 7 | 1,2 |
| 5 (imgx skill) | 7 | 1,2 |
| 6 (debug skill) | 7 | 1,2 |
| 7 (verification) | - | 3,4,5,6 |

### Agent Dispatch Summary
| Wave | Tasks | Categories |
|------|-------|------------|
| 1 | 2 | writing x2 |
| 2 | 4 | writing x4 |
| 3 | 1 | unspecified-high x1 |

## TODOs

- [x] 1. Rewrite README.md

  **What to do**:
  Rewrite `README.md` in Chinese as a human-developer-focused project document. Structure:

  1. **Title + one-liner** — `zzhub-pipeline`: Agent-oriented content publishing state machine for WeChat
  2. **Core principles** (4 bullets, keep from current README)
  3. **Getting started** — prerequisites (Bun, Chrome for rendering), install (`bun install`), binary aliases (`zzhub-pipeline`, `zzp`), config location
  4. **Architecture overview** — brief description of the state machine model, two workflow routes (wechat-article, wechat-newspic), blog as post-hoc sync
  5. **Directory layout** — updated to reflect ALL actual files:
     - `src/cli.ts` — entrypoint
     - `src/plugins.ts` — command registry (workflow + ops groups)
     - `src/state.ts` — WorkflowState type + CRUD
     - `src/task-manager.ts` — task listing/finding
     - `src/task-views.ts` — markdown/agent view renderers
     - `src/workflow-materials.ts` — body path resolution
     - `src/routes.ts` — deterministic channel routing
     - `src/profiles.ts` — authoring rules (rewrite/style decisions)
     - `src/text.ts` — text formatting utilities (frontmatter, markdown normalization)
     - `src/output.ts` — TTY-aware output layer (pretty/JSON)
     - `src/config.ts` — config loading, env overrides, workspace resolution
     - `src/args.ts` — argument parsing
     - `src/spawn.ts` — child process wrapper with PATH enrichment
     - `src/commands/` — one file per CLI command (22 total)
     - `src/imgx/` — image rendering subsystem
     - `src/providers/` — publish providers (wechat, cos, zotepad, blog)
     - `src/wechat-preview/` — WeChat article HTML preview (Milkdown + themes)
  6. **Command reference** — full table of ALL 22 commands grouped by plugin:
     - workflow (16): init, attach-body, attach-body-images, attach-newspic-spec, prepare, prepare-finalize, render, publish, reconcile, checkpoint, status, find-run, tasks, reset, review, abandon
     - ops (6): sync-blog, imgx, wechat-export, config, doctor, hermes-metrics
     Include the `summary` field from plugins.ts for each command.
  7. **Workflow overview** — mermaid flowchart (keep from current README, verify accuracy)
  8. **State file** — key fields table, body-not-in-state rule, state file locations (run state vs canonical)
  9. **Config system** — config file location (platform-aware), env overrides (`ZZHUB_PIPELINE_CONFIG`, `ZZHUB_PIPELINE_WORKSPACE_ROOT`, `ZZHUB_PIPELINE_POSTS_DIR`, `ZZHUB_PIPELINE_BLOG_ROOT`), legacy zcli migration
  10. **Output system** — TTY detection, `--view json|markdown|agent`, `FORCE_COLOR`, `NO_COLOR`
  11. **imgx subsystem** — brief overview (templates, themes, Chrome dependency, pretext pagination)
  12. **wechat-preview subsystem** — brief overview (Milkdown-based HTML export, themes, `build:wechat-preview`)
  13. **Providers** — brief table: wechat (article draft + newspic), zotepad (HTML export), cos (image CDN), blog (markdown sync)
  14. **Newspic specs** — keep detailed spec documentation from current README (pagination modes, page_specs, target_fill_ratio, page markers, geometry params)
  15. **Testing** — `bun test`, `bun x tsc --noEmit`
  16. **Code reading order** — updated list reflecting actual important files

  **Must NOT do**:
  - Do NOT include agent workflow loop (belongs in AGENTS.md)
  - Do NOT use absolute paths like `/Users/aatrox/...`
  - Do NOT reference `Agent.md` or `state-contract.md`
  - Do NOT invent undocumented CLI flags

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: documentation authoring task
  - Skills: [] - no special skills needed
  - Omitted: [] - N/A

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [3,4,5,6] | Blocked By: []

  **References** (executor has NO interview context — be exhaustive):
  - Current README: `README.md` — use as starting point, preserve good content (mermaid chart, newspic specs, state field table)
  - Command registry: `src/plugins.ts:36-71` — authoritative list of all 22 commands with summaries
  - State types: `src/state.ts:1-203` — WorkflowState and all sub-types
  - Config system: `src/config.ts` — full config structure, env overrides, platform detection
  - Output layer: `src/output.ts` — TTY detection, view modes, pretty renderers
  - Routes: `src/routes.ts` — routing table, account resolution, visual params
  - Profiles: `src/profiles.ts` — authoring decision tree
  - Text utils: `src/text.ts` — formatting functions
  - Spawn: `src/spawn.ts` — bun binary resolution, PATH enrichment
  - Task views: `src/task-views.ts` — view modes (json/markdown/agent)
  - imgx index: `src/imgx/index.ts` — imgx subsystem entry
  - Providers: `src/providers/index.ts` — publish provider registry
  - wechat-preview: `src/wechat-preview/index.ts` — preview subsystem entry
  - Package: `package.json` — binary aliases, scripts, dependencies

  **Acceptance Criteria** (agent-executable only):
  - [ ] README.md exists and starts with `# zzhub-pipeline`
  - [ ] Contains all 22 command names from plugins.ts (grep each)
  - [ ] Contains directory layout section mentioning all key src/ files
  - [ ] Contains config section with all 4 env override variables
  - [ ] Contains no absolute paths starting with `/Users/`
  - [ ] Contains no reference to `Agent.md`
  - [ ] Contains mermaid flowchart
  - [ ] Contains newspic spec documentation
  - [ ] `bun test` passes (regression)

  **QA Scenarios** (MANDATORY):
  ```
  Scenario: All commands documented
    Tool: Bash
    Steps: Extract command names from src/plugins.ts, grep each in README.md
    Expected: All 22 command names found in README.md
    Evidence: .sisyphus/evidence/task-1-readme-commands.txt

  Scenario: No stale references
    Tool: Bash
    Steps: grep -E 'Agent\.md|state-contract\.md|/Users/' README.md
    Expected: No matches (exit code 1)
    Evidence: .sisyphus/evidence/task-1-readme-stale.txt
  ```

  **Commit**: YES | Message: `docs: rewrite README.md with complete architecture and command reference` | Files: [README.md]

- [x] 2. Rewrite AGENTS.md

  **What to do**:
  Rewrite `AGENTS.md` as the authoritative agent-facing document. Structure:

  1. **Header** — `AGENTS.md -- zzhub-pipeline` with one-liner
  2. **Runtime & toolchain** — Bun, TypeScript strict, ESM, `bun test`, `bun x tsc --noEmit` (keep from current, verify)
  3. **Key commands** — `bun run src/cli.ts <command>`, test, typecheck, build:wechat-preview
  4. **Agent workflow loop** — the canonical state machine loop:
     - `find-run` or `tasks --active` -> `status` or `reconcile` -> read `next_action` -> execute gap-filling command -> `status` again -> loop until done
     - Include the "do NOT" rules (no history scanning, no direct state edits, no skipping status)
  5. **State machine rules**:
     - `updateState(path, mutate)` for all reads+writes
     - Never write `workflow-state.json` by hand
     - `content_review.status` must be `passed` before render/publish
     - `redo_hint` lifecycle (set by reset, cleared by prepare-finalize)
     - Body text never enters state
  6. **State file locations**:
     - Run state: `{workspace}/.zzhub-media/runs/{run_id}.json`
     - Canonical: `{workspace}/posts/{date-slug}/workflow-state.json`
     - Body managed in: `{workspace}/.zzhub-media/tmp/{run_id}/`
  7. **Workflow routes** — two active routes (wechat-article, wechat-newspic), blog is post-hoc sync
  8. **Output and view modes** — `--view json|markdown|agent`, TTY behavior, agent should prefer `--view agent`
  9. **Directory layout** — brief, key files only (cli.ts, plugins.ts, state.ts, task-manager.ts, commands/, imgx/, providers/)
  10. **Config** — config path, env overrides, test isolation pattern
  11. **Chrome dependency** — findChrome paths, viewport inset quirk
  12. **Adding a new command** — 3-step process from current AGENTS.md
  13. **newspic pagination** — pagination modes, spec-driven vs auto-flow, page markers, target_fill_ratio

  **Must NOT do**:
  - Do NOT reference `Agent.md` or `state-contract.md`
  - Do NOT include human-oriented getting started guide (that's README)
  - Do NOT include provider implementation details (that's README)
  - Do NOT include full config structure (that's README)

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: documentation authoring task
  - Skills: [] - no special skills needed
  - Omitted: [] - N/A

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: [3,4,5,6] | Blocked By: []

  **References**:
  - Current AGENTS.md: `AGENTS.md` — preserve good content, update structure
  - Current README.md: `README.md` — agent workflow loop section to move here
  - Plugins: `src/plugins.ts:36-71` — command registry
  - State: `src/state.ts:179-203` — WorkflowState interface
  - Task views: `src/task-views.ts:63-71` — view mode parsing
  - Config: `src/config.ts:121-127` — config path resolution
  - imgx runtime: `src/imgx/runtime.ts` — Chrome discovery
  - Task manager: `src/task-manager.ts` — gap/blocker detection

  **Acceptance Criteria**:
  - [ ] AGENTS.md exists and starts with `# AGENTS.md`
  - [ ] Contains agent workflow loop section
  - [ ] Contains state mutation rules
  - [ ] Contains no reference to `Agent.md` or `state-contract.md`
  - [ ] Contains `--view agent` recommendation
  - [ ] Contains adding new command section

  **QA Scenarios**:
  ```
  Scenario: No stale references
    Tool: Bash
    Steps: grep -E 'Agent\.md|state-contract\.md' AGENTS.md
    Expected: No matches
    Evidence: .sisyphus/evidence/task-2-agents-stale.txt

  Scenario: Agent loop present
    Tool: Bash
    Steps: grep -c 'next_action' AGENTS.md
    Expected: At least 1 match
    Evidence: .sisyphus/evidence/task-2-agents-loop.txt
  ```

  **Commit**: YES | Message: `docs: rewrite AGENTS.md with updated agent workflow rules` | Files: [AGENTS.md]

- [x] 3. Create skills/workflow-operation/SKILL.md

  **What to do**:
  Create `skills/workflow-operation/SKILL.md` in English. This is a task-specific execution playbook for agents operating the workflow state machine. Structure:

  1. **Skill metadata** — name, description, trigger phrases
  2. **Prerequisites** — Bun installed, config set, workspace exists
  3. **The Loop** — step-by-step agent procedure:
     - Step 1: Find active task (`bun run src/cli.ts find-run --workspace {ws} --active --view agent`)
     - Step 2: If no task, create with `init` (document all init flags)
     - Step 3: Check status (`status --state {path} --view agent`)
     - Step 4: Read `next_action` from output
     - Step 5: Execute the suggested command
     - Step 6: Re-check status, loop
  4. **Command quick reference** — workflow commands only (16), with one-liner and typical invocation
  5. **Material attachment guide**:
     - attach-body: `--body-text` or `--body-file`
     - attach-body-images: `--images-file` (two JSON formats)
     - attach-newspic-spec: `--file` (spec JSON structure)
  6. **Common patterns**:
     - Article workflow: init -> attach-body -> prepare -> review -> prepare-finalize -> render -> publish
     - Newspic workflow: init -> attach-body -> attach-body-images -> attach-newspic-spec -> prepare -> review -> prepare-finalize -> render -> publish
  7. **Reset and redo** — `reset --mode redo.*` patterns
  8. **Anti-patterns** — never edit state JSON directly, never skip status checks, never guess next step

  **Must NOT do**:
  - Do NOT duplicate full command flag documentation (link to README)
  - Do NOT include code contribution guidance
  - Do NOT include internal architecture details

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: documentation/playbook authoring
  - Skills: [] - N/A
  - Omitted: [] - N/A

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [7] | Blocked By: [1,2]

  **References**:
  - Plugins: `src/plugins.ts:40-57` — workflow command definitions
  - Task views: `src/task-views.ts:29-51` — suggested command builder (shows exact command patterns)
  - README agent section: `README.md:59-97` — current agent usage (to be moved/adapted)
  - Init command: `src/commands/init.ts` — init flag definitions
  - Attach commands: `src/commands/attach-body.ts`, `src/commands/attach-body-images.ts`, `src/commands/attach-newspic-spec.ts`
  - Reset: `src/commands/reset.ts` — reset modes

  **Acceptance Criteria**:
  - [ ] `skills/workflow-operation/SKILL.md` exists
  - [ ] Contains the loop procedure (find-run -> status -> next_action -> execute -> loop)
  - [ ] Contains all 16 workflow command names
  - [ ] Contains material attachment examples
  - [ ] Written in English

  **QA Scenarios**:
  ```
  Scenario: Skill file valid
    Tool: Bash
    Steps: test -f skills/workflow-operation/SKILL.md && head -1 skills/workflow-operation/SKILL.md
    Expected: File exists, starts with # header
    Evidence: .sisyphus/evidence/task-3-workflow-skill.txt

  Scenario: Workflow commands covered
    Tool: Bash
    Steps: For each of the 16 workflow commands, grep in SKILL.md
    Expected: All 16 found
    Evidence: .sisyphus/evidence/task-3-workflow-commands.txt
  ```

  **Commit**: YES | Message: `docs: add workflow-operation agent skill` | Files: [skills/workflow-operation/SKILL.md]

- [x] 4. Create skills/code-contribution/SKILL.md

  **What to do**:
  Create `skills/code-contribution/SKILL.md` in English. Playbook for coding agents making changes to this project. Structure:

  1. **Skill metadata** — name, description, trigger phrases
  2. **Toolchain** — Bun runtime, TypeScript strict mode (`noUnusedLocals`, `noUnusedParameters`), ESM only
  3. **Adding a new CLI command** — step-by-step:
     - Create `src/commands/<name>.ts` exporting `async function <camelName>(args: string[]): Promise<void>`
     - Register in `src/plugins.ts` under appropriate plugin group
     - Use `parseArgs` from `src/args.ts` for argument parsing
     - Use `printResult` from `src/output.ts` for output
     - Use `updateState` from `src/state.ts` for state mutations
  4. **Key patterns to follow**:
     - State mutations via `updateState(path, mutate)` only
     - Output: `printResult(data, renderer)` — never raw `console.log` for command output
     - Error handling: throw Error (cli.ts catches and formats)
     - Config access: `loadConfig()` from `src/config.ts`
     - Workspace resolution: `resolveWorkspaceRoot()` + `resolveWorkspacePaths()`
  5. **Type system** — all types in `src/state.ts`, key types: WorkflowState, Intent, Route, Phase, Images, PublishResults
  6. **Testing** — `bun test`, test file `src/workflow.test.ts`, test isolation with `process.env.ZZHUB_PIPELINE_CONFIG`
  7. **Verification before commit** — `bun test && bun x tsc --noEmit`
  8. **File naming conventions** — kebab-case for commands, camelCase for exports

  **Must NOT do**:
  - Do NOT include workflow operation instructions
  - Do NOT duplicate README architecture content

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: documentation/playbook authoring
  - Skills: [] - N/A
  - Omitted: [] - N/A

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [7] | Blocked By: [1,2]

  **References**:
  - Plugins: `src/plugins.ts:24-34` — CommandDefinition interface
  - Args: `src/args.ts` — argument parsing patterns
  - Output: `src/output.ts:118-128` — printResult API
  - State CRUD: `src/state.ts:280+` — updateState, readState functions
  - Config: `src/config.ts:270-274` — loadConfig
  - Example command: `src/commands/review.ts` — simple command example
  - Example command: `src/commands/doctor.ts` — ops command example
  - Tests: `src/workflow.test.ts` — test patterns

  **Acceptance Criteria**:
  - [ ] `skills/code-contribution/SKILL.md` exists
  - [ ] Contains "adding a new command" procedure
  - [ ] Contains verification commands (`bun test`, `bun x tsc --noEmit`)
  - [ ] References key source files (state.ts, plugins.ts, output.ts)
  - [ ] Written in English

  **QA Scenarios**:
  ```
  Scenario: Skill file valid
    Tool: Bash
    Steps: test -f skills/code-contribution/SKILL.md && grep -c 'bun test' skills/code-contribution/SKILL.md
    Expected: File exists, at least 1 mention of bun test
    Evidence: .sisyphus/evidence/task-4-code-skill.txt
  ```

  **Commit**: YES | Message: `docs: add code-contribution agent skill` | Files: [skills/code-contribution/SKILL.md]

- [x] 5. Create skills/imgx-rendering/SKILL.md

  **What to do**:
  Create `skills/imgx-rendering/SKILL.md` in English. Playbook for agents working with the image rendering subsystem. Structure:

  1. **Skill metadata** — name, description, trigger phrases
  2. **Overview** — imgx is the image rendering subsystem using Chrome headless + @napi-rs/canvas
  3. **Chrome requirement** — findChrome() probe order, viewport inset quirk, compensation logic
  4. **Templates and renderers**:
     - `render-article.ts` — longform-3-4 article renderer (multi-page newspic)
     - `render-card.ts` — cover card renderer (wechat-cover-split)
     - `render-ascii-portrait.ts` — ASCII portrait generation
     - `render-x-like-posts.ts` — X/Twitter-like post rendering
     - `poster-recipe.ts` — poster recipe system
  5. **Themes** — `longform-theme.ts`, account-based theme selection (paper-sage for default, linen-news for ancientone)
  6. **Geometry system** — `geometry.ts`, page dimensions, content area derivation, configurable params:
     - `--page-width` / `--page-height`
     - `--body-padding-x` / `--body-padding-y`
     - `--logo-size` / `--logo-gap`
     - `--footer-height` / `--footer-margin-top`
     - `--content-width` / `--content-height`
     - `--content-bottom-gap`
  7. **Pagination** — pretext-adapter.ts + pretext-runtime.ts, in-process pagination (no Chrome dump-dom), auto-flow vs spec-driven modes
  8. **Visual params** — account-specific: footer text, bg color, highlight color, fallback icon (from routes.ts)
  9. **Invoking imgx** — via `bun run src/cli.ts imgx <subcommand>` or via `render` command in workflow
  10. **Assets** — `src/imgx/assets/` directory, `src/imgx/references/` directory

  **Must NOT do**:
  - Do NOT include workflow state machine details
  - Do NOT duplicate full newspic spec documentation (link to README)

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: documentation/playbook authoring
  - Skills: [] - N/A
  - Omitted: [] - N/A

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [7] | Blocked By: [1,2]

  **References**:
  - imgx directory: `src/imgx/` — all renderer files
  - imgx CLI: `src/commands/imgx.ts` — imgx subcommand dispatch
  - Runtime: `src/imgx/runtime.ts` — Chrome discovery, screenshot helpers
  - Geometry: `src/imgx/geometry.ts` — page geometry calculations
  - Themes: `src/imgx/longform-theme.ts` — theme definitions
  - Pretext: `src/imgx/pretext-adapter.ts`, `src/imgx/pretext-runtime.ts` — pagination
  - Render article: `src/imgx/render-article.ts` — longform renderer
  - Render card: `src/imgx/render-card.ts` — cover card renderer
  - Routes visual params: `src/routes.ts:138-161` — account visual params
  - Render command: `src/commands/render.ts` — workflow render integration

  **Acceptance Criteria**:
  - [ ] `skills/imgx-rendering/SKILL.md` exists
  - [ ] Contains Chrome dependency section
  - [ ] Contains all renderer names (render-article, render-card, render-ascii-portrait, render-x-like-posts)
  - [ ] Contains geometry parameters list
  - [ ] Contains theme information
  - [ ] Written in English

  **QA Scenarios**:
  ```
  Scenario: Skill file valid
    Tool: Bash
    Steps: test -f skills/imgx-rendering/SKILL.md && grep -c 'Chrome' skills/imgx-rendering/SKILL.md
    Expected: File exists, Chrome mentioned
    Evidence: .sisyphus/evidence/task-5-imgx-skill.txt
  ```

  **Commit**: YES | Message: `docs: add imgx-rendering agent skill` | Files: [skills/imgx-rendering/SKILL.md]

- [x] 6. Create skills/debugging-troubleshooting/SKILL.md

  **What to do**:
  Create `skills/debugging-troubleshooting/SKILL.md` in English. Playbook for diagnosing and fixing issues. Structure:

  1. **Skill metadata** — name, description, trigger phrases
  2. **First step: doctor** — `bun run src/cli.ts doctor` to check resolved paths, provider health, bun binary, config
  3. **Config diagnostics**:
     - `bun run src/cli.ts config` — show full config (redacted secrets)
     - `bun run src/cli.ts config --key paths.workspaceRoot` — check specific key
     - Config file location: `~/Library/Application Support/zzhub-pipeline/config.json` (macOS)
     - Legacy migration from `zzclub-z-cli` config
  4. **State recovery**:
     - `status --state {path} --view agent` to inspect current state
     - `reconcile --state {path}` to reconcile materials
     - `checkpoint --state {path}` to validate phase
     - Common state issues: stuck in wrong phase, missing body, stale render
  5. **Reset patterns**:
     - `reset --mode redo.writer` — restart from writer step
     - `reset --mode redo.style` — restart from style step
     - `reset --mode redo.format` — restart from format step
     - Phase reset behavior: which phases get reset, redo_hint lifecycle
  6. **Chrome issues**:
     - findChrome probe order (4 paths)
     - Viewport inset quirk and compensation
     - Common: Chrome not found, render produces clipped images
  7. **Provider issues**:
     - WeChat API errors (token, permissions)
     - COS upload failures
     - Zotepad connection issues
  8. **hermes-metrics** — `bun run src/cli.ts hermes-metrics` for execution metrics per task
  9. **Common error patterns**:
     - "content_review.status must be passed" — need to run `review --status passed`
     - "Unable to resolve route" — ambiguous intent text
     - "content_origin is unknown" — orchestrator must confirm ownership
  10. **Logs** — `logs/` directory at project root

  **Must NOT do**:
  - Do NOT include workflow operation instructions (link to workflow skill)
  - Do NOT include code contribution details

  **Recommended Agent Profile**:
  - Category: `writing` - Reason: documentation/playbook authoring
  - Skills: [] - N/A
  - Omitted: [] - N/A

  **Parallelization**: Can Parallel: YES | Wave 2 | Blocks: [7] | Blocked By: [1,2]

  **References**:
  - Doctor: `src/commands/doctor.ts` — health check implementation
  - Config: `src/config.ts` — config loading, legacy migration, platform paths
  - Reset: `src/commands/reset.ts` — reset modes and behavior
  - Hermes metrics: `src/commands/hermes-metrics.ts` — metrics command
  - Chrome: `src/imgx/runtime.ts` — findChrome function
  - Providers: `src/providers/wechat.ts`, `src/providers/cos.ts`, `src/providers/zotepad.ts`
  - Routes error: `src/routes.ts:256-263` — route resolution errors
  - Profiles error: `src/profiles.ts:70-73` — content_origin unknown error
  - State validation: `src/state.ts` — validateForPhase

  **Acceptance Criteria**:
  - [ ] `skills/debugging-troubleshooting/SKILL.md` exists
  - [ ] Contains doctor command section
  - [ ] Contains config diagnostics
  - [ ] Contains state recovery procedures
  - [ ] Contains Chrome troubleshooting
  - [ ] Contains common error patterns with solutions
  - [ ] Written in English

  **QA Scenarios**:
  ```
  Scenario: Skill file valid
    Tool: Bash
    Steps: test -f skills/debugging-troubleshooting/SKILL.md && grep -c 'doctor' skills/debugging-troubleshooting/SKILL.md
    Expected: File exists, doctor command mentioned
    Evidence: .sisyphus/evidence/task-6-debug-skill.txt
  ```

  **Commit**: YES | Message: `docs: add debugging-troubleshooting agent skill` | Files: [skills/debugging-troubleshooting/SKILL.md]

- [x] 7. Cross-Reference Validation

  **What to do**:
  Validate consistency across all 6 files:

  1. Extract all 22 command names from `src/plugins.ts`
  2. Verify each appears in README.md command reference
  3. Verify no stale file references (Agent.md, state-contract.md) in any doc
  4. Verify all skill files exist with correct paths
  5. Verify no absolute paths (`/Users/`) in any doc
  6. Verify Chinese in README/AGENTS, English in skills
  7. Run `bun test` and `bun x tsc --noEmit` as regression

  **Must NOT do**:
  - Do NOT modify any source code
  - Do NOT modify the docs further (report issues only)

  **Recommended Agent Profile**:
  - Category: `unspecified-high` - Reason: verification/validation task requiring thorough checking
  - Skills: [] - N/A
  - Omitted: [] - N/A

  **Parallelization**: Can Parallel: NO | Wave 3 | Blocks: [] | Blocked By: [3,4,5,6]

  **References**:
  - All generated files: README.md, AGENTS.md, skills/*/SKILL.md
  - Command source of truth: `src/plugins.ts:36-71`

  **Acceptance Criteria**:
  - [ ] All 22 commands in README.md
  - [ ] No stale references in any file
  - [ ] 4 skill files exist
  - [ ] `bun test` passes
  - [ ] `bun x tsc --noEmit` passes

  **QA Scenarios**:
  ```
  Scenario: Full cross-reference check
    Tool: Bash
    Steps: Run validation script checking all criteria
    Expected: All checks pass
    Evidence: .sisyphus/evidence/task-7-validation.txt

  Scenario: Regression tests pass
    Tool: Bash
    Steps: bun test && bun x tsc --noEmit
    Expected: Exit code 0
    Evidence: .sisyphus/evidence/task-7-regression.txt
  ```

  **Commit**: NO (verification only)

## Final Verification Wave (MANDATORY -- after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit -- oracle
- [ ] F2. Code Quality Review -- unspecified-high
- [ ] F3. Real Manual QA -- unspecified-high
- [ ] F4. Scope Fidelity Check -- deep

## Commit Strategy
- 6 commits total (one per doc/skill file), no commit for verification task
- Commit messages use `docs:` prefix
- All commits are safe (no code changes)

## Success Criteria
- README.md accurately reflects the actual codebase with all 22 commands, correct directory layout, and complete subsystem coverage
- AGENTS.md provides clear agent workflow rules without stale references
- 4 skill files provide actionable playbooks for their respective domains
- No regression in tests or type checking
- No cross-reference inconsistencies between documents
