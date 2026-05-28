import { readFileSync } from "node:fs";

import { z } from "zod";

import { shortHash } from "./normalize";
import {
  agentFlowSpecSchema,
  agentViewportSchema,
  normalizeAgentFlowSpec,
  type AgentFlowSpec,
} from "./schema";

export const AGENT_CASSETTE_SCHEMA_URL =
  "https://ptywright.local/schemas/ptywright-agent-cassette.schema.json";

export const agentCassetteFrameSchema = z.object({
  viewport: agentViewportSchema,
  phase: z.number().int().nonnegative(),
  stepIndex: z.number().int().nonnegative().nullable(),
  stepType: z.string().min(1),
  terminalText: z.string(),
  terminalHash: z.string().min(1),
  dom: z.string(),
  domHash: z.string().min(1),
  capturedAt: z.string().min(1),
});

export const agentCassetteSchema = z.object({
  $schema: z.string().optional(),
  version: z.literal(1),
  name: z.string().min(1),
  createdAt: z.string().min(1),
  spec: agentFlowSpecSchema.optional(),
  frames: z.array(agentCassetteFrameSchema).min(1),
});

export type AgentCassetteFrame = z.infer<typeof agentCassetteFrameSchema>;

export type AgentCassette = Omit<z.infer<typeof agentCassetteSchema>, "spec" | "frames"> & {
  spec: AgentFlowSpec;
  frames: AgentCassetteFrame[];
};

export type MutableAgentCassette = Omit<AgentCassette, "frames"> & {
  frames: AgentCassetteFrame[];
};

export type AgentCassetteFrameDraft = Omit<AgentCassetteFrame, "terminalHash" | "domHash">;

export type RawAgentCassette = {
  $schema?: string;
  version: 1;
  name: string;
  createdAt: string;
  spec?: unknown;
  frames: unknown[];
};

export { startAgentCassetteServer } from "./cassette_server";
export type { AgentCassetteServer } from "./cassette_server";

export function createAgentCassette(name: string, spec: AgentFlowSpec): MutableAgentCassette {
  return {
    $schema: AGENT_CASSETTE_SCHEMA_URL,
    version: 1,
    name,
    createdAt: new Date().toISOString(),
    spec: normalizeAgentFlowSpec(spec),
    frames: [],
  };
}

export function normalizeAgentCassette(
  input: unknown,
  fallbackSpec?: AgentFlowSpec,
): AgentCassette {
  const parsed = agentCassetteSchema.parse(input);
  const specInput = parsed.spec ?? fallbackSpec;
  if (!specInput) {
    throw new Error("invalid agent cassette: missing spec");
  }
  validateCassetteFrameHashes(parsed.frames);

  return {
    ...parsed,
    $schema: parsed.$schema ?? AGENT_CASSETTE_SCHEMA_URL,
    spec: normalizeAgentFlowSpec(specInput),
  };
}

function validateCassetteFrameHashes(frames: readonly AgentCassetteFrame[]): void {
  for (const frame of frames) {
    const terminalHash = shortHash(frame.terminalText);
    if (terminalHash !== frame.terminalHash) {
      throw new Error(
        `invalid agent cassette: terminal hash mismatch viewport=${frame.viewport.name} phase=${frame.phase}`,
      );
    }

    const domHash = shortHash(frame.dom);
    if (domHash !== frame.domHash) {
      throw new Error(
        `invalid agent cassette: dom hash mismatch viewport=${frame.viewport.name} phase=${frame.phase}`,
      );
    }
  }
}

export function readAgentCassettePath(path: string, fallbackSpec?: AgentFlowSpec): AgentCassette {
  return normalizeAgentCassette(JSON.parse(readFileSync(path, "utf8")), fallbackSpec);
}

export function isAgentCassetteLike(input: unknown): input is RawAgentCassette {
  return (
    typeof input === "object" &&
    input !== null &&
    (input as { version?: unknown }).version === 1 &&
    Array.isArray((input as { frames?: unknown }).frames)
  );
}

export function upsertAgentCassetteFrame(
  cassette: MutableAgentCassette,
  frame: AgentCassetteFrameDraft,
): void {
  const next = {
    ...frame,
    terminalHash: shortHash(frame.terminalText),
    domHash: shortHash(frame.dom),
  };
  const index = cassette.frames.findIndex(
    (candidate) => candidate.viewport.name === next.viewport.name && candidate.phase === next.phase,
  );

  if (index >= 0) {
    cassette.frames[index] = next;
    return;
  }

  cassette.frames.push(next);
}
