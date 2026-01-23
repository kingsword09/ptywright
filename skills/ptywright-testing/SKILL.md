---
name: ptywright-testing
description: Terminal/TUI automation and regression testing using ptywright (PTY + xterm) via CLI or MCP tools. Use when you need to (1) drive a CLI/TUI app (send keys/mouse, wait, snapshot), (2) run scripted regressions (run/run-all) and review the HTML report (index.html + run.summary.json), or (3) record an interactive MCP-driven session into a replayable script with golden checkpoints.
---

# Ptywright Testing / 使用指南

Use ptywright to run deterministic CLI/TUI regression tests with readable “terminal screenshots” and a Playwright-like HTML report.

## Choose the interface

- **MCP tools**: best for agent-driven interactive flows (`launch_session`, `wait_for_text`, snapshots, recording).
- **CLI**: best for local deterministic regressions and reviewing HTML reports.

In this repo, prefer running via Bun:

- `bun run bin/ptywright ...`

(Only use `ptywright ...` if you installed the binary on your PATH.)

## Start the MCP server

- stdio (default): `bun run bin/ptywright mcp`
- restrict tools to reduce context: `bun run bin/ptywright mcp --caps core` (or `PTYWRIGHT_CAPS=core`)
- Streamable HTTP: `bun run bin/ptywright mcp-http --port 3000`

Capabilities (`--caps` / `PTYWRIGHT_CAPS`) match MCP tools:

- `all|core|debug|script|recording` (comma/space separated)

## Run scripts (deterministic regression)

### Run the whole suite (preferred)

- CLI: `bun run bin/ptywright run-all --dir scripts`
- Output to focus on:
  - `reportPath` (open in a browser)
  - `summaryPath` (`run.summary.json` for agents/CI)

MCP equivalent:

- `run_all_scripts` (defaults: `dir="scripts"`, suite report in `.tmp/run-all/`)
- Keep MCP output small: `run_all_scripts(includeEntries="failures", maxEntries=20)`

### Run one script

- CLI: `bun run bin/ptywright run <file.json|file.ts> [--artifacts-dir <dir>]`
- MCP: `run_script(scriptPath=...)`

## Debug a failure

Script runner artifacts to check (paths are returned by CLI/MCP):

- `*.report.html` (timeline + snapshots)
- `*.cast` (full playback)
- `failure.last.view.txt` / `failure.last.txt` (last screen)
- `failure.error.txt` (stack trace)

Tip: for flaky waits, prefer `scope="buffer"` when the content may have scrolled into scrollback.

## Record an interactive flow (MCP)

1) `start_script_recording(name=...)`
2) Drive the app with normal tools:
   - `launch_session` → `send_text` / `press_key` / `wait_for_text` / `snapshot_*`
3) Add golden checkpoints: `mark(label=...)`
4) Export: `stop_script_recording(recordingId=..., writeFiles=true)`

## All-tools smoke (recommended)

To verify ptywright MCP tool coverage without relying on external apps/network, run:

- `bun test tests/mcp_all_tools_smoke.test.ts`

This exercises `core + debug + script + recording` tools end-to-end.

## Determinism tips

- Fix terminal size (`cols/rows`) and `TERM` (`xterm-256color`) in `launch_session`.
- Use `wait_for_stable_screen` before assertions/snapshots to reduce flake.
- Use `mask` to redact timestamps, random IDs, spinners, etc.
- For live LLM apps: assert on stable markers/state transitions, not exact prose.

## Environment knobs

- `TUI_TEST_PTY_BACKEND=auto|bun-terminal|bun-pty`
  - default `auto`: macOS/Linux prefers `bun-terminal`, Windows uses `bun-pty`
