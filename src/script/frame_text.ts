export function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function normalizeLineWidth(line: string, cols: number, trimRight: boolean): string {
  const clipped = line.length > cols ? line.slice(0, cols) : line;
  return trimRight ? clipped.trimEnd() : clipped.padEnd(cols, " ");
}

export function trimBottomEmptyLines(lines: string[]): string[] {
  let end = lines.length;
  while (end > 0 && (lines[end - 1] ?? "").trim() === "") {
    end -= 1;
  }
  return lines.slice(0, end);
}

export function sliceLines(
  lines: string[],
  options?: { maxLines?: number; tailLines?: number },
): string[] {
  if (options?.maxLines !== undefined) {
    return lines.slice(0, Math.max(0, Math.trunc(options.maxLines)));
  }
  if (options?.tailLines !== undefined) {
    const tail = Math.max(0, Math.trunc(options.tailLines));
    return lines.slice(Math.max(0, lines.length - tail));
  }
  return lines;
}

export function inferCols(frames: readonly string[]): number {
  const max = frames.reduce((acc, frame) => {
    const lines = normalizeNewlines(frame).split("\n");
    return Math.max(acc, ...lines.map((line) => line.length));
  }, 0);
  return clampInt(max || 80, 1, 500);
}

export function inferRows(frames: readonly string[]): number {
  const max = frames.reduce((acc, frame) => {
    return Math.max(acc, normalizeNewlines(frame).split("\n").length);
  }, 0);
  return clampInt(max || 24, 1, 300);
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  const int = Math.trunc(value);
  if (int < min) return min;
  if (int > max) return max;
  return int;
}
