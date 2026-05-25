# CI And Debugging

Use this guide when a ptywright command fails, CI times out, snapshots mismatch, or generated artifact commands need to be reused.

## First Triage

1. Read the failing command and exact artifact paths from the log.
2. Open the HTML report if available.
3. Inspect the generated summary JSON.
4. Run validation on the artifact or directory.
5. Use generated commands instead of reconstructing shell strings manually.

Commands:

```bash
ptywright agent inspect <artifact-or-dir>
ptywright agent validate <artifact-or-dir>
ptywright agent commands <artifact-or-dir> --json
ptywright agent commands <artifact-or-dir> --command rerun
ptywright agent exec <artifact-or-dir> --command rerun
ptywright agent exec <artifact-or-dir> --command updateSnapshots
```

## Snapshot Mismatches

Default replay/check mode compares snapshots. Only update baselines intentionally:

```bash
ptywright agent replay-all tests/agent-cassettes --update-snapshots
ptywright agent exec <artifact-or-dir> --command updateSnapshots
```

For script runner:

```bash
ptywright run-all --dir scripts --update-goldens
ptywright script exec <summary-or-dir> --command updateGoldens
```

Always inspect diffs before committing updated baselines.

## Portable Bundles

Agent run/check/promote/replay-all outputs include `ptywright-agent.manifest.json`. A manifest bundle can be copied and still supports:

```bash
ptywright agent inspect <copied-dir>
ptywright agent commands <copied-dir> --json
ptywright agent exec <copied-dir> --command rerun
ptywright agent validate <copied-dir>
```

If a directory has artifacts but no top-level manifest, use `agent validate <dir>` for recursive validation. `agent commands` and `agent exec` expect a manifest-backed command bundle for directory arguments.

## Common Failure Causes

- Missing `[data-terminal-root]` in browser terminal pages.
- Flow waits on unstable AI prose instead of stable markers.
- Snapshot baseline was not updated after an intentional UI change.
- Random text was not masked.
- Relative cassette or snapshot paths were moved without a manifest bundle.
- Stored command metadata in summaries was hand-edited and no longer matches schema expectations.
- CI is too slow for tests that run multiple full browser replays in one case.

## Timeout Reduction

When a test times out:

- Avoid running setup and rerun paths that both do full browser replay in the same test.
- Use summary fixtures to test command metadata or override behavior.
- Keep one full end-to-end test per workflow and make surrounding tests narrower.
- Use committed deterministic cassettes instead of live agents.
- Keep test timeouts realistic but do not hide structural slowness by only increasing timeouts.

## Repository Gates

For ptywright itself:

```bash
bun run format:check
bun run lint
bun test tests/agent_rerun.test.ts
bun test tests/agent_promote.test.ts tests/agent_commands.test.ts
bun run build
bun run check
```

For downstream projects:

```bash
ptywright agent check
ptywright agent validate .tmp/agent-check
```

Use the narrowest failing test while iterating, then broaden before finalizing shared behavior.
