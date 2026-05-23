import { expect, test } from "bun:test";

import { buildAittyExecCommand, extractAittyUrlFromOutput } from "../src/agent/aitty";
import { normalizeAgentFlowSpec } from "../src/agent/schema";

test("agent flow schema normalizes default viewport", () => {
  const spec = normalizeAgentFlowSpec({
    launch: {
      command: "codex",
    },
    steps: [{ type: "waitForText", text: "ready" }],
  });

  expect(spec.name).toBe("agent-flow");
  expect(spec.viewports?.[0]?.name).toBe("desktop-1440");
});

test("aitty launch command uses print mode and keeps agent args after --", () => {
  const command = buildAittyExecCommand(
    {
      command: "codex",
      args: ["resume", "--last"],
      cwd: ".",
      aitty: {
        command: "aitty",
        project: "demo",
        label: "codex",
        theme: "light",
        fontSize: 14,
      },
    },
    { rootDir: "/repo", env: {} },
  );

  expect(command.file).toBe("aitty");
  expect(command.args).toContain("exec");
  expect(command.args).toContain("--launch");
  expect(command.args).toContain("print");
  expect(command.args.slice(-4)).toEqual(["--", "codex", "resume", "--last"]);
});

test("aitty URL parser extracts first printed session URL", () => {
  expect(
    extractAittyUrlFromOutput("noise\nhttp://codex.aitty.localhost:1234/s/p/c?t=token\n"),
  ).toBe("http://codex.aitty.localhost:1234/s/p/c?t=token");
});
