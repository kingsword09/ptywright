import { z } from "zod";

import { assertionScriptStepSchemas } from "./assertion_step_schemas";
import { inputScriptStepSchemas } from "./input_step_schemas";
import { waitScriptStepSchemas } from "./wait_step_schemas";

export { textMaskRuleSchema } from "./text_mask_schema";

export const scriptStepSchema = z.union([
  ...inputScriptStepSchemas,
  ...waitScriptStepSchemas,
  ...assertionScriptStepSchemas,
]);
