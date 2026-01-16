export type TextMaskRule = {
  regex: string;
  flags?: string;
  replacement?: string;
  preserveLength?: boolean;
};

type CompiledMaskRule = {
  regex: RegExp;
  replacement: string;
  preserveLength: boolean;
};

export function applyTextMaskRules(lines: string[], rules?: TextMaskRule[]): string[] {
  if (!rules || rules.length === 0) return lines;

  const compiled = compileMaskRules(rules);
  if (compiled.length === 0) return lines;

  return lines.map((line) => applyCompiledMaskRules(line, compiled));
}

function compileMaskRules(rules: TextMaskRule[]): CompiledMaskRule[] {
  const compiled: CompiledMaskRule[] = [];

  for (const rule of rules) {
    if (!rule.regex.trim()) continue;

    const preserveLength = rule.preserveLength ?? false;
    const replacement = preserveLength
      ? firstChar(rule.replacement)
      : (rule.replacement ?? "<masked>");

    const flags = normalizeFlags(rule.flags);
    let regex: RegExp;
    try {
      regex = new RegExp(rule.regex, flags);
    } catch (error) {
      throw new Error(
        `invalid mask rule regex=${JSON.stringify(rule.regex)} flags=${JSON.stringify(rule.flags ?? "")}: ${(error as Error).message}`,
      );
    }

    compiled.push({ regex, replacement, preserveLength });
  }

  return compiled;
}

function normalizeFlags(flags?: string): string {
  const value = flags?.trim() ? flags.trim() : "g";
  const set = new Set(value.split(""));
  set.add("g");
  return [...set].join("");
}

function firstChar(value?: string): string {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed[0] : "█";
}

function applyCompiledMaskRules(line: string, rules: CompiledMaskRule[]): string {
  let out = line;
  for (const rule of rules) {
    out = out.replace(rule.regex, (match) =>
      rule.preserveLength ? rule.replacement.repeat(match.length) : rule.replacement,
    );
  }
  return out;
}
