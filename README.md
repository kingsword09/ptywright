# ptywright

[中文文档](./README_ZH.md)

A universal "Terminal DevTools / Playwright driver": Launch any CLI/TUI via PTY, feed ANSI/VT output to `@xterm/headless` to rebuild the screen grid, and expose it as MCP (stdio) tools.

## Installation

```bash
# Recommended: Run with bunx (no install needed)
bunx ptywright@latest --help

# Or install globally
bun add -g ptywright
ptywright --help

# Or via npm/npx
npx -y ptywright@latest --help
npm install -g ptywright
```

## Quick Start

### Use as MCP Server

```bash
# stdio mode (default)
bunx ptywright@latest mcp

# HTTP mode
bunx ptywright@latest mcp-http --port 3000

# Minimal tools (reduce Agent context pressure)
bunx ptywright@latest mcp --caps core
```

### Configure MCP Client

**Claude Desktop / Cursor** (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "ptywright": {
      "command": "bunx",
      "args": ["ptywright@latest", "mcp"]
    }
  }
}
```

**Minimal mode** (load core tools only):

```json
{
  "mcpServers": {
    "ptywright": {
      "command": "bunx",
      "args": ["ptywright@latest", "mcp", "--caps", "core"]
    }
  }
}
```

**HTTP mode** (for Web clients):

```json
{
  "mcpServers": {
    "ptywright": {
      "command": "bunx",
      "args": ["ptywright@latest", "mcp-http", "--port", "3000"]
    }
  }
}
```

### CLI Commands

```bash
# Run a single test script
bunx ptywright@latest run scripts/demo.json

# Run all scripts (generate HTML report)
bunx ptywright@latest run-all --dir scripts

# Show help
bunx ptywright@latest --help
```

## Tools

All tools are enabled by default (`--caps all`). Use `--caps core` or combine as needed:

- Default: `--caps all`
- Minimal: `--caps core`
- Combined: `--caps core,debug,script,recording`

### core

- `list_sessions` / `select_session`: Manage and select sessions
- `launch_session`: Start a PTY session (becomes default session)
- `send_text` / `press_key`: Send input
- `snapshot_text`: Return visible screen text (for Agent "seeing" and golden snapshots)
- `snapshot_view`: Human-friendly snapshot (with metadata + line numbers)
- `wait_for_text`: Wait for text/regex to appear
- `wait_for_stable_screen`: Wait for screen to stabilize within quiet window (reduce flaky)
- `assert`: Assert on current screen (text/regex/semantic)
- `close_session`: Close session

### debug (optional)

- `snapshot_ansi`: Return visible screen with ANSI/SGR styles (for debug/human review)
- `snapshot_view_ansi`: `snapshot_view` with ANSI/SGR styles

### script (optional)

- `run_routine`: Execute multi-step interactions in one call (type/key/wait/assert/snapshot)
- `run_script`: Run `scriptPath=file.json|file.ts` and produce artifacts (cast/report/failure snapshots)
- `run_all_scripts`: Run scripts in directory recursively (supports `includeEntries/maxEntries`)
- `generate_test_from_doc`: Generate executable scripts from documentation (local/URL)
- `inspect_failure`: View last failure screen and error

### recording (optional)

- `start_script_recording` / `stop_script_recording`: Record MCP tool calls and export replayable scripts (JSON + goldens)
- `mark`: Add marker to trace (asciicast marker event)

### `mask` Parameter

`snapshot_text/snapshot_ansi/snapshot_view/snapshot_view_ansi` support `mask=[{regex,flags?,replacement?,preserveLength?}]` to convert random IDs/timestamps into diffable stable snapshots.

### `press_key` Key Spec

Supports single keys and modifier combinations (case-insensitive, `+`/`-` as separator):
- Single char: `"a"` / `"?"` (written to PTY as-is)
- Special keys: `Enter|Return`, `Esc|Escape`, `Backspace`, `Space`, `Tab`, `BackTab`
- Combos: `Ctrl+C`, `Ctrl+Shift+R`, `Alt+X`/`Meta+X`, `Shift+Tab`, `Ctrl+Up`
- Navigation: `Up/Down/Left/Right`, `Home/End`, `PageUp/PageDown`, `Insert/Delete`, `F1..F12`
- Compatible: `c-x` (equals `Ctrl+X`)

## Script Runner (JSON)

Write TUI tests as JSON: launch → input → wait → snapshot (with mask) → assert, automatically producing `.cast` + `report.html`.

Optional: Add schema for editor completion/validation:

```json
{ "$schema": "node_modules/ptywright/schemas/ptywright-script.schema.json" }
```

```bash
# Run single script
bunx ptywright@latest run scripts/m5_mask_demo.json

