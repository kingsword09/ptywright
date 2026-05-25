import { z } from "zod";

export const agentTextMaskRuleSchema = z.object({
  regex: z.string().min(1),
  flags: z.string().optional(),
  replacement: z.string().optional(),
  preserveLength: z.boolean().optional(),
});

export const agentViewportSchema = z.object({
  name: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  deviceScaleFactor: z.number().positive().optional(),
  isMobile: z.boolean().optional(),
  hasTouch: z.boolean().optional(),
});

const agentLaunchModeSchema = z.enum(["command", "url"]);

function inferAgentLaunchMode(value: {
  mode?: "command" | "url";
  url?: string;
}): "command" | "url" {
  if (value.mode) return value.mode;
  if (value.url) return "url";
  return "command";
}

export const agentLaunchSchema = z
  .object({
    mode: agentLaunchModeSchema.optional(),
    agentFlavor: z.enum(["codex", "claude", "droid", "generic"]).optional(),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    cwd: z.string().optional(),
    env: z.record(z.string()).optional(),
    url: z.string().url().optional(),
    urlRegex: z.string().min(1).optional(),
    waitForUrlMs: z.number().int().positive().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    const mode = inferAgentLaunchMode(value);
    if (mode === "url" && !value.url) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "launch.url is required when launch.mode is 'url'",
      });
    }
    if (mode === "command" && !value.command) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "launch.command is required when launch.mode is 'command'",
      });
    }
  });

const waitForTextStepSchema = z
  .object({
    type: z.literal("waitForText"),
    text: z.string().optional(),
    regex: z.string().optional(),
    timeoutMs: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.text && !value.regex) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "waitForText requires text or regex",
      });
    }
  });

const typeTextStepSchema = z.object({
  type: z.literal("typeText"),
  text: z.string(),
  enter: z.boolean().optional(),
  delayMs: z.number().int().nonnegative().optional(),
});

const pressKeyStepSchema = z.object({
  type: z.literal("pressKey"),
  key: z.string().min(1),
});

const clickStepSchema = z
  .object({
    type: z.literal("click"),
    selector: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    x: z.number().int().nonnegative().optional(),
    y: z.number().int().nonnegative().optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.selector && !value.text && (value.x === undefined || value.y === undefined)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "click requires selector, text, or x/y coordinates",
      });
    }
  });

const waitForStableDomStepSchema = z.object({
  type: z.literal("waitForStableDom"),
  timeoutMs: z.number().int().positive().optional(),
  quietMs: z.number().int().positive().optional(),
  intervalMs: z.number().int().positive().optional(),
});

const snapshotStepSchema = z.object({
  type: z.literal("snapshot"),
  name: z.string().min(1),
  compare: z.boolean().optional(),
  targets: z.array(z.enum(["terminal", "dom", "screenshot"])).optional(),
  fullPage: z.boolean().optional(),
});

const markStepSchema = z.object({
  type: z.literal("mark"),
  label: z.string().optional(),
});

const sleepStepSchema = z.object({
  type: z.literal("sleep"),
  ms: z.number().int().nonnegative(),
});

export const agentFlowStepSchema = z.union([
  waitForTextStepSchema,
  typeTextStepSchema,
  pressKeyStepSchema,
  clickStepSchema,
  waitForStableDomStepSchema,
  snapshotStepSchema,
  markStepSchema,
  sleepStepSchema,
]);

export const agentFlowSpecSchema = z.object({
  name: z.string().min(1).optional(),
  artifactsDir: z.string().optional(),
  snapshotDir: z.string().optional(),
  launch: agentLaunchSchema,
  viewports: z.array(agentViewportSchema).min(1).optional(),
  defaults: z
    .object({
      timeoutMs: z.number().int().positive().optional(),
      mask: z.array(agentTextMaskRuleSchema).optional(),
      screenshot: z.boolean().optional(),
    })
    .optional(),
  steps: z.array(agentFlowStepSchema).min(1),
});

export type AgentTextMaskRule = z.infer<typeof agentTextMaskRuleSchema>;
export type AgentViewport = z.infer<typeof agentViewportSchema>;
export type AgentLaunchMode = z.infer<typeof agentLaunchModeSchema>;
export type AgentLaunch = z.infer<typeof agentLaunchSchema>;
export type AgentFlowStep = z.infer<typeof agentFlowStepSchema>;
export type AgentFlowSpec = z.infer<typeof agentFlowSpecSchema>;

export const DEFAULT_AGENT_VIEWPORTS: readonly AgentViewport[] = [
  { name: "desktop-1440", width: 1440, height: 960, deviceScaleFactor: 1 },
];

export function normalizeAgentFlowSpec(input: unknown): AgentFlowSpec {
  const spec = agentFlowSpecSchema.parse(input) as AgentFlowSpec;
  return {
    ...spec,
    name: spec.name ?? "agent-flow",
    viewports: spec.viewports?.length ? spec.viewports : [...DEFAULT_AGENT_VIEWPORTS],
  };
}

export function resolveAgentLaunchMode(launch: AgentLaunch): AgentLaunchMode {
  return inferAgentLaunchMode(launch);
}
