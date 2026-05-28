import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { z } from "zod";

import { formatZodIssues } from "../common/zod";
import { agentPromoteSummarySchema } from "./promote_summary_schema";
import { AGENT_PROMOTE_SCHEMA_URL, type AgentPromoteSummary } from "./promote_summary_types";
export { defaultAgentPromoteCommands } from "./promote_summary_commands";
export { agentPromoteSummarySchema } from "./promote_summary_schema";
export {
  AGENT_PROMOTE_SCHEMA_URL,
  type AgentPromoteCommandSource,
  type AgentPromoteSummary,
} from "./promote_summary_types";

export function normalizeAgentPromoteSummary(input: unknown): AgentPromoteSummary {
  try {
    const parsed = agentPromoteSummarySchema.parse(input);
    return {
      ...parsed,
      $schema: parsed.$schema ?? AGENT_PROMOTE_SCHEMA_URL,
    };
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`invalid agent promote summary: ${formatZodIssues(error)}`);
    }
    throw error;
  }
}

export function readAgentPromoteSummaryPath(path: string): AgentPromoteSummary {
  return normalizeAgentPromoteSummary(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

export function writeAgentPromoteSummaryPath(path: string, summary: AgentPromoteSummary): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(
    path,
    JSON.stringify(normalizeAgentPromoteSummary(summary), null, 2) + "\n",
    "utf8",
  );
}
