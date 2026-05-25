import { isAbsolute, join, resolve } from "node:path";

import type { PtywrightAgentDefaults, ResolvedPtywrightConfig } from "../config";
import {
  agentFlowSpecSchema,
  normalizeAgentFlowSpec,
  type AgentFlowSpec,
  type AgentTextMaskRule,
  type AgentViewport,
} from "./schema";
import { sanitizeArtifactName } from "./normalize";

export function normalizeAgentFlowSpecWithConfig(
  input: unknown,
  config?: ResolvedPtywrightConfig,
): AgentFlowSpec {
  return normalizeAgentFlowSpec(applyAgentConfigDefaults(agentFlowSpecSchema.parse(input), config));
}

export function applyAgentConfigDefaults(
  input: AgentFlowSpec,
  config?: ResolvedPtywrightConfig,
): AgentFlowSpec {
  const agent = config?.agent;
  if (!agent) return input;

  const name = sanitizeArtifactName(input.name ?? "agent-flow");
  const configDefaults = agent.defaults ?? {};
  const specDefaults = input.defaults ?? {};
  const viewports = input.viewports ? undefined : cloneViewports(configDefaults.viewports);

  return {
    ...input,
    artifactsDir: input.artifactsDir ?? resolveNamedDir(agent.artifactsRoot, name, config.rootDir),
    snapshotDir: input.snapshotDir ?? resolveNamedDir(agent.snapshotDir, name, config.rootDir),
    viewports: viewports ?? input.viewports,
    defaults: {
      ...specDefaults,
      timeoutMs: specDefaults.timeoutMs ?? configDefaults.timeoutMs,
      screenshot: specDefaults.screenshot ?? configDefaults.screenshot,
      mask: mergeMaskRules(configDefaults.mask, specDefaults.mask),
    },
  };
}

function resolveNamedDir(
  root: string | undefined,
  name: string,
  configRoot: string,
): string | undefined {
  if (!root) return undefined;
  const namedDir = join(root, name);
  return isAbsolute(namedDir) ? namedDir : resolve(configRoot, namedDir);
}

function cloneViewports(
  viewports: PtywrightAgentDefaults["viewports"],
): AgentViewport[] | undefined {
  return Array.isArray(viewports) && viewports.length > 0
    ? viewports.map((viewport) => ({ ...viewport }))
    : undefined;
}

function mergeMaskRules(
  configMask: AgentTextMaskRule[] | undefined,
  specMask: AgentTextMaskRule[] | undefined,
): AgentTextMaskRule[] | undefined {
  const merged = [...(configMask ?? []), ...(specMask ?? [])];
  return merged.length > 0 ? merged : undefined;
}
