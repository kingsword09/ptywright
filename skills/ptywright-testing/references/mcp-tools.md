# MCP Tools

Use MCP when an agent should interact with a live terminal session, inspect terminal state, or record an exploratory flow into a script.

## Start Server

```bash
ptywright mcp
ptywright mcp --caps core
ptywright mcp --caps core,script,recording
ptywright mcp-http --port 3000
```

Capabilities:

- `core`: Launch sessions, send input, wait, snapshot.
- `debug`: Extra inspection and traces.
- `script`: Run script files and suites.
- `recording`: Record MCP tool calls into scripts.
- `all`: Everything.

Use smaller capability sets to reduce agent context pressure.

## Client Config

Example for clients that use a JSON MCP server config:

```json
{
  "mcpServers": {
    "ptywright": {
      "command": "bunx",
      "args": ["ptywright@latest", "mcp", "--caps", "core,script,recording"]
    }
  }
}
```

Inside this repository, use:

```json
{
  "mcpServers": {
    "ptywright": {
      "command": "bun",
      "args": ["run", "src/cli.ts", "mcp"]
    }
  }
}
```

## Tool Selection

Typical interactive sequence:

1. `launch_session` with fixed `cols`, `rows`, and `env.TERM`.
2. `wait_for_text` for stable startup markers.
3. `send_text`, `press_key`, or mouse tools.
4. `wait_for_stable_screen` before snapshots.
5. `snapshot_text`, `snapshot_view`, or `snapshot_grid`.
6. `close_session` when done.

Prefer semantic terminal snapshots over screenshots. Use screenshots only if the task explicitly needs visual proof.

## Recording

Use recording when an exploratory interaction should become a repeatable test:

```text
start_script_recording
launch_session
send_text / press_key / wait_for_text / snapshot_text
mark
stop_script_recording(writeFiles=true)
```

After export, run the generated script from the CLI to ensure it is deterministic:

```bash
ptywright run <exported-script.json>
ptywright run <exported-script.json> --update-goldens
```

## Context Control

When using MCP from an LLM agent:

- Avoid returning huge terminal text unless needed.
- Prefer `includeText=false` or failure-only entries for suite tools when available.
- Use report and summary paths for detailed inspection.
- Use masks early if non-deterministic output appears.
