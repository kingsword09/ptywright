---
name: ptywright-testing
description: Terminal/TUI automation and regression testing using ptywright (PTY + xterm) via CLI or MCP tools. Use when you need to (1) drive a CLI/TUI app (send keys/mouse, wait, snapshot), (2) run scripted regressions (run/run-all) and review the suite report (index.html + run.summary.json), or (3) record an interactive MCP-driven session into a replayable script with golden checkpoints.
---

# Ptywright Testing

Use ptywright to run deterministic CLI/TUI regression tests with readable “terminal screenshots” and a Playwright-like HTML suite report.

## Quick Workflow

### 1) Run the whole suite (preferred)

- MCP: call `run_all_scripts` with no args (defaults) or set `dir`/`artifactsRoot`.
- CLI: run `ptywright run-all [--dir <dir>] [--artifacts-root <dir>]`.
- Output to focus on:
  - `reportPath` (open in a browser)
  - `summaryPath` (`run.summary.json` for agents/CI)

### 2) Debug one failing case

- MCP: `run_script(scriptPath=...)`
- CLI: `ptywright run <file> [--artifacts-dir <dir>]`
- Open the per-script `*.report.html` and use the `debug` toggle if needed.

### 3) Record a new flow (agent-driven)

- Start: `start_script_recording(name=...)`
- Drive the app via normal tools (`launch_session`, `press_key`, `send_text`, `wait_for_*`).
- Mark checkpoints: `mark(label=...)` (creates golden snapshots)
- Stop + write: `stop_script_recording(recordingId=..., writeFiles=true)`

## Agent Hygiene

- Prefer `run.summary.json` for reasoning; avoid pasting long `report.html` into chat.
- Keep MCP output small: `run_all_scripts(includeEntries="failures", maxEntries=...)`.
- Make runs deterministic: fixed `cols/rows`, use `waitForStableScreen`, and mask timestamps/IDs.
