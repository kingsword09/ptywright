import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { normalizeAgentFlowSpec, type AgentFlowSpec } from "./schema";

export type LoadedAgentSpec = {
  spec: AgentFlowSpec;
  raw: unknown;
  path: string;
};

export async function loadAgentSpec(specPath: string): Promise<LoadedAgentSpec> {
  const resolved = resolve(process.cwd(), specPath);
  if (resolved.endsWith(".json")) {
    const raw = JSON.parse(readFileSync(resolved, "utf8")) as unknown;
    return {
      spec: normalizeAgentFlowSpec(raw),
      raw,
      path: resolved,
    };
  }

  const mod = (await import(`${pathToFileURL(resolved).href}?t=${Date.now()}`)) as {
    default?: unknown;
    spec?: unknown;
  };
  const raw = mod.default ?? mod.spec;
  return {
    spec: normalizeAgentFlowSpec(raw),
    raw,
    path: resolved,
  };
}
