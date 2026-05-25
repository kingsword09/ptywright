import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { main } from "../src/cli";
import { normalizeAgentFlowSpec } from "../src/agent/schema";

test("agent init writes a schema-valid starter spec", async () => {
  const dir = join(".tmp", "tests", "agent-init");
  const path = join(dir, "codex.json");
  rmSync(dir, { recursive: true, force: true });

  await main(["agent", "init", "codex", path]);

  expect(existsSync(path)).toBe(true);
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const spec = normalizeAgentFlowSpec(raw);

  expect(spec.launch.agentFlavor).toBe("codex");
  expect(spec.launch.mode).toBe("command");
  expect(spec.launch.command).toBe("your-browser-terminal-launcher");
  expect(spec.launch.args).toEqual(["--agent", "codex", "--print-url"]);
  expect(spec.steps.at(-1)).toMatchObject({ type: "snapshot", name: "launch" });
});
