---
name: ptywright-testing
description: Build, run, record, replay, debug, and maintain deterministic terminal, TUI, PTY cassette, and browser-terminal agent regression tests with ptywright. Use when an agent needs to drive CLI/TUI apps, create ptywright scripts, configure ptywright.config.*, record or replay PTY output, solidify browser terminal agent flows into non-AI snapshot tests, inspect generated artifacts, or diagnose ptywright CI failures.
---

# Ptywright Testing

Use ptywright when the task involves terminal or browser-terminal behavior that should be repeatable without manual inspection. Prefer stable text, DOM, and terminal snapshots over screenshots unless the user explicitly needs visual media.

## First Decision

Choose one workflow before editing:

- **Browser terminal agent regression**: Use when a web app renders a terminal and exposes `[data-terminal-root]`, or when testing integrations such as Codex/Claude/Droid wrappers. Read `references/agent-regression.md`.
- **Raw PTY recording and replay**: Use when the user wants to capture terminal bytes from `node-pty`, Bun Terminal, `bun-pty`, or an arbitrary command, then replay them into another renderer. Read `references/raw-pty-cassettes.md`.
- **Scripted TUI tests**: Use when testing a CLI/TUI directly through ptywright scripts, golden snapshots, and HTML reports. Read `references/script-runner.md`.
- **MCP interactive driving or recording**: Use when an agent should interact through ptywright MCP tools or record an MCP-driven session into a script. Read `references/mcp-tools.md`.
- **CI/debugging/artifact triage**: Use when a ptywright run failed, snapshots mismatch, a manifest is stale, or reusable commands need to be executed. Read `references/ci-and-debugging.md`.

If more than one workflow applies, start with the highest-level workflow that preserves determinism. For example, for an evolving browser terminal renderer, record a raw PTY cassette first, then create a browser agent regression that replays the cassette into the renderer.

## Installation And Entry Points

Prefer the local project command when working inside a ptywright checkout:

```bash
bun run bin/ptywright <command>
```

Prefer published package commands in downstream projects:

```bash
bunx ptywright@latest <command>
# or
npx ptywright@latest <command>
```

Common commands:

```bash
ptywright mcp
ptywright mcp --caps core
ptywright run <file.json|file.ts>
ptywright run-all --dir scripts
ptywright agent run <flow.json> --update-snapshots
ptywright agent check
ptywright pty record --out tests/cassettes/session.pty.json -- <command> [args...]
```

## Project Config

Use `ptywright.config.ts` for project defaults, not as a second test DSL. The flow file remains the test case.

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

Priority rule: explicit CLI args override flow fields, and flow fields override config defaults. Config-relative paths resolve from the config file directory.

## Core Invariants

- Keep tests deterministic: fixed terminal size, explicit waits, stable snapshots, masks for random text.
- Prefer structured APIs and generated reusable commands over shell string reconstruction.
- Treat `--update-snapshots` as the only intentional baseline update path.
- Use generated manifests and summaries as durable reproduction bundles.
- Do not hand-edit cassette, run-record, summary, or manifest command metadata unless a test explicitly asks for malformed fixture data.
- Avoid app-specific assumptions. ptywright should integrate with any renderer through commands, URLs, DOM roots, and cassette data.

## Minimal Examples

Browser agent flow:

```json
{
  "name": "browser_terminal_smoke",
  "launch": {
    "mode": "command",
    "agentFlavor": "generic",
    "command": "node",
    "args": ["scripts/start-browser-terminal.js", "--print-url"],
    "waitForUrlMs": 15000
  },
  "steps": [
    { "type": "waitForStableDom" },
    { "type": "snapshot", "name": "ready", "targets": ["terminal", "dom"] }
  ]
}
```

Raw PTY cassette:

```bash
ptywright pty record --out tests/cassettes/codex.pty.json -- codex --yolo
ptywright pty replay tests/cassettes/codex.pty.json --speed 0
ptywright pty validate tests/cassettes/codex.pty.json
```

Script runner:

```json
{
  "name": "tui_smoke",
  "command": ["bun", "tests/fixtures/tui_demo.ts"],
  "cols": 80,
  "rows": 24,
  "steps": [
    { "type": "waitForText", "text": "Ready" },
    { "type": "snapshot", "kind": "text", "saveAs": "ready" }
  ]
}
```

## Verification Commands

Use the narrowest useful verification first, then broaden when editing shared behavior:

```bash
bun run format:check
bun run lint
bun test tests/agent_config.test.ts
bun test tests/agent_rerun.test.ts
bun run build
bun run check
```

For downstream projects:

```bash
ptywright agent validate <artifact-or-dir>
ptywright agent inspect <artifact-or-dir>
ptywright agent commands <artifact-or-dir> --json
ptywright agent exec <artifact-or-dir> --command rerun
```

## Resource Map

- `references/agent-regression.md`: Browser terminal agent flows, cassettes, snapshots, promote/check/rerun, and renderer integration.
- `references/raw-pty-cassettes.md`: Raw PTY cassette recording, replay, wrapper integration, and renderer handoff.
- `references/script-runner.md`: JSON/TS script runner, MCP script recording, goldens, masks, and reports.
- `references/mcp-tools.md`: MCP setup and tool selection.
- `references/ci-and-debugging.md`: Failure triage, manifests, reusable commands, snapshot updates, and CI gates.
