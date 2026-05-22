# Changelog

## v0.3.0

Initial public release.

Pipeline state machine for WeChat content publishing:
- Agent-driven workflow loop with `--view agent` output
- Two entry points: `init` (agent-created) and `ingest-handoff` (external handoff)
- Three-phase pipeline: prepare → render → publish
- Pluggable render system with built-in imgx (Chrome headless + @napi-rs/canvas)
- WeChat article drafts and newspic image messages
- Config via JSON file + env overrides
