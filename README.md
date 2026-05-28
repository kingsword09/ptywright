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

### Raw PTY Cassette

`ptywright pty` records the raw PTY stream once and replays it later without
rerunning the original command. This is intended for browser terminal renderers
that need deterministic regression tests for prompts or AI sessions that are
hard to reproduce live.

```bash
# Record output/input/resize/exit as base64 PTY events
bunx ptywright@latest pty record --out tests/cassettes/codex.pty.json -- codex

# Replay the same raw output stream instantly
bunx ptywright@latest pty replay tests/cassettes/codex.pty.json

# Validate or inspect the portable artifact
bunx ptywright@latest pty validate tests/cassettes/codex.pty.json
bunx ptywright@latest pty inspect tests/cassettes/codex.pty.json
```

External projects do not need a ptywright-specific PTY wrapper. Use the structural
`wrapPtyLike` API for `node-pty`/`bun-pty` style objects:

```ts
import { wrapPtyLike } from "ptywright/pty-cassette";

const recorded = wrapPtyLike(pty, {
  path: "tests/cassettes/session.pty.json",
  terminal: { cols: 120, rows: 40, term: "xterm-256color" },
  command: { file: "codex", args: [] },
});

recorded.write("hello\r");
// output and exit are captured from pty.onData/onExit
```

For Bun Terminal callback-style integration, create a recorder and call
`recordOutput` from the terminal `data` hook, or use
`wrapBunTerminalOptions`. The cassette can then be replayed into any renderer
and compared by that renderer's DOM/text snapshot tests.

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
- `run.summary.json` stores `commands.runAll.argv` and
  `commands.updateGoldens.argv` so automation can replay the suite or update
  goldens without reconstructing CLI arguments.

You can read or execute those commands directly from the generated artifact:

```bash
bunx ptywright@latest script commands .tmp/run-all --json
bunx ptywright@latest script commands .tmp/run-all/run.summary.json --command runAll
bunx ptywright@latest script inspect .tmp/run-all
bunx ptywright@latest script validate .tmp/run-all
bunx ptywright@latest script exec .tmp/run-all --command updateGoldens
```

Suite directories also include `ptywright-script.manifest.json`, which indexes
the generated summary, reports, casts, data, and failure artifacts with
`bytes`/`sha256`. `script validate`, `script inspect`, `script commands`, and
`script exec` verify that manifest before using a directory bundle, so copied
script run artifacts can be replayed or updated without trusting stale files.

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

### Framework Backends

`launch.backend` defaults to `pty`. For faster framework-level checks, use
`frames`, `ratatui`, or `ink` to run the same script steps against deterministic
frames without starting a PTY:

```json
{
  "$schema": "../schemas/ptywright-script.schema.json",
  "name": "ratatui_snapshot",
  "launch": {
    "backend": "ratatui",
    "cols": 60,
    "rows": 12,
    "frames": [
      "Screen: Dashboard\nMode: HIGH",
      "Screen: Permissions\nMode: LOW"
    ]
  },
  "steps": [
    { "type": "waitForText", "text": "Dashboard" },
    { "type": "pressKey", "key": "Enter" },
    { "type": "snapshot", "kind": "text", "saveAs": "final" },
    { "type": "expect", "from": "final", "contains": ["Mode: LOW"] }
  ]
}
```

`ratatui` is intended for text emitted by `TestBackend`/insta-style snapshots.
`ink` can load a module via `frameModule` that exports `frames`, `frame`,
`snapshot`, or `lastFrame`. Input steps such as `pressKey` and `sendText`
advance to the next frame by default, so the assertion path stays identical to
the PTY end-to-end script.

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

The browser-first path is integration-agnostic: ptywright launches any command
that prints a browser URL, drives the terminal DOM with Playwright, and persists
a replayable run artifact plus terminal/DOM snapshots. The browser page must
expose the terminal root as `[data-terminal-root]`.

