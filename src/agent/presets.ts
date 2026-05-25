import type { AgentFlowSpec, AgentTextMaskRule } from "./schema";

export type AgentFlavor = "codex" | "claude" | "droid" | "generic";

const COMMON_AGENT_MASKS: readonly AgentTextMaskRule[] = [
  {
    regex:
      "\\b\\d{4}-\\d{2}-\\d{2}[ T]\\d{2}:\\d{2}:\\d{2}(?:\\.\\d+)?(?:Z|[+-]\\d{2}:?\\d{2})?\\b",
    replacement: "<timestamp>",
  },
  {
    regex: "\\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\b",
    flags: "gi",
    replacement: "<uuid>",
  },
  {
    regex: "\\b(?:req|run|msg|chatcmpl|call|toolu|session)_[A-Za-z0-9_-]{8,}\\b",
    replacement: "<id>",
  },
  {
    regex: "\\b(?:[0-9a-f]{7,40})\\b",
    flags: "gi",
    replacement: "<hex>",
  },
  {
    regex: "\\$\\d+(?:\\.\\d{2,6})?\\b",
    replacement: "$<amount>",
  },
  {
    regex: "\\b(?:\\d+\\.\\d+|\\d+)\\s*(?:s|ms|tokens?|tok)\\b",
    flags: "gi",
    replacement: "<metric>",
  },
];

const FLAVOR_MASKS: Record<AgentFlavor, readonly AgentTextMaskRule[]> = {
  codex: [
    {
      regex: "\\b(?:gpt|o)[A-Za-z0-9._:-]+\\b",
      flags: "gi",
      replacement: "<model>",
    },
    {
      regex: "\\b(?:context|tokens?)\\s*[:=]\\s*[0-9,]+\\b",
      flags: "gi",
      replacement: "<token-count>",
    },
  ],
  claude: [
    {
      regex: "\\bclaude-[A-Za-z0-9._-]+\\b",
      flags: "gi",
      replacement: "<model>",
    },
    {
      regex: "\\b(?:Opus|Sonnet|Haiku)\\s+[0-9.]+\\b",
      flags: "gi",
      replacement: "<model>",
    },
  ],
  droid: [
    {
      regex: "\\bdroidx?-[A-Za-z0-9._-]+\\b",
      flags: "gi",
      replacement: "<droid-id>",
    },
  ],
  generic: [],
};

const DEFAULT_VIEWPORTS = [
  { name: "desktop", width: 1280, height: 820 },
  { name: "mobile", width: 390, height: 844, isMobile: true, hasTouch: true },
] satisfies NonNullable<AgentFlowSpec["viewports"]>;

export function resolveAgentFlavor(spec: AgentFlowSpec): AgentFlavor {
  const explicit = spec.launch.agentFlavor;
  if (explicit) return explicit;

  const command = spec.launch.command?.split(/[\\/]/).at(-1)?.toLowerCase() ?? "";
  if (command === "codex" || command.startsWith("codex-")) return "codex";
  if (command === "claude" || command === "claude-code" || command.startsWith("claude-")) {
    return "claude";
  }
  if (command === "droid" || command === "droidx" || command.startsWith("droid")) return "droid";
  return "generic";
}

export function getAgentMaskPreset(flavor: AgentFlavor): AgentTextMaskRule[] {
  return [...COMMON_AGENT_MASKS, ...FLAVOR_MASKS[flavor]];
}

export function resolveAgentMasks(spec: AgentFlowSpec): AgentTextMaskRule[] {
  const flavor = resolveAgentFlavor(spec);
  return [...getAgentMaskPreset(flavor), ...(spec.defaults?.mask ?? [])];
}

export function createAgentTemplateSpec(flavor: AgentFlavor): AgentFlowSpec {
  const command = flavor === "droid" ? "droidx" : flavor === "generic" ? "agent" : flavor;
  const name = flavor === "generic" ? "agent_browser_smoke" : `${flavor}_browser_smoke`;

  return {
    name,
    artifactsDir: `.tmp/agent/${name}`,
    snapshotDir: `tests/agent-snapshots/${name}`,
    launch: {
      mode: "aitty",
      agentFlavor: flavor,
      command,
      args: [],
      aitty: {
        project: "ptywright",
        label: command,
        title: `${command} browser smoke`,
        subtitle: "browser-hosted terminal agent regression",
        theme: "light",
        fontSize: 14,
        waitForUrlMs: 15_000,
      },
    },
    viewports: DEFAULT_VIEWPORTS.map((viewport) => ({ ...viewport })),
    defaults: {
      timeoutMs: 45_000,
      screenshot: true,
    },
    steps: [
      {
        type: "waitForStableDom",
        timeoutMs: 45_000,
        quietMs: 600,
        intervalMs: 150,
      },
      {
        type: "snapshot",
        name: "launch",
        targets: ["terminal", "dom", "screenshot"],
      },
    ],
  };
}
