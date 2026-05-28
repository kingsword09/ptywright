import { z } from "zod";

import { runScriptPath } from "../script/path";
import type { ScriptToolRegistration } from "./script_tool_context";
import { toolError } from "./tool_result";

export function registerRunScriptTool(args: ScriptToolRegistration): void {
  const { tool } = args;

  tool(
    "script",
    "run_script",
    "Run a JSON/TS script via the runner and return artifact paths (prefer this for regression runs).",
    {
      scriptPath: z.string().min(1),
      artifactsDir: z.string().optional(),
      stepsPath: z.string().optional(),
      updateGoldens: z.boolean().optional(),
    },
    {
      title: "Run Script",
      openWorldHint: true,
      destructiveHint: true,
    },
    async (toolArgs) => {
      const result = await runScriptPath(toolArgs.scriptPath, {
        artifactsDir: toolArgs.artifactsDir,
        stepsPath: toolArgs.stepsPath,
        updateGoldens: toolArgs.updateGoldens,
      });

      if (!result.ok) {
        return toolError(result.error, {
          scriptName: result.scriptName,
          artifactsDir: result.artifactsDir,
          castPath: result.castPath,
          reportPath: result.reportPath,
          failureArtifacts: result.failureArtifacts,
        });
      }

      return {
        content: [{ type: "text", text: `ok artifacts=${result.artifactsDir}` }],
        structuredContent: result,
      };
    },
  );
}
