import { expect, test } from "bun:test";

import { existsSync } from "node:fs";

import { SessionManager } from "../src/session/session_manager";

function resolveCodexCommand(): string | null {
  const explicit = process.env.CODEX_BIN;
  if (explicit && explicit.trim()) return explicit;

  const which = Bun.which("codex");
  if (which) return which;

  const home = process.env.HOME;
  if (!home) return null;

  const candidates = [
    `${home}/.local/share/mise/installs/codex/latest/codex`,
    `${home}/.local/share/mise/installs/codex/0/codex`,
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  return null;
}

test("codex --help contains Usage: codex (direct driver)", async () => {
  const codex = resolveCodexCommand();
  if (!codex) {
    console.warn("codex not found; skipping (set CODEX_BIN to enable)");
    return;
  }

  const sessions = new SessionManager({ snapshotRingSize: 10 });

  const session = sessions.launchSession({
    command: codex,
    args: ["--help"],
    cols: 120,
    rows: 300,
    name: "xterm-256color",
  });

  const wait = await session.waitForText({
    text: "Usage: codex",
    timeoutMs: 10_000,
    intervalMs: 50,
  });

  expect(wait.found).toBe(true);
  sessions.closeAll();
});
