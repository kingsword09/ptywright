import { createAssertSnapshotEqualsStep } from "../src/script/steps";
import type { CustomStepHandler } from "../src/script/runner";

type CustomSteps = {
  assertMaskedEquals: { expected: string };
};

export const steps = {
  assertMaskedEquals: createAssertSnapshotEqualsStep("masked") satisfies CustomStepHandler<
    CustomSteps["assertMaskedEquals"]
  >,
} satisfies Record<string, CustomStepHandler>;
