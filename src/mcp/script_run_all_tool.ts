import { z } from "zod";

import { runAllScripts } from "../script/run_all";
import type { ScriptToolRegistration } from "./script_tool_context";
import { toolError } from "./tool_result";

export function registerRunAllScriptsTool(args: ScriptToolRegistration): void {
  const { tool } = args;

  tool(
    "script",
    "run_all_scripts",
    "Run all ptywright scripts (JSON/TS) recursively and generate a Playwright-like suite report: index.html + run.summary.json. 用于：一键批量回归 / 生成总览报告 / CI。Call with no args to use defaults (dir='scripts', suite report in .tmp/run-all/). Returns reportPath+summaryPath; open reportPath in a browser to view. Tip: keep includeEntries='failures' (default) and maxEntries to avoid context bloat.",
    {
      dir: z.string().optional(),
      artifactsRoot: z.string().optional(),
      stepsPath: z.string().optional(),
      updateGoldens: z.boolean().optional(),
      includeEntries: z.enum(["none", "failures", "all"]).optional(),
      maxEntries: z.number().int().nonnegative().optional(),
    },
    {
      title: "Run All Scripts (Suite Report)",
      openWorldHint: true,
      destructiveHint: true,
    },
    async (toolArgs) => {
      try {
        const includeEntries = toolArgs.includeEntries ?? "failures";
        const maxEntries = toolArgs.maxEntries ?? 20;

        const result = await runAllScripts({
          dir: toolArgs.dir,
          artifactsRoot: toolArgs.artifactsRoot,
          stepsPath: toolArgs.stepsPath,
          updateGoldens: toolArgs.updateGoldens,
        });

        const failures = result.entries.filter((entry) => !entry.result.ok);
        let entries: typeof result.entries = [];
        if (includeEntries === "all") entries = result.entries;
        else if (includeEntries === "failures") entries = failures;

        let truncatedCount = 0;
        if (entries.length > maxEntries) {
          truncatedCount = entries.length - maxEntries;
          entries = entries.slice(0, maxEntries);
        }

        const summaryLines = [
          result.ok ? "ok" : "failed",
          `count=${result.entries.length}`,
          `failures=${failures.length}`,
          `dir=${result.dir}`,
          `entries=${entries.length}`,
          `report=${result.reportPath}`,
          `summary=${result.summaryPath}`,
          truncatedCount > 0 ? `truncated=${truncatedCount}` : null,
        ];

        if (entries.length > 0 && failures.length > 0) {
          for (const failure of entries) {
            if (failure.result.ok) continue;
            summaryLines.push(`- ${failure.filePath}: ${failure.result.error}`);
          }
        }

        return {
          content: [{ type: "text", text: summaryLines.filter(Boolean).join("\n") }],
          structuredContent: {
            ok: result.ok,
            dir: result.dir,
            suiteDir: result.suiteDir,
            reportPath: result.reportPath,
            summaryPath: result.summaryPath,
            totalCount: result.entries.length,
            failureCount: failures.length,
            includeEntries,
            maxEntries,
            truncatedCount,
            entries,
          },
        };
      } catch (error) {
        return toolError((error as Error).message);
      }
    },
  );
}
