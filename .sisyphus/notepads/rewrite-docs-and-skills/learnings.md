2026-04-16

- README 需要和 `src/plugins.ts` 保持一一对应，命令表必须按 workflow 和 ops 分组，且要写入 22 个命令的真实 summary。
- 配置说明要同时覆盖 macOS 和 Linux 默认路径，还要保留 `ZZHUB_PIPELINE_CONFIG`、`ZZHUB_PIPELINE_WORKSPACE_ROOT`、`ZZHUB_PIPELINE_POSTS_DIR`、`ZZHUB_PIPELINE_BLOG_ROOT` 四个环境变量。
- 文档里要明确正文全文不进 state，正文只放在 `{workspace}/.zzhub-media/tmp/{run_id}/`，这是恢复工作流时最容易误解的点。
- 重写 AGENTS.md 时，先把 agent loop 写成唯一执行路径，再补 state mutation、view modes、Chrome probe order 和 command registration，这样文档更像执行契约，不像入门手册。
- 现在的 AGENTS.md 还要避免把 `next_action.action` 写死成“CLI command”，因为 task-manager 里既有直出的命令名，也有 orchestrator 风格的动作标签（如 `review-content`、`revise-content`、`reset-or-repair`、`resolve-handoff`、`complete`）。
- 最后收尾时要把 Key patterns 里的 `updateState` 说成“新工作优先用”，不要写成绝对唯一；现有命令里仍有 `readState` / `writeState` 的直用实现。

## Code Contribution Patterns
- Commands should be implemented in `src/commands/` and exported as camelCase async functions.
- Every command must be registered in `src/plugins.ts` to be discoverable by the CLI.
- Argument parsing is handled by `src/args.ts`, which automatically normalizes underscores to hyphens.
- `printResult` in `src/output.ts` is the standard way to emit command results, supporting both TTY-friendly pretty-printing and agent-friendly raw JSON.
- `updateState` in `src/state.ts` should be used for all state mutations to ensure atomic read-modify-write cycles.
- Tests must isolate the configuration file by overriding `process.env.ZZHUB_PIPELINE_CONFIG`.
- The project uses Bun as the primary runtime and test runner.

- Created workflow-operation skill with canonical loop and 16 workflow commands.
- Documented material attachment (body, images, newspic spec) with exact flags.
- Included reset/redo patterns for revision scenarios.
- Reinforced the AGENTS.md loop constraint: find -> status -> execute -> verify.

## imgx Subsystem Insights
- Chrome is mandatory for `render` and `wechat-export`.
- `imgx` uses `Pretext` (via `@napi-rs/canvas`) for in-process, high-performance pagination.
- Viewport inset quirk: Chrome's `--window-size` is unreliable for exact height; the system probes the real inset and crops results.
- Geometry calculation in `src/imgx/geometry.ts` derives content area by subtracting header/footer/padding from the page size.
- Themes (`src/imgx/longform-theme.ts`) are account-linked in `src/routes.ts` (e.g., `default` -> `paper-sage`).
- Spec-driven pagination uses markers like `【第1页】` as hard boundaries, while auto-flow is purely content-driven.
- 故障排查（Debugging & Troubleshooting）应首选 `doctor` 命令。
- 配置加载具有明确优先级：环境变量 > 配置文件 > 默认值/旧配置迁移。
- 状态恢复的关键在于理解 `reconcile` 对素材的对账作用，以及正文全文不进 state 的物理约束。
- Chrome 渲染问题通常与路径查找或 Viewport Inset 测量有关，排查时需关注 `doctor` 中的 Chrome 状态。
- `redo_hint` 生命周期由 `reset` 启动，并在 `prepare-finalize` 时清除。

- Updated workflow-operation skill with comprehensive init flag documentation (13 flags total).
- Refined attach-body, attach-body-images, and attach-newspic-spec guidance to match CLI source exactly.
- Preserved the canonical loop and 16-command coverage as per project standards.
## State Management Pattern
- The authoritative pattern for state mutation is `updateState(path, mutate)`.
- Direct `writeState` calls should be avoided in new commands to ensure atomicity and correct timestamp updates.
- `readState` is preferred for read-only operations where no update is intended.

- Enhanced workflow-operation skill with typical invocation guidance for all 16 commands.
- Clarified the --body flag for file attachment to match CLI implementation.
- Maintained source-backed accuracy for all command flags and loop procedures.- 在 SKILL.md 中补充了 `checkpoint` 命令的使用说明，用于阶段性验证。
- 明确了 `reset --mode content` 会将 `redo_hint` 设为 `writer`，不存在 `redo.writer` 模式。
- 增加了准确的路由错误信息提示，方便根据报错快速定位问题。
- 确认了项目根目录存在 `logs/` 文件夹，并将其作为故障排查的关键路径之一。
- 在 SKILL.md 中修正了 `reset --mode full` 的行为描述，明确其会将任务标记为 `failed`。
- 修正了关于 Viewport Probe 故障排查的描述，不再暗示 `doctor` 命令会输出具体的探测细节，而是引导查阅运行时日志和 stderr。

- Updated workflow-operation skill to distinguish between direct CLI commands and synthetic action labels in the canonical loop.
- Added a new section for 'Synthetic Action Labels' covering review-content, revise-content, reset-or-repair, resolve-handoff, and complete.
- Preserved all 16 command flags and accurate attachment guidance.
- 在 SKILL.md 中进一步精简了 `reset --mode full` 的描述，移除了不精确的 `(abandoned)` 字样，使其更符合源码中将 `mode` 和 `phase.current` 直接设为 `failed` 的行为。
