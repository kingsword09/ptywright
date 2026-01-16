import { expect, test } from "bun:test";

import { SessionManager } from "../src/session/session_manager";

async function runMaskedSnapshot(
  mask: Array<{ regex: string; flags?: string; replacement?: string; preserveLength?: boolean }>,
) {
  const sessions = new SessionManager({ snapshotRingSize: 10 });
  const session = sessions.launchSession({
    command: process.execPath,
    args: ["tests/fixtures/random_token_demo.ts"],
    cols: 60,
    rows: 8,
  });

  const wait = await session.waitForText({
    text: "DONE",
    timeoutMs: 5_000,
    intervalMs: 50,
  });
  expect(wait.found).toBe(true);

  const snap = await session.snapshotText({
    trimRight: true,
    trimBottom: true,
    mask,
  });

  sessions.closeAll();
  return snap;
}

test("snapshot_text mask makes random output diffable", async () => {
  const mask = [{ regex: "TOKEN: [0-9a-f-]+", flags: "i", replacement: "TOKEN: <id>" }];

  const a = await runMaskedSnapshot(mask);
  const b = await runMaskedSnapshot(mask);

  expect(a.text).toBe("TOKEN: <id>\nDONE");
  expect(b.text).toBe("TOKEN: <id>\nDONE");
  expect(a.hash).toBe(b.hash);
});

test("snapshot_text mask can preserve match length", async () => {
  const mask = [{ regex: "[0-9a-f-]{36}", replacement: "*", preserveLength: true }];

  const snap = await runMaskedSnapshot(mask);
  const firstLine = snap.text.split("\n")[0] ?? "";
  expect(firstLine.startsWith("TOKEN: ")).toBe(true);
  expect(firstLine).toMatch(/^TOKEN: \*{36}$/);
});
