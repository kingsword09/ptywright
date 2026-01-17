import { defineScenario, ScenarioBuilder } from "../src/scenario/dsl";
import { createAssertSnapshotEqualsStep } from "../src/scenario/steps";
import type { CustomStepHandler } from "../src/scenario/runner";

type CustomSteps = {
  assertMaskedEquals: { expected: string };
};

export const steps = {
  assertMaskedEquals: createAssertSnapshotEqualsStep("masked") satisfies CustomStepHandler<
    CustomSteps["assertMaskedEquals"]
  >,
} satisfies Record<string, CustomStepHandler>;

export default defineScenario(() =>
  new ScenarioBuilder<never, CustomSteps>({
    name: "m6_dsl_demo",
    launch: {
      command: "bun",
      args: ["run", "tests/fixtures/random_token_demo.ts"],
      cwd: ".",
      cols: 60,
      rows: 8,
      name: "xterm-256color",
    },
    trace: {
      saveCast: true,
      saveReport: true,
      reportScope: "visible",
      reportMaxFrames: 80,
    },
  })
    .waitForText({
      scope: "visible",
      text: "DONE",
      timeoutMs: 5000,
      intervalMs: 50,
    })
    .snapshotText({
      scope: "visible",
      trimRight: true,
      trimBottom: true,
      mask: [
        {
          regex: "TOKEN: [0-9a-f-]+",
          flags: "i",
          replacement: "TOKEN: <id>",
        },
      ],
      saveAs: "masked",
      saveTo: "masked.txt",
    })
    .custom("assertMaskedEquals", { expected: "TOKEN: <id>\nDONE" }),
);
