import type { AsciicastEvent } from "./asciicast";

export type ParsedAsciicast = {
  header: Record<string, unknown>;
  events: AsciicastEvent[];
};

export function parseAsciicast(cast: string): ParsedAsciicast {
  const lines = cast.trimEnd().split("\n");
  const header = safeJsonObject(lines[0]);

  const events: AsciicastEvent[] = [];
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const value = JSON.parse(line) as unknown;
    if (!Array.isArray(value) || value.length < 3) continue;

    const time = Number(value[0]);
    const type = String(value[1]);
    const data = String(value[2]);

    if (!Number.isFinite(time)) continue;

    if (type === "o" || type === "i" || type === "r" || type === "m") {
      events.push([time, type, data] as AsciicastEvent);
    }
  }

  return { header, events };
}

function safeJsonObject(line: string | undefined): Record<string, unknown> {
  if (!line) return {};
  try {
    const value = JSON.parse(line) as unknown;
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
