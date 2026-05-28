export type PtywrightCapability = "core" | "debug" | "script" | "recording" | "all";

export type ResolvedPtywrightCapabilities = {
  all: boolean;
  enabled: Set<Exclude<PtywrightCapability, "all">>;
};

export function resolveCapabilities(
  capabilities: PtywrightCapability[] | undefined,
  envValue: string | undefined,
): ResolvedPtywrightCapabilities {
  const requested = capabilities?.length ? capabilities : parseCapabilitiesEnv(envValue);
  const normalized = new Set<Exclude<PtywrightCapability, "all">>();
  let all = false;

  for (const cap of requested) {
    if (cap === "all") {
      all = true;
      continue;
    }
    normalized.add(cap);
  }

  if (!all && normalized.size === 0) {
    all = true;
  }

  return { all, enabled: normalized };
}

function parseCapabilitiesEnv(envValue: string | undefined): PtywrightCapability[] {
  if (!envValue?.trim()) return [];
  const parts = envValue
    .split(/[,\s]+/g)
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const out: PtywrightCapability[] = [];

  for (const p of parts) {
    if (p === "all") out.push("all");
    else if (p === "core") out.push("core");
    else if (p === "debug") out.push("debug");
    else if (p === "script" || p === "scripts" || p === "runner" || p === "run") out.push("script");
    else if (p === "recording" || p === "record" || p === "rec") out.push("recording");
    else throw new Error(`unknown PTYWRIGHT_CAPS capability: ${p}`);
  }

  return out;
}
