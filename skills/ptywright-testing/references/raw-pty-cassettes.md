# Raw PTY Cassettes

Use raw PTY cassettes when the goal is to capture terminal output once and replay it later without relaunching the original CLI, AI agent, or TUI.

## CLI Recording

```bash
ptywright pty record --out tests/cassettes/session.pty.json -- <command> [args...]
ptywright pty validate tests/cassettes/session.pty.json
ptywright pty inspect tests/cassettes/session.pty.json
ptywright pty replay tests/cassettes/session.pty.json --speed 0
```

Examples:

```bash
ptywright pty record --out tests/cassettes/codex-yolo.pty.json -- codex --yolo
ptywright pty record --out tests/cassettes/browser-terminal-codex.pty.json -- \
  node tests/harness/browser-terminal.js -- codex --yolo
```

Use `--cols`, `--rows`, `--term`, and `--backend` to stabilize output:

```bash
ptywright pty record \
  --out tests/cassettes/session.pty.json \
  --cols 120 \
  --rows 32 \
  --term xterm-256color \
  --backend auto \
  -- <command>
```

## Programmatic Integration

Use `ptywright/pty-cassette` in projects that already control a PTY-like object.

```ts
import { wrapPtyLike } from "ptywright/pty-cassette";

const recorder = wrapPtyLike(ptyProcess, {
  path: "tests/cassettes/session.pty.json",
  command: ["codex", "--yolo"],
  cols: 120,
  rows: 32,
  term: "xterm-256color",
});

// Use recorder.process like the original ptyProcess.
// Close/finalize according to the package API.
```

Prefer wrapper integration when a downstream project wants to keep using native `node-pty`, Bun Terminal, or `bun-pty` while still producing ptywright-compatible data.

## Renderer Handoff Pattern

For browser terminal renderers:

1. Record raw PTY output as `*.pty.json`.
2. Add a small local harness in the renderer project that loads this cassette and renders it into the browser terminal.
3. Print the browser URL from that harness.
4. Use a ptywright agent flow to open the URL and snapshot `[data-terminal-root]`.

This separates byte-level reproduction from renderer-level DOM regression.

## Updating Scenarios Without Duplicating Huge Sessions

Avoid repeatedly recording long sessions just to test one rendering edge.

Recommended patterns:

- Keep small, named cassettes for specific UI states: `code-block.pty.json`, `spinner.pty.json`, `long-line.pty.json`.
- Prefer fixture commands that emit deterministic terminal sequences for a targeted state.
- Trim at the source by recording a shorter command or a purpose-built harness.
- Use masks to normalize timestamps, ids, spinner ticks, and model names.
- Store cassettes under `tests/cassettes/` and keep renderer snapshots under `tests/agent-snapshots/`.

If an existing long cassette is useful but contains irrelevant frames, create a derived fixture in the app's harness rather than hand-editing hashes unless the project has a supported cassette transform.

## When To Use Browser Agent Cassettes Instead

Use browser agent cassettes when you need DOM snapshots, viewport coverage, or Playwright interactions. Use raw PTY cassettes when you only need terminal bytes and want broad compatibility with any PTY provider.
