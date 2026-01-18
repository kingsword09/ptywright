import type { CustomStepHandler } from "../../../src/script/runner";

export const steps: Record<string, CustomStepHandler> = {
  hello: async () => ({ kind: "custom", hash: "custom-ok", text: "custom-ok" }),
};
