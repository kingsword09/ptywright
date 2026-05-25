import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "bun:test";

import { recordAgentSpec } from "../src/agent/recorder";
import { normalizeAgentFlowSpec } from "../src/agent/schema";
import { deterministicAgentLaunch } from "./agent_fixture";

test("agent recorder writes replayable flow spec with final checkpoint", async () => {
  const dir = join(".tmp", "tests", "agent-recorder");
  const outPath = join(dir, "recorded.flow.json");
  rmSync(dir, { recursive: true, force: true });

  const result = await recordAgentSpec(
    {
      name: "recorded_agent_fixture",
      launch: deterministicAgentLaunch(),
      viewports: [{ name: "desktop", width: 900, height: 640 }],
      defaults: { timeoutMs: 30_000, screenshot: false },
      steps: [{ type: "waitForStableDom" }],
    },
    {
      outPath,
      durationMs: 50,
      headless: true,
    },
  );

  expect(result.ok).toBe(true);
  expect(existsSync(outPath)).toBe(true);

  const spec = normalizeAgentFlowSpec(JSON.parse(readFileSync(outPath, "utf8")) as unknown);
  expect(spec.steps.at(-2)).toMatchObject({ type: "waitForStableDom" });
  expect(spec.steps.at(-1)).toMatchObject({ type: "snapshot", name: "recorded-final" });
});

test("agent recorder can load TypeScript flow specs", async () => {
  const dir = join(".tmp", "tests", "agent-recorder-ts");
  const specPath = join(dir, "recordable.ts");
  const outPath = join(dir, "recorded.flow.json");
  rmSync(dir, { recursive: true, force: true });

  await Bun.write(
    specPath,
    `export default {
      name: "recorded_agent_ts_fixture",
      launch: ${JSON.stringify(deterministicAgentLaunch())},
      viewports: [{ name: "desktop", width: 900, height: 640 }],
      defaults: { timeoutMs: 30000, screenshot: false },
      steps: [{ type: "waitForStableDom" }]
    };
`,
  );

  const { recordAgentSpecPath } = await import("../src/agent/recorder");
  const result = await recordAgentSpecPath(specPath, {
    outPath,
    durationMs: 50,
    headless: true,
  });

  expect(result.ok).toBe(true);
  expect(existsSync(outPath)).toBe(true);
});
