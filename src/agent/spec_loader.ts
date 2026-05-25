import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { normalizeAgentFlowSpec, type AgentFlowSpec } from "./schema";

export type LoadedAgentSpec = {
  spec: AgentFlowSpec;
  path: string;
};

export async function loadAgentSpec(specPath: string): Promise<LoadedAgentSpec> {
  const resolved = resolve(process.cwd(), specPath);
  if (resolved.endsWith(".json")) {
    return {
      spec: normalizeAgentFlowSpec(JSON.parse(readFileSync(resolved, "utf8"))),
      path: resolved,
    };
  }

  const mod = (await import(`${pathToFileURL(resolved).href}?t=${Date.now()}`)) as {
    default?: unknown;
    spec?: unknown;
  };
  return {
    spec: normalizeAgentFlowSpec(mod.default ?? mod.spec),
    path: resolved,
  };
}
