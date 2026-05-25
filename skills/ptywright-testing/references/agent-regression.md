# Browser Agent Regression

Use this workflow when ptywright drives a browser-hosted terminal renderer. The renderer must expose a terminal root as `[data-terminal-root]`.

## Contract

`launch.mode=command` is the preferred integration:

- `command` and `args` start a wrapper or app process.
- The process prints a browser URL to stdout or stderr.
- ptywright opens that URL with Playwright.
- The page renders the terminal under `[data-terminal-root]`.
- Steps drive browser input and compare terminal/DOM snapshots.

Use `launch.mode=url` only when the page is already running.

## Flow Lifecycle

1. Create a flow JSON or TS file.
2. Run live once and write baselines:

   ```bash
   ptywright agent run tests/agents/name.flow.json --update-snapshots
   ```

3. Compare later without updating:

   ```bash
   ptywright agent run tests/agents/name.flow.json
   ```

4. Replay a run record or cassette without the live agent:

   ```bash
   ptywright agent replay .tmp/agent/name/name.agent-run.json
   ptywright agent replay .tmp/agent/name/name.cassette.json
   ```

5. Promote a good live run into committed non-AI regression:

   ```bash
   ptywright agent promote .tmp/agent/name/name.cassette.json --update-snapshots
   ```

6. Run the committed suite:

   ```bash
   ptywright agent check
   ptywright agent replay-all tests/agent-cassettes --update-snapshots
   ```

## Recommended Flow Shape

```json
{
  "name": "agent_renderer_smoke",
  "launch": {
    "mode": "command",
    "agentFlavor": "codex",
    "command": "node",
    "args": [
      "tests/harness/browser-terminal.js",
      "--",
      "codex",
      "--yolo",
      "--print-url"
    ],
    "waitForUrlMs": 20000,
    "urlRegex": "(https?://\\S+)"
  },
  "defaults": {
    "timeoutMs": 45000,
    "screenshot": false,
    "mask": [{ "regex": "req_[a-zA-Z0-9]+", "replacement": "<request-id>" }]
  },
  "viewports": [{ "name": "desktop", "width": 1280, "height": 820 }],
  "steps": [
    { "type": "waitForStableDom", "quietMs": 600 },
    { "type": "snapshot", "name": "launch", "targets": ["terminal", "dom"] }
  ]
}
```

Keep the flow generic. ptywright should not import app internals. The downstream app should provide a command or test harness that prints a browser URL and can consume replay data if needed.

## Recording Browser Interactions

Use `agent record` when manually exploring a browser-terminal flow:

```bash
ptywright agent record tests/agents/base.flow.json \
  --out tests/agents/recorded.flow.json \
  --duration-ms 60000 \
  --headed
```

End recording by waiting for `duration-ms` to elapse or by stopping the process. The output is a normal flow JSON containing keyboard/click steps plus a final checkpoint.

## Non-AI Regression Strategy

For evolving agent UIs:

1. Capture or create a stable PTY or browser-agent cassette.
2. Replay that cassette into the renderer.
3. Snapshot terminal text and DOM.
4. Commit cassette and snapshots.
5. Use `agent check` in CI.

This lets renderer changes be verified without asking the live AI to reproduce the same answer.

## Artifact Meanings

- `.agent-run.json`: Per-run record with `commands.replay.argv` and `commands.updateSnapshots.argv`.
- `.cassette.json`: Normalized flow spec plus captured terminal/DOM frames and hashes.
- `agent-replay.summary.json`: Replay-all suite summary.
- `agent-check.summary.json`: Committed cassette check summary.
- `agent-promote.summary.json`: Promote operation summary.
- `ptywright-agent.manifest.json`: Hash-indexed portable artifact bundle.
- `index.html`: Human-readable report with snapshots and reusable commands.

## Common Commands

```bash
ptywright agent inspect .tmp/agent-check
ptywright agent validate .tmp/agent-check
ptywright agent commands .tmp/agent-check --json
ptywright agent exec .tmp/agent-check --command rerun
ptywright agent exec .tmp/agent-check --command updateSnapshots
ptywright agent rerun .tmp/agent-check/agent-check.summary.json
```

Prefer `agent exec` when an artifact already contains a reusable command. It avoids shell parsing and relocates copied manifest bundles safely.
