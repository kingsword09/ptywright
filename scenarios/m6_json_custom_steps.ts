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
