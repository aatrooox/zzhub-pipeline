# Debugging & Troubleshooting

This skill provides a systematic playbook for diagnosing and fixing issues in the `zzhub-pipeline` workflow.

## Metadata
- **Name**: debugging-troubleshooting
- **Description**: Diagnostic and recovery guide for zzhub-pipeline issues, covering config, state, Chrome, and provider failures.
- **Trigger Phrases**: 
  - "diagnose zzhub-pipeline"
  - "debug workflow failure"
  - "fix stuck state"
  - "troubleshoot chrome rendering"
  - "provider error publish"
  - "recovery from failed phase"

## 1. Initial Diagnosis
The first step for any anomaly is to run the internal health check.

```bash
bun run src/cli.ts doctor
```

**Check for:**
- `config_path_exists`: If false, the pipeline is using default fallback values.
- `resolved_paths_exist`: Verify `postsRoot`, `tempRoot`, and `blogRoot` are valid and accessible.
- `bun_binary`: Ensure Bun is correctly located.
- `publish_providers`: Confirm the intended provider (wechat, cos, zotepad) is registered.

## 2. Configuration Diagnostics
The pipeline loads configuration from multiple locations with a specific priority.

### Default Config Locations
- **macOS**: `~/Library/Application Support/zzhub-pipeline/config.json`
- **Linux**: `~/.config/zzhub-pipeline/config.json`
- **Windows**: `%APPDATA%\zzhub-pipeline\config.json`

### Environment Overrides
- `ZZHUB_PIPELINE_CONFIG`: Explicit path to `config.json`.
- `ZZHUB_PIPELINE_WORKSPACE_ROOT`: Overrides `paths.workspaceRoot`.
- `ZZHUB_PIPELINE_POSTS_DIR`: Overrides `paths.postsDirName` (default: `posts`).
- `ZZHUB_PIPELINE_BLOG_ROOT`: Overrides `paths.blogRoot`.

### Legacy Migration
The pipeline automatically reads legacy config from `zzclub-z-cli` directory if the primary config is missing or incomplete. Use `doctor` to see if a legacy config is being used.

### Inspecting/Updating Config
```bash
# View full redacted config
bun run src/cli.ts config

# Read specific key
bun run src/cli.ts config --key wx.defaultAccount

# Update value
bun run src/cli.ts config --key paths.workspaceRoot --value /abs/path
```

## 3. State Recovery
The state machine is the source of truth. If a workflow is stuck or failed, analyze the state file.

### Inspection
```bash
# View gaps and next action
bun run src/cli.ts status --state {path} --view agent

# Validate state for a specific phase
bun run src/cli.ts checkpoint --state {path} --phase render

# Sync filesystem materials with state
bun run src/cli.ts reconcile --state {path}
```

### Logs
The `logs/` directory in the repository root contains detailed execution logs. Check these when a command fails with an opaque error or when debugging rendering/publish issues.

### Common Stuck States
- **Phase Validation Errors**: Run `status` to see `blockers`. Common issues include missing `metadata` (title/slug/date) or `content_review` not being `passed`.
- **Missing Body Text**: The state does NOT store body text. It must exist at `{workspace}/.zzhub-media/tmp/{run_id}/`. If this directory is gone, the task cannot proceed.
- **Content Version Mismatch**: If `publish` fails, verify `artifacts.content_version` matches the expected version in `publish.results`.

## 4. Reset & Redo Patterns
Use the `reset` command to re-enter previous phases or fix errors without starting from scratch.

### Reset Modes
- `content`: Resets prepare, render, and publish phases. Sets `redo_hint` to `writer`. This is the mode to use when you need to redo the body content generation.
- `redo.style` | `redo.format` | `redo.metadata` | `redo.route`: Resets prepare phase to a specific sub-step. Sets `redo_hint` (e.g., `style`, `format`, `asset-meta`, `channel-route`) which is cleared by `prepare-finalize`.
- `render`: Resets image generation. Clears `images.render_assets`.
- `publish`: Resets only the publish phase results.
- `full`: Marks the current run as `failed`, requiring a fresh run to proceed.

```bash
bun run src/cli.ts reset --state {path} --mode render
```

## 5. Chrome & Rendering Issues
Rendering requires headless Chrome.

### Chrome Probe Order
The runtime searches for Chrome in this order:
1. `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
2. `/Applications/Chromium.app/Contents/MacOS/Chromium`
3. `google-chrome` (from PATH)
4. `chromium` (from PATH)

### Common Failures
- **Chrome Not Found**: Ensure Chrome or Chromium is installed and in the probe path.
- **Clipped Output / Viewport Quirk**: Headless Chrome `--window-size` doesn't guarantee `innerHeight`. The runtime uses a viewport probe to measure insets and then crops. If images look clipped, inspect runtime/rendering behavior, command stderr, and any available repo logs for diagnostic clues.
- **Font Rendering**: If text looks wrong, ensure system fonts are available or check `src/imgx/assets/fonts`.

## 6. Provider Class Failures
### WeChat (`wechat`)
- **Token Failures**: Requires `pat`, `appId`, and `appSecret`. Verify these in `config` or environment variables (`ZZCLUB_PAT`, `WX_APPID`, `WX_APPSECRET`).
- **Upload Timeout**: Default 60s. Can be adjusted via `wx.timeout` in config.
- **Media ID Errors**: Often caused by invalid image formats or sizes.

### COS (`cos`)
- **STS Request Failed**: Verify `cos.pat` and `services.zotepadBaseUrl`.
- **Upload Timeout**: Default 120s.

### Zotepad (`zotepad`)
- **Export Failed**: Usually an issue with `wechat-preview` build or missing `zotepadExportHtml` path in config.

## 7. Metrics & Performance
Use `hermes-metrics` to analyze execution cost and latency per task.

```bash
# Summary of all tasks
bun run src/cli.ts hermes-metrics

# Detailed metrics for a specific run
bun run src/cli.ts hermes-metrics {run_id}
```

## 8. Common Error Patterns
- **"Ambiguous route: user requested 公众号 but did not specify article or newspic"**: User requested "公众号" but keywords didn't specify "文章" (article) or "贴图" (newspic). Resolve by specifying `content_form` or using more specific keywords.
- **"Unable to resolve route from intent or content_form; orchestrator must classify first"**: Occurs when no routing keywords are found and `content_form` is unknown.
- **"content_origin is unknown; orchestrator must confirm ownership before prepare"**: Ownership must be confirmed (user vs external) before `prepare` can run.
- **"Content review must pass"**: You must run `review --status passed` before `render` or `publish`.
- **"Body images still pending"**: For WeChat articles, all `body_inputs` must be attached via `attach-body-images` before publishing.
