import type { CustomStepHandler } from "../runner";

export type AssertSnapshotEqualsPayload = {
  expected: string;
};

export function createAssertSnapshotEqualsStep(
  from: string,
): CustomStepHandler<AssertSnapshotEqualsPayload> {
  return (ctx, step) => {
    const expected = step.payload?.expected;
    if (typeof expected !== "string") {
      throw new Error("assertSnapshotEquals: missing payload.expected");
    }

    const record = ctx.getSnapshot(from);
    if (record.text.trimEnd() !== expected) {
      throw new Error("assertSnapshotEquals failed");
    }
  };
}
