import type { AgentTextMaskRule } from "./schema";

export function applyAgentMasks(input: string, rules: readonly AgentTextMaskRule[] = []): string {
  let out = input;

  for (const rule of rules) {
    const flags = rule.flags ?? "g";
    const regex = new RegExp(rule.regex, flags.includes("g") ? flags : `${flags}g`);
    const replacement = rule.replacement ?? "<masked>";

    out = out.replace(regex, (match: string) => {
      if (!rule.preserveLength) {
        return replacement;
      }

      if (replacement.length === match.length) {
        return replacement;
      }

      if (replacement.length > match.length) {
        return replacement.slice(0, match.length);
      }

      return replacement + "*".repeat(match.length - replacement.length);
    });
  }

  return out;
}

export function normalizeTerminalText(
  input: string,
  rules: readonly AgentTextMaskRule[] = [],
): string {
  const lines = applyAgentMasks(input.replace(/\r\n?/g, "\n"), rules)
    .split("\n")
    .map((line) => line.trimEnd());

  while (lines[0]?.trim() === "") {
    lines.shift();
  }

  while (lines.at(-1)?.trim() === "") {
    lines.pop();
  }

  return lines.join("\n");
}

export function normalizeDomSnapshot(
  input: string,
  rules: readonly AgentTextMaskRule[] = [],
): string {
  const stable = input
    .replace(/\sdata-v-[a-z0-9-]+="[^"]*"/g, "")
    .replace(/\sstyle="[^"]*--term-(?:cell-width|row-height):[^"]*"/g, "")
    .replace(/\s+/g, " ")
    .replace(/>\s+</g, "><")
    .replace(
      /<div class="[^"]*\bterm-row\b[^"]*\bterm-scrollback-row\b[^"]*"[^>]*><span[^>]*><\/span><\/div>/g,
      "",
    )
    .trim();

  return applyAgentMasks(stable, rules);
}

export function sanitizeArtifactName(input: string): string {
  const value = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return value || "artifact";
}

export function shortHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}
