# Code Contribution Skill

Guide for agents and developers contributing to the zzhub-pipeline codebase.

## Metadata

- **Name**: `code-contribution`
- **Description**: Playbook for implementing new commands and making code changes in zzhub-pipeline.
- **Trigger Phrases**: 
  - "How do I add a new command?"
  - "Implement a new CLI command"
  - "Contribution guide for zzhub-pipeline"
  - "Help me with a code change in this repo"

## Toolchain & Constraints

- **Runtime**: Bun (use `bun run`, `bun test`, `bun x`).
- **Language**: TypeScript (Strict Mode).
  - `noUnusedLocals: true`
  - `noUnusedParameters: true`
- **Modules**: ESM only (`"type": "module"` in `package.json`, `"moduleResolution": "bundler"`).
- **Style**: Plain English and technical precision.

## Adding a New CLI Command

### 1. Create Command File
Create `src/commands/<name>.ts`. Export a single async function named with camelCase.

```typescript
import { parseArgs } from "../args";
import { printResult } from "../output";

export async function myNewCommand(args: string[]): Promise<void> {
  const parsed = parseArgs(args);
  // Implementation...
  const result = { success: true, args: parsed };
  printResult(result);
}
```

### 2. Register in Plugins
Add the command to `src/plugins.ts` in the appropriate group (`workflow` or `ops`).

```typescript
// src/plugins.ts
import { myNewCommand } from "./commands/my-new-command";

// In getCommandPlugins() -> workflow.commands array:
{ 
  name: "my-command", 
  summary: "Brief description", 
  plugin: "workflow", 
  handler: myNewCommand 
}
```

## Key Implementation Patterns

### Argument Parsing (`src/args.ts`)
- `parseArgs(args)`: Returns a key-value map. Normalizes underscores to hyphens.
- `requireArg(parsed, key, desc)`: Throws if missing.
- `optionalArg(parsed, key)`: Returns value or undefined.
- `flagArg(parsed, key)`: Returns boolean for flags like `--dry-run`.

### Output Handling (`src/output.ts`)
- Use `printResult(data, renderer?)`.
- **Never** use `console.log` for command results.
- `renderer` is used for TTY pretty-printing. Raw JSON is served to pipes/agents.

### State Management (`src/state.ts`)

- **Authority**: `WorkflowState` interface is the single source of truth.
- **Preferred Pattern**: For all new contributions, prefer `updateState(path, mutate)`. It handles atomic read-modify-write and ensures consistent timestamps.
- **Legacy Pattern**: Some existing commands (e.g., `attach-body`, `reset`) still use direct `readState(path)` followed by `writeState(path, state)`. 
- **Rule**: Contributors should avoid introducing new direct-write patterns unless there is a compelling repository-consistent reason or complex multi-step logic that makes `updateState` impractical.
- **Asset Rule**: Never store large body text in state; use `source_body_path` and `asset_path`.

### Error Handling (`src/cli.ts`)

- **Rule**: Command implementations should `throw new Error("...")` for all operational failures.
- **Top-level Catch**: The entrypoint `src/cli.ts` wraps command execution in a `try...catch` block. It automatically formats the error message and exits with status `1`.
- Avoid catching and silencing errors within commands unless you are specifically implementing a fallback.

### Configuration (`src/config.ts`)
- `loadConfig()`: Loads merged config from disk and env.
- `resolveWorkspaceRoot(workspaceArg, config)`: Resolves the active workspace.
- `resolveWorkspacePaths(root, config)`: Resolves `posts`, `tmp`, and `blog` roots.

## Development & Verification

### Testing
Use `bun test`. Main integration tests are in `src/workflow.test.ts`.

**Config Isolation**: Always isolate tests by setting `process.env.ZZHUB_PIPELINE_CONFIG` to a temporary path.

```typescript
import { join } from "path";
import { tmpdir } from "os";

const TEST_CONFIG_PATH = join(tmpdir(), "test-config.json");
process.env.ZZHUB_PIPELINE_CONFIG = TEST_CONFIG_PATH;
```

### Quality Checks
Run these before every commit:
- `bun test`: Run all tests.
- `bun x tsc --noEmit`: Strict type check.

## Naming Conventions
- **Files**: kebab-case (e.g., `attach-body.ts`).
- **Functions**: camelCase (e.g., `attachBody`).
- **CLI Commands**: kebab-case (e.g., `attach-body`).