# Run all scripts
bunx ptywright@latest run-all --dir scripts
```

Artifacts go to `.tmp/runs/<name>/` by default (override with `--artifacts-dir`).

Batch runs generate an overview report:
- Default: `.tmp/run-all/index.html` + `.tmp/run-all/run.summary.json`
- With `--artifacts-root <dir>`: `<dir>/index.html` + `<dir>/run.summary.json`

On failure, additional files are saved:
- `failure.error.txt` (error stack)
- `failure.step.json` (failed step info)
- `failure.last.txt` / `failure.last.view.txt` (last frame snapshot)

`report.html` includes **Timeline View** showing screen snapshots after each step. Click the `debug` badge to switch to debug view.

Built-in steps (no `--steps` needed):
- `assert`: Assert text/regex (`text`/`regex`)
- `assertSemantic`: Semantic assertion placeholder (`prompt`)
- `sleep`: Fixed wait
- `expectMeta`: Assert terminal meta
- `waitForExit`: Wait for process exit
- `sendMouse`: Send SGR mouse events

For `type:"custom"` steps, inject handlers with `--steps <module.ts>`:

```bash
bunx ptywright@latest run demo.json --steps custom_steps.ts
```

## Script Recording (MCP)

Record tool calls into replayable scripts from any MCP client/Agent:

1) `start_script_recording(name="my_flow")`
2) Execute normally: `launch_session/send_text/press_key/wait_for_*`
3) Add checkpoints: `mark(label="checkpoint")` (auto-generates `snapshot + expectGolden`)
4) `stop_script_recording(recordingId=...)` (writes `scripts/my_flow.json` + `tests/golden/scripts/my_flow/*.txt`)

## Script DSL (TypeScript)

Write scripts with TS builder (type-safe, composable, custom steps):

```bash
bunx ptywright@latest run scripts/demo.ts
```

Conventions:
- Module default export (`export default`), or export `script`.
- Optional `steps` export (custom step handlers) for `type:"custom"` steps.
- Use `pasteText("...", { bracketed: true })` for bracketed paste testing.

## Cast -> SVG/GIF (Optional)

Recording artifacts are best for failure diagnosis or manual review; prefer `snapshot_grid` diff for stable regression.

- SVG: `bunx svg-term --in <castPath> --out <outSvg>`
- GIF: `agg --fps 30 <castPath> <outGif>` (requires [asciinema/agg](https://github.com/asciinema/agg))

## Browser Agent Regression

The new destructive path is browser-first: ptywright can launch an agent through
`@aitty/cli`, drive the browser-hosted wterm DOM with Playwright, and persist a
replayable run artifact plus terminal/DOM snapshots.

```bash
# First run records snapshots, screenshots, replay metadata, and report.
bun run bin/ptywright agent run examples/agent_deterministic.json --update-snapshots

# Later runs compare terminal + DOM snapshots like a test snapshot.
bun run bin/ptywright agent run examples/agent_deterministic.json

# Replay does not need AI; it uses the recorded flow artifact.
bun run bin/ptywright agent replay .tmp/agent/agent_deterministic/agent_deterministic.agent-run.json
```

Artifacts are split intentionally:
- `.tmp/agent/<name>/` contains run output, screenshots, `*.flow.json`,
  `*.agent-run.json`, and `index.html`.
- `tests/agent-snapshots/<name>/` contains stable terminal/DOM baselines.
- `--update-snapshots` is the explicit update path for intentional UI changes.

`launch.mode=aitty` runs `aitty exec --launch print -- <agent>`. By default
ptywright resolves the sibling `../aitty/packages/cli/dist/cli.js`; set
`PTYWRIGHT_AITTY_CLI` or `launch.aitty.command` to override it.

## Development

```bash
bun install

# Start MCP server
bun run bin/ptywright mcp

# Run tests
bun test

# Lint & Format
bun run lint
bun run format:check

# Run scripts
bun run bin/ptywright run scripts/m5_mask_demo.json
bun run bin/ptywright run-all

# Run browser agent regression
bun run bin/ptywright agent run examples/agent_deterministic.json --update-snapshots
```

## Environment Variables

- `TUI_TEST_PTY_BACKEND=auto|bun-terminal|bun-pty`
  - default `auto`: macOS/Linux prefers `bun-terminal`, Windows uses `bun-pty`
- `PTYWRIGHT_CAPS=all|core|debug|script|recording`
  - Equivalent to `--caps` parameter

## License

Apache-2.0
