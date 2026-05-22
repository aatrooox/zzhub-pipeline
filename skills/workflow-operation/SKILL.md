# Workflow Operation Skill

Playbook for operating the `zzhub-pipeline` workflow state machine.

## Metadata
- **Name**: workflow-operation
- **Description**: Guide for managing the lifecycle of WeChat articles and newspic tasks through the pipeline CLI.
- **Trigger phrases**: 
  - "operate the workflow"
  - "run the pipeline"
  - "publish to wechat"
  - "fix workflow task"
  - "next step in workflow"

## Prerequisites
- **Bun**: The runtime is Bun. Use `bun run src/cli.ts` or the `zzp` alias.
- **Chrome**: Headless Chrome must be installed for `render` and `wechat-export`.
- **Workspace**: A valid workspace directory must exist.
- **Config**: Pipeline configuration should be set (default `~/Library/Application Support/zzhub-pipeline/config.json`).

## The Canonical Loop
Agents MUST follow this loop to advance any task. Never skip status checks or guess the next step.

1. **Find Task**: Locate your active task.
   `zzp find-run --workspace {workspace} --active --view agent`
2. **Init (if needed)**: If no task is found, create one (see `init` flags below).
3. **Check Status**: Always get the latest `next_action`.
   `zzp status --state {state_path} --view agent`
4. **Read Next Action**: Identify the `next_action.action`.
   - If the action is a **CLI command** (e.g., `prepare`, `render`, `publish`), execute it directly.
   - If the action is a **synthetic label** (e.g., `revise-content`, `review-content`), interpret it using the `reason` and `params` (see Synthetic Actions below).
5. **Execute Action**: Run only the logic or command implied by the `next_action`.
6. **Verify and Repeat**: Run `status --view agent` again to confirm progress and get the next step. Repeat until the task `mode` is `done`.

## Synthetic Action Labels
When `next_action.action` does not map directly to a CLI command name, it represents a high-level orchestration goal:

- `complete`: The task is finished. No further work needed.
- `review-content`: Task is blocked waiting for `zzp review --status passed`.
- `revise-content`: Content review requested changes. Read `params.feedback` and update the body text accordingly.
- `reset-or-repair`: Task failed. Inspect errors and run `zzp reset` to re-enter a valid phase.
- `resolve-handoff`: Task is waiting for manual resolution or an external trigger.

## Command Quick Reference (16 Workflow Commands)
Typical invocations assume `--state {state_path}` is provided unless otherwise noted.

| Command | Purpose | Typical Invocation Guidance |
| --- | --- | --- |
| `init` | Create run state | `zzp init --task-kind publish --content-form article --targets wechat --content-origin user` |
| `attach-body` | Attach source body | `zzp attach-body --body {path}` OR `zzp attach-body --body-text "{text}"` |
| `attach-body-images` | Attach image markers | `zzp attach-body-images --images-file {json_path}` |
| `attach-newspic-spec` | Attach render intent | `zzp attach-newspic-spec --file {json_path}` |
| `prepare` | Routing & Metadata | `zzp prepare` |
| `prepare-finalize` | Assets & Highlighting | `zzp prepare-finalize --body {formatted_body_path}` |
| `render` | Image generation | `zzp render` |
| `publish` | Execute publishing | `zzp publish` |
| `reconcile` | Material sync | `zzp reconcile` |
| `checkpoint` | Phase validation | `zzp checkpoint` |
| `status` | Read next action | `zzp status --view agent` |
| `find-run` | Find active task | `zzp find-run --workspace {workspace} --active --view agent` |
| `tasks` | List workspace tasks | `zzp tasks --workspace {workspace} --active --view agent` |
| `reset` | Phase revision | `zzp reset --mode {content\|redo.style\|render\|publish}` |
| `review` | Content review | `zzp review --status passed` |
| `abandon` | Mark as abandoned | `zzp abandon` |

## Detailed Command Guidance

### init
Create initial run state.
- `--workspace`: Workspace root directory (optional; defaults to config/env).
- `--task-kind`: `draft` | `polish` | `organize` | `publish` | `mixed` (required).
- `--content-form`: `article` | `newspic` | `unknown` (required).
- `--targets`: Comma-separated: `wechat`, `blog` (required).
- `--content-origin`: `user` | `external` | `unknown` (required).
- `--intent-text`: Original user request for route/account resolution (optional).
- `--account`: Explicit account override (optional).
- `--newspic-render-spec-file`: JSON file for newspic pagination / page-image intent (optional).
- `--style-hint`: e.g. `fact_report` (optional).
- `--requires-research`: Flag to indicate research phase is needed.
- `--requires-style`: Flag to indicate styling phase is needed.
- `--requires-render`: Flag to indicate rendering phase is needed.
- `--requires-publish`: Flag to indicate publishing phase is needed.

### attach-body
Attach the main text content.
- `--state`: Path to state JSON (required).
- `--body`: Path to existing markdown file (use this for file attachment).
- `--body-text`: Inline markdown body text.
*Note: Use either `--body` or `--body-text`, not both. The flag for files is explicitly `--body`.*

### attach-body-images
Attach image markers found in the body to local files.
- `--state`: Path to state JSON (required).
- `--images-file`: JSON file mapping markers to paths (required).
  Format: `{"Marker1": "{workspace}/img1.png"}` or `[{"marker": "Marker1", "path": "{workspace}/img1.png"}]`.
- `--scope`: `article` | `newspic-longform` (optional).
- `--layout`: Layout hint such as `staggered` | `editorial` (optional).

### attach-newspic-spec
Define how a `newspic` should be rendered.
- `--state`: Path to state JSON (required).
- `--file`: Path to newspic render spec JSON (required).

## Reset and Redo Patterns
If a task needs correction, use `reset` to move the state machine backward.

- **Re-write Body**: `zzp reset --state {state_path} --mode content`
- **Fix Style/Tone**: `zzp reset --state {state_path} --mode redo.style`
- **Update Metadata**: `zzp reset --state {state_path} --mode redo.metadata`
- **Re-render Images**: `zzp reset --state {state_path} --mode render`
- **Re-publish**: `zzp reset --state {state_path} --mode publish`

## Anti-Patterns
- **Direct Edit**: NEVER modify the `workflow-state.json` or run-state JSON files by hand.
- **Skipping Status**: NEVER assume the next command without checking `status --view agent`.
- **Parallel Steps**: NEVER run multiple state-changing commands simultaneously for the same task.
- **Context Guessing**: NEVER rely on session history to determine task state. The state file is the only truth.
