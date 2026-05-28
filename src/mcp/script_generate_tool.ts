import { z } from "zod";

import { generateTestFromDoc } from "../generator/generate";
import type { ScriptToolRegistration } from "./script_tool_context";
import { toolError } from "./tool_result";

export function registerGenerateTestFromDocTool(args: ScriptToolRegistration): void {
  const { tool } = args;

  tool(
    "script",
    "generate_test_from_doc",
    "Generate test script from documentation (local file or URL). Parses Markdown/HTML/JSON docs to extract test steps and generates executable ptywright scripts.",
    {
      source: z.string().min(1).describe("Document path (local file) or URL"),
      sourceType: z
        .enum(["local", "url", "auto"])
        .optional()
        .describe("Source type (auto-detected if not specified)"),
      outputDir: z.string().optional().describe("Output directory for generated scripts"),
      outputFormat: z
        .enum(["json", "ts", "both"])
        .optional()
        .describe("Output format (default: both)"),
      targetCommand: z
        .string()
        .optional()
        .describe("Command to test (overrides auto-detected command)"),
      targetArgs: z.array(z.string()).optional().describe("Arguments for target command"),
      name: z
        .string()
        .optional()
        .describe("Test name (auto-generated from doc title if not specified)"),
      cols: z.number().int().positive().optional().describe("Terminal columns (default: 80)"),
      rows: z.number().int().positive().optional().describe("Terminal rows (default: 24)"),
    },
    {
      title: "Generate Test from Documentation",
      openWorldHint: true,
      destructiveHint: true,
    },
    async (toolArgs) => {
      try {
        const result = await generateTestFromDoc({
          source: toolArgs.source,
          sourceType: toolArgs.sourceType,
          outputDir: toolArgs.outputDir,
          outputFormat: toolArgs.outputFormat,
          targetCommand: toolArgs.targetCommand,
          targetArgs: toolArgs.targetArgs,
          name: toolArgs.name,
          cols: toolArgs.cols,
          rows: toolArgs.rows,
        });

        if (!result.ok) {
          return toolError(result.error ?? "Failed to generate test", {
            warnings: result.warnings,
            parsed: result.parsed,
          });
        }

        const summaryLines = [
          `Generated test: ${result.name}`,
          `Steps: ${result.stepCount}`,
          result.jsonPath ? `JSON: ${result.jsonPath}` : null,
          result.tsPath ? `TypeScript: ${result.tsPath}` : null,
          result.warnings.length > 0 ? `Warnings: ${result.warnings.join("; ")}` : null,
        ].filter(Boolean);

        return {
          content: [{ type: "text", text: summaryLines.join("\n") }],
          structuredContent: result,
        };
      } catch (error) {
        return toolError((error as Error).message);
      }
    },
  );
}
