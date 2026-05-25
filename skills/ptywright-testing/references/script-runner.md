# Script Runner

Use scripts for deterministic CLI/TUI tests that do not need a browser terminal renderer.

## JSON Script

```json
{
  "$schema": "../schemas/ptywright-script.schema.json",
  "name": "tui_smoke",
  "command": ["bun", "tests/fixtures/tui_demo.ts"],
  "cols": 80,
  "rows": 24,
  "env": { "TERM": "xterm-256color" },
  "steps": [
    { "type": "waitForText", "text": "Ready", "scope": "buffer" },
    { "type": "snapshot", "kind": "text", "saveAs": "ready" },
    { "type": "expectGolden", "name": "ready" }
  ]
}
```

Run it:

```bash
ptywright run scripts/tui_smoke.json
ptywright run scripts/tui_smoke.json --update-goldens
```

Run a suite:

```bash
ptywright run-all --dir scripts
ptywright run-all --dir scripts --update-goldens
```

## TypeScript Scripts

Use TS scripts when the test needs custom data, helper functions, or custom steps. Keep business logic small. If the script gets complex, move deterministic behavior into a fixture program and keep the ptywright script declarative.

## MCP Recording To Script

When driving a TUI through MCP tools:

1. `start_script_recording(name=...)`
2. Use normal tools such as `launch_session`, `send_text`, `press_key`, `wait_for_text`, and `snapshot_text`.
3. Add checkpoints with `mark(label=...)`.
4. `stop_script_recording(recordingId=..., writeFiles=true)`.

The exported script can be committed and replayed without the original agent interaction.

## Reports And Artifacts

Look for:

- `index.html` or `*.report.html`: Timeline report.
- `*.cast`: Playback stream.
- `run.summary.json`: Suite/run summary.
- `failure.last.view.txt`: Last visible terminal state.
- `failure.last.txt`: Plain last screen.
- `failure.error.txt`: Error details.

## Snapshot Rules

- Use `snapshot_text` or text snapshots for stable regression.
- Use ANSI snapshots only when style information matters.
- Use masks for random tokens, timestamps, ids, progress counters, and spinner glyphs.
- Use `scope="buffer"` when content may scroll out of the viewport.
- Use explicit waits before snapshots. Prefer `waitForText` or stable-screen waits over fixed sleeps.

## CI Pattern

```bash
ptywright run-all --dir scripts
ptywright script validate .tmp/run-all
ptywright script commands .tmp/run-all --json
ptywright script exec .tmp/run-all --command updateGoldens
```

Use update commands only for intentional baseline changes.