```bash
# First run records snapshots, screenshots, replay metadata, and report.
bun run src/cli.ts agent run examples/agent_deterministic.json --update-snapshots

# Later runs compare terminal + DOM snapshots like a test snapshot.
bun run src/cli.ts agent run examples/agent_deterministic.json

# Replay does not need AI; it uses the recorded flow artifact.
bun run src/cli.ts agent replay .tmp/agent/agent_deterministic/agent_deterministic.agent-run.json

# Cassette files are also directly replayable.
bun run src/cli.ts agent replay .tmp/agent/agent_deterministic/agent_deterministic.cassette.json

# Promote a live run/cassette into the committed non-AI regression suite.
bun run src/cli.ts agent promote \
  .tmp/agent/agent_deterministic/agent_deterministic.cassette.json \
  --update-snapshots

# Batch replay committed cassettes/run records as a regression suite.
bun run src/cli.ts agent replay-all .tmp/agent --artifacts-root .tmp/agent-replay-all

# Rerun directly from a generated summary artifact.
bun run src/cli.ts agent rerun .tmp/agent-promote/agent_deterministic/agent-promote.summary.json
bun run src/cli.ts agent rerun .tmp/agent-check/agent-check.summary.json
bun run src/cli.ts agent rerun .tmp/agent-check/agent-replay.summary.json --update-snapshots

# Read reusable commands from any supported agent artifact.
bun run src/cli.ts agent commands .tmp/agent-check/agent-check.summary.json --json
bun run src/cli.ts agent commands .tmp/agent-check/agent-check.summary.json --command rerun
bun run src/cli.ts agent commands .tmp/agent-check --json
bun run src/cli.ts agent inspect .tmp/agent-check
bun run src/cli.ts agent inspect .tmp/agent-check --json
bun run src/cli.ts agent validate .tmp/agent-check
bun run src/cli.ts agent exec .tmp/agent-check --command rerun
bun run src/cli.ts agent exec .tmp/agent-check --command updateSnapshots
bun run src/cli.ts agent exec .tmp/agent-check/agent-check.summary.json --command rerun
bun run src/cli.ts agent exec .tmp/agent-check/agent-check.summary.json --command updateSnapshots

# Validate flow/cassette/run-record/summary artifacts before committing.
bun run src/cli.ts agent validate .tmp/agent-replay-all

# Run committed cassette replay regression without launching live agents.
bun run src/cli.ts agent check
bun run src/cli.ts agent check --json

# Update terminal/DOM baselines from committed cassettes intentionally.
bun run src/cli.ts agent replay-all tests/agent-cassettes --update-snapshots

# Record browser interactions into a replayable flow spec.
bun run src/cli.ts agent record examples/agents/codex_browser_smoke.json \
  --out scripts/agents/codex_recorded.flow.json \
  --duration-ms 60000 \
  --headed

# Generate starter specs for real agents.
bun run src/cli.ts agent init codex examples/agents/codex_browser_smoke.json
bun run src/cli.ts agent init claude examples/agents/claude_browser_smoke.json
bun run src/cli.ts agent init droidx examples/agents/droidx_browser_smoke.json
```

DOM artifact viewers prefer project renderer assets when available. If
`@aitty/browser` is resolvable from the current project, flow path, report path,
or artifact directory, ptywright copies `@aitty/browser/style.css` and the Aitty
snapshot web component into the report artifacts and renders snapshots through
`<aitty-snapshot>`. The classic `web-component.global.js` bundle is preferred for
portable file reports; `web-component.js` is used as a module fallback. In this
path, terminal internals such as wterm rows, ANSI styling, termvision, and
viewport-pan come from `@aitty/browser`; ptywright only supplies the report frame
and copied assets. If those assets are unavailable, the report falls back to a
self-contained terminal preview so ptywright remains renderer-agnostic.

Artifacts are split intentionally:
- `.tmp/agent/<name>/` contains run output, screenshots, `*.flow.json`,
  `*.agent-run.json`, `*.cassette.json`, `index.html`, and
  `ptywright-agent.manifest.json`.
- `tests/agent-snapshots/<name>/` contains stable terminal/DOM baselines.
- `--update-snapshots` is the explicit update path for intentional UI changes.

### Project Config

For repeated agent regression work, put project-level defaults in
`ptywright.config.ts` instead of repeating paths and browser defaults in every
flow file. The CLI discovers `ptywright.config.ts|mts|cts|js|mjs|cjs` from the
current directory upward, and `--config <file>` selects one explicitly.

```ts
import { defineConfig } from "ptywright/config";

export default defineConfig({
  agent: {
    artifactsRoot: ".tmp/agent",
    cassetteDir: "tests/agent-cassettes",
    snapshotDir: "tests/agent-snapshots",
    defaults: {
      headless: true,
      timeoutMs: 45_000,
      screenshot: false,
      viewports: [{ name: "desktop", width: 1280, height: 820 }],
      mask: [{ regex: "session_[a-z0-9]+", replacement: "<session>" }],
    },
  },
});
```

