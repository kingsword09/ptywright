import type { CustomStepHandler } from "../src/scenario/runner";

type CustomSteps = {
  assertMaskedEquals: { expected: string };
};

export const steps = {
  assertMaskedEquals: ((ctx, step) => {
    const expected = step.payload?.expected;
    if (expected === undefined) {
      throw new Error("assertMaskedEquals: missing payload.expected");
    }

    const record = ctx.getSnapshot("masked");
    if (record.text.trimEnd() !== expected) {
      throw new Error("assertMaskedEquals failed");
    }
  }) satisfies CustomStepHandler<CustomSteps["assertMaskedEquals"]>,
} satisfies Record<string, CustomStepHandler>;

