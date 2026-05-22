# imgx-rendering SKILL

An agent-friendly playbook for the `imgx` image rendering subsystem.

- **Name**: imgx-rendering
- **Description**: Focused guide for headless Chrome-based image rendering, geometry calculation, and pagination.
- **Trigger phrases**: "render images", "imgx subcommand", "rendering geometry", "longform pagination", "chrome requirements"

## Overview

The `imgx` subsystem generates high-quality images (covers, longform articles, posters, etc.) using:
1. **Headless Chrome**: For HTML/CSS-to-PNG rendering.
2. **@napi-rs/canvas**: For fast, in-process text measurement (Pretext).
3. **Pretext**: For deterministic, high-performance pagination without DOM dumping.

## Chrome Requirements

Rendering requires Google Chrome or Chromium. The system probes these paths in order:
1. `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
2. `/Applications/Chromium.app/Contents/MacOS/Chromium`
3. `google-chrome`
4. `chromium`

### Viewport Inset Quirk (CRITICAL)
Headless Chrome's `--window-size` does not always match `window.innerHeight`. The subsystem:
- Automatically probes the inset at runtime.
- Captures an oversized area and crops it to the exact target geometry.
- **Tip**: If a footer or edge looks clipped, verify the crop logic in `src/imgx/runtime.ts`.

## Renderers & Templates

Invoked via `bun run src/cli.ts imgx <subcommand>` or the `render` workflow.

| Subcommand | Template | Use Case |
|------------|----------|----------|
| `render-article` | `longform-3-4` | Multi-page article rendering with adaptive pagination. |
| `render-card` | `poster-3-4`, `wechat-cover-split`, `tips-3-4` | Cover images, posters, and tips cards. |
| `render-ascii-portrait` | `ascii-portrait-3-4`, `ascii-portrait-tile` | Stylized ASCII art posters. |
| `render-x-like-posts` | `x-like-posts` | Social-media style post sharing cards. |

## Poster Recipe System

The `poster-recipe` system (`src/imgx/poster-recipe.ts`) provides a structured way to define complex poster layouts beyond simple text:
- **Blocks**: Array of text segments with individual `highlight` flags.
- **Highlight Words**: Specific strings that trigger automatic visual emphasis within blocks.
- **Tips**: A list of title/description pairs (used in `tips-3-4` template).
- **Serialization**: Recipes are serialized to JSON and injected into HTML templates via the `{{POSTER_CONFIG_JSON}}` placeholder.

Used primarily by `render-card` to support multi-line highlights and tip-based layouts.

## Geometry System

`imgx` derives the "Content Stage" height by subtracting header (logo + gap), footer (margin + height), and body padding from the page height.

### Key Parameters
Most parameters are automatically derived from themes but can be overridden:
- `--page-width` / `--page-height`: Default is 900x1200 (3:4 ratio).
- `--body-padding-x` / `--body-padding-y`: Content insets.
- `--logo-size` / `--logo-gap`: Header dimensions.
- `--footer-height` / `--footer-margin-top`: Footer dimensions.
- `--content-width` / `--content-height`: Explicitly lock the text area.
- `--content-bottom-gap`: Reserved space below content.

## Themes & Accounts

Visual styles are resolved based on the publishing account in `src/routes.ts`.

| Account | Theme | Primary Palette |
|---------|-------|-----------------|
| `default` (早早集市) | `paper-sage` | Greenish/Sage accent, off-white bg. |
| `ancientone` (古一软件) | `linen-news` | Deep red/Maroon accent, linen bg. |

### Account Visual Parameters
In addition to themes, `src/routes.ts` defines account-specific visual parameters used by renderers (especially `poster-3-4`):
- `footer`: Default footer text (e.g., "公众号 · 早早集市").
- `bg`: Background color for posters.
- `highlight`: Primary accent color for highlighted text.
- `fallback_icon`: Icon path used when no specific icon is detected.

## Pagination & Layout

### Two Pagination Modes
1. **Auto-flow**: (Default) Fills pages sequentially based on text flow and available space.
2. **Spec-driven**: Triggered by `--page-image-spec-file`. Markers like `【第1页】` or `【Page 1】` in the body act as hard boundaries.

### Newspic Specs
Control pagination behavior via `newspic_render` state:
- `min_pages`: Iteratively shrinks content area to force content across more pages.
- `target_fill_ratio`: Approximate target for how much of the content area to fill (clamped 0.35 - 0.95).
- `require_image_every_page`: Ensures every page has at least one body image.

### Image Layouts
- `editorial`: Magazine-style staggered layout.
- `staggered`: Alternating side-by-side layout.
- `fill`: Full-width image at the bottom of the content area.
- `corner-soft`: Small images floating in corners.

## Invocation Examples

### Direct CLI Usage
```bash
# Render a single longform page
bun run src/cli.ts imgx render-article \
  --title "My Article" \
  --text-file body.md \
  --out page1.png \
  --theme linen-news
```

### Workflow Integration
The `render` command handles planning and bulk invocation:
```bash
bun run src/cli.ts render --state path/to/state.json
```

## Directory Assets
- `src/imgx/assets/templates/`: HTML templates.
- `src/imgx/assets/fonts/`: Bundled TTF fonts (LXGW Neo ZhiSong, Alimama ShuHeiTi).
- `src/imgx/assets/icons/`: Logos and avatars.
- `src/imgx/references/`: Reference implementations and legacy assets.