```bash
ptywright agent run tests/agents/codex.flow.json --update-snapshots
ptywright agent check
ptywright agent replay-all --update-snapshots
ptywright agent promote .tmp/agent/codex/codex.cassette.json --update-snapshots
```

Config paths are resolved relative to the config file directory. CLI arguments
override config defaults, and fields written in a flow file override config
defaults for that flow. The flow file remains the test case; the config file is
only for shared project defaults and common artifact locations.

`launch.mode=command` is the recommended integration contract. `command` and
`args` are spawned directly, and ptywright reads the first URL printed to stdout
or stderr. Use `waitForUrlMs` to tune startup timeouts and `urlRegex` when the
URL is embedded in structured output. Set `launch.agentFlavor` explicitly when
the command is a wrapper, so mask presets still match the underlying agent.

`launch.mode=url` skips process launch and points ptywright at an already
running browser terminal.

A wrapper integration is just a normal command that prints its browser URL:

```json
{
  "name": "codex_browser_replay",
  "launch": {
    "mode": "command",
    "agentFlavor": "codex",
    "command": "node_modules/.bin/browser-terminal-launcher",
    "args": [
      "--replay",
      "test/recordings/codex-yolo.pty.json",
      "--speed",
      "0",
      "--print-url"
    ],
    "waitForUrlMs": 15000
  },
  "steps": [
    { "type": "waitForStableDom" },
    { "type": "snapshot", "name": "codex", "targets": ["terminal", "dom"] }
  ]
}
```

Set `launch.agentFlavor` to `codex`, `claude`, `droid`, or `generic` to opt
into built-in mask presets for timestamps, generated ids, model names, token
counts, and other non-deterministic terminal text. Explicit
`defaults.mask=[...]` rules are appended after the preset, so project-specific
noise can be hidden without rewriting the runner.

`agent record` opens the same browser-hosted terminal and writes the captured
keyboard/click steps back to a normal flow JSON. The output can be committed and
run later with `agent run`, while `.agent-run.json` remains the per-run replay
record generated by the runner. Run records must include
`commands.replay.argv` and `commands.updateSnapshots.argv`, so automation can
replay or intentionally update the captured flow without parsing shell strings.

