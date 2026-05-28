export type TraceTermInfo = {
  cols: number;
  rows: number;
  type: string;
};

export function getTermInfo(header: Record<string, unknown>): TraceTermInfo {
  const version = Number(header.version ?? 2);

  if (version === 3) {
    const term = header.term as { cols?: unknown; rows?: unknown; type?: unknown } | undefined;
    const cols = clampInt(Number(term?.cols ?? 80), 1, 500);
    const rows = clampInt(Number(term?.rows ?? 24), 1, 300);
    const type = typeof term?.type === "string" ? term.type : "xterm-256color";
    return { cols, rows, type };
  }

  const cols = clampInt(Number(header.width ?? 80), 1, 500);
  const rows = clampInt(Number(header.height ?? 24), 1, 300);
  const type = typeof header.term === "string" ? header.term : "xterm-256color";
  return { cols, rows, type };
}

export function parseResize(value: string): { cols: number; rows: number } | null {
  const match = /^\s*(\d+)x(\d+)\s*$/.exec(value);
  if (!match) return null;

  const cols = clampInt(Number(match[1] ?? 0), 1, 500);
  const rows = clampInt(Number(match[2] ?? 0), 1, 300);
  return { cols, rows };
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const int = Math.trunc(value);
  if (int < min) return min;
  if (int > max) return max;
  return int;
}
