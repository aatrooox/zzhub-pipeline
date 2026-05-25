# Changelog

## v0.4.0

[compare changes](https://github.com/aatrooox/zzhub-pipeline/compare/v0.3.0...v0.4.0)

### Features

- **skill:** Delegate writing, review, and revision to sub-agents with clean context ([5fea5e1](https://github.com/aatrooox/zzhub-pipeline/commit/5fea5e1))
- **skill:** 强化写稿质量要求——标题权重60%、陌生感视角、讲故事风格 ([a6780df](https://github.com/aatrooox/zzhub-pipeline/commit/a6780df))
- **skill:** 要求 sub-agent 写稿时产出标题高亮关键词 ([2ec5fc4](https://github.com/aatrooox/zzhub-pipeline/commit/2ec5fc4))
- Add modular typographic scale with proportional line-height ([168e122](https://github.com/aatrooox/zzhub-pipeline/commit/168e122))
- Apply proportional spacing and modular scale to longform theme geometry ([8329d00](https://github.com/aatrooox/zzhub-pipeline/commit/8329d00))
- Refine poster scoring with optical center, last-line sweet spot, and smooth letter-spacing ([735a121](https://github.com/aatrooox/zzhub-pipeline/commit/735a121))
- Upgrade wechat cover algorithm from greedy to scored search ([f483fcc](https://github.com/aatrooox/zzhub-pipeline/commit/f483fcc))
- Add proportional image-text gap and progressive image shadow ([fad53ed](https://github.com/aatrooox/zzhub-pipeline/commit/fad53ed))
- Add visual rhythm engine and longform content highlighting ([80c2978](https://github.com/aatrooox/zzhub-pipeline/commit/80c2978))
- Configurable icon for imgx rendering + swap default icon ([d60d216](https://github.com/aatrooox/zzhub-pipeline/commit/d60d216))

### Fixes

- Extract only English terms as highlight words, skip CJK entirely ([3f58364](https://github.com/aatrooox/zzhub-pipeline/commit/3f58364))
- Remove 12-char ASCII token limit in normalizeMixedTextSpacing, add multi-token join pass ([606f298](https://github.com/aatrooox/zzhub-pipeline/commit/606f298))
- Allow whitespace between CJK and first ASCII token in Pass 4 join ([6f68784](https://github.com/aatrooox/zzhub-pipeline/commit/6f68784))
- Fix Pass 4 trailing space and 3+ token chain handling ([75bc3a4](https://github.com/aatrooox/zzhub-pipeline/commit/75bc3a4))
- Add min-length filter to exclude single chars and short lowercase words from highlights ([8323787](https://github.com/aatrooox/zzhub-pipeline/commit/8323787))
- Correct capture group reference in post-join cleanup ( → ) ([2d96962](https://github.com/aatrooox/zzhub-pipeline/commit/2d96962))
- Harden proportionalLineHeight edge cases, add computeSpacing and negative-step tests ([4db0b18](https://github.com/aatrooox/zzhub-pipeline/commit/4db0b18))
- Use visual-width estimation in poster template for mixed CJK/English titles ([8af0a15](https://github.com/aatrooox/zzhub-pipeline/commit/8af0a15))
- Remove dead 0-9 from LATIN_NARROW_RE, narrow \s to avoid CJK_RE overlap ([75bdf38](https://github.com/aatrooox/zzhub-pipeline/commit/75bdf38))
- Add English word-boundary awareness to cover title splitting, smooth typography functions ([4a2398c](https://github.com/aatrooox/zzhub-pipeline/commit/4a2398c))
- Recalculate linen-news heading line-height and spacing for actual 36px font size ([a71e8e6](https://github.com/aatrooox/zzhub-pipeline/commit/a71e8e6))

### Documentation

- Replace agent loop text with mermaid flowchart in README ([15ebf2c](https://github.com/aatrooox/zzhub-pipeline/commit/15ebf2c))
- Add build-and-reinstall step after code changes ([0b9775b](https://github.com/aatrooox/zzhub-pipeline/commit/0b9775b))

### Chore

- Replace internal skills with zzhub-publish skill ([9c00788](https://github.com/aatrooox/zzhub-pipeline/commit/9c00788))
- Switch npm publish from bundled dist to source ([f2ea736](https://github.com/aatrooox/zzhub-pipeline/commit/f2ea736))

### ❤️ Contributors

- Aatrox3 ([@aatrooox](https://github.com/aatrooox))

## v0.3.0

Initial public release.

Pipeline state machine for WeChat content publishing:
- Agent-driven workflow loop with `--view agent` output
- Two entry points: `init` (agent-created) and `ingest-handoff` (external handoff)
- Three-phase pipeline: prepare → render → publish
- Pluggable render system with built-in imgx (Chrome headless + @napi-rs/canvas)
- WeChat article drafts and newspic image messages
- Config via JSON file + env overrides