`agent run` is the live path: it launches the configured process and updates or
compares terminal/DOM snapshots. `agent promote <run|cassette>` is the
intentional solidify step after a good live run: it copies the cassette into
`tests/agent-cassettes/<name>/`, rewrites its `snapshotDir`, optionally updates
terminal/DOM baselines, replays the promoted cassette, and writes
`agent-promote.summary.json` with direct commands for future non-AI checks. HTML
reports also surface replay/update/inspect commands so failed runs can be
reproduced directly from the report page.
`agent replay` is the single-case cassette regression path: it accepts either
`.agent-run.json` or `.cassette.json`, serves a local replay page, and reproduces
the previously captured terminal DOM without launching Codex, Claude, Droid, or
any other live agent process. `agent replay-all` recursively scans a directory
for `.agent-run.json` and `.cassette.json` files, then writes
`agent-replay.summary.json` and an HTML suite report so committed cassettes can
be run like a snapshot regression suite.
`--update-snapshots` works on `agent replay-all`, so intentional DOM/terminal
baseline changes can be updated from committed cassettes without a live agent.
Cassette files embed the normalized flow spec plus frame hashes, so they remain
self-contained replay artifacts when copied away from the original run
directory. Replay runs also copy the source cassette into the replay artifact
directory and write run records that point at that local copy, so the replay
directory can be moved as a durable reproduction bundle. Run/check/promote and
replay-all outputs also include `ptywright-agent.manifest.json`, which indexes
produced files with artifact-root-relative paths plus `bytes` and `sha256`,
stores reusable `commands.*.argv`, and can be passed to `agent commands`,
`agent inspect`, `agent exec`, or `agent validate`. `agent inspect
<artifact|dir>` is the self-describing bundle check: when pointed at an artifact
directory it prefers `ptywright-agent.manifest.json`, validates indexed file
hashes, summarizes manifest file kinds/validation stages, and prints the
relocated reusable commands. Because file entries are relative to the manifest
directory and manifest commands are relocated when read, copying the whole
artifact directory preserves both manifest validation and direct
`agent inspect <copied>` /
`agent commands <copied>` /
`agent exec <copied> --command rerun` workflows.
When inspecting a moved summary file that is the manifest primary artifact,
`agent inspect` also prints `commandsManifest=<path>` and includes
`commands.manifestPath` in JSON output, making it explicit which manifest bundle
will validate and relocate the stored commands before execution.
The same directory entrypoint works for copied live-run bundles too, so
`agent exec <copied-run> --command replay` and `--command updateSnapshots`
remain usable after the original run directory is deleted.
Copied replay-suite bundles are rerun from the run records stored under the
bundle's own `tests/` directory, so they do not need the original cassette input
directory. Promote bundles can move their artifact root and still rerun from the
copied manifest, while continuing to target the promoted cassette suite.
If `agent inspect <dir>` sees agent artifacts but no top-level manifest, it
still reports recursive validation results and prints a `directoryManifest`
diagnostic so the directory is not confused with a portable commands/exec
bundle.
For `agent commands` and `agent exec`, a directory argument means a manifest
bundle directory and must contain `ptywright-agent.manifest.json`; use
`agent validate <dir>` when you want recursive artifact discovery.
The generated agent flow, cassette, run-record, manifest, promote-summary,
replay-summary, and check-summary JSON files each carry a `$schema` URL under
`schemas/` so editors and CI tooling can validate the replay contract directly.
Run-record and summary schemas also encode the expected stored command prefixes,
for example `ptywright agent replay`, `ptywright agent replay-all`, and
`ptywright agent rerun`, so malformed commands can be caught before execution.
Run records and summaries reject missing or stale `commands.*.argv` metadata,
because those argv arrays are the non-AI replay/update contract for the artifact.
Promote, replay, and check summaries include `commands.*.argv` arrays for direct
non-AI reruns and snapshot updates. Each summary also includes
`commands.rerun.argv`, so downstream automation can re-execute the exact summary
artifact without reconstructing CLI arguments. `agent commands <artifact>
--command <name>` prints one shell-safe command line for scripts that want to
execute a specific replay/update/rerun path directly; with `--json`, the same
command includes `cwd`, `command.argv`, and `shell` so automation can choose
structured spawn or shell execution. When a moved summary/run-record is backed
by a sibling manifest bundle, `agent commands` also reports the manifest path in
plain output and JSON so automation can see which bundle is responsible for
relocation and integrity checks; manifest-backed command discovery validates
stored command targets and indexed file hashes before printing commands.
`agent exec <artifact> --command <name>`
executes a stored agent command through ptywright's own CLI dispatcher, so it
does not depend on shell parsing or a global `ptywright` binary. This includes
stored `updateSnapshots` commands, which provide the non-AI equivalent of a
snapshot update run from an existing summary artifact. `agent validate
<artifact>` also checks that every stored argv starts with a supported
`ptywright agent <subcommand>` shape before accepting the artifact. If validation
fails on `commands.*.argv`, regenerate the run/summary with `agent run`,
`agent replay-all`, `agent promote`, or `agent check`; do not hand-edit shell
strings as a recovery path, because the argv arrays are the replay contract.
`agent rerun <summary>` reads `agent-promote.summary.json`,
`agent-check.summary.json`, or
`agent-replay.summary.json` and replays the stored cassette directory/artifact
root without launching a live agent. `agent commands <artifact>` reads
flow/cassette/run-record/summary artifacts and prints the reusable argv commands
without executing them. `agent validate <path>` accepts a single artifact or a
directory and returns a non-zero exit code when any known agent replay artifact
is malformed. `agent check [dir]` validates committed cassettes under
`tests/agent-cassettes` by default, replays them into `.tmp/agent-check`, writes
`agent-check.summary.json`, then validates the generated suite output. Add
`--json` for a CI-friendly summary with input/replay/output counts and failure
details.

## Development

```bash
bun install

# Start MCP server
bun run src/cli.ts mcp

# Run tests
bun run test
bun run agent:check
bun run check

# CI installs Chromium, runs bun run check, and uploads .tmp/agent-check.

# Lint & Format
bun run lint
bun run format:check

# Run scripts
bun run src/cli.ts run scripts/m5_mask_demo.json
bun run src/cli.ts run-all

# Run browser agent regression
bun run src/cli.ts agent run examples/agent_deterministic.json --update-snapshots
```

## Environment Variables

- `TUI_TEST_PTY_BACKEND=auto|bun-terminal|bun-pty`
  - default `auto`: macOS/Linux prefers `bun-terminal`, Windows uses `bun-pty`
- `PTYWRIGHT_CAPS=all|core|debug|script|recording`
  - Equivalent to `--caps` parameter

## License

Apache-2.0
