import { escapeAttribute, escapeHtml } from "./html_escape";

type RawAnsiTextStyle = {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strikethrough?: boolean;
};

export function renderRawAnsiTextHtml(input: string): string {
  const out: string[] = [];
  let style: RawAnsiTextStyle = {};
  let segmentStart = 0;
  let index = 0;

  while (index < input.length) {
    if (!isCsiStart(input, index)) {
      index += 1;
      continue;
    }

    const end = findCsiEnd(input, index + 2);
    if (end === -1) {
      index += 1;
      continue;
    }

    out.push(renderAnsiTextSegment(input.slice(segmentStart, index), style));
    if (input[end] === "m") {
      style = applySgrCodes(style, parseSgrCodes(input.slice(index + 2, end)));
    }
    index = end + 1;
    segmentStart = index;
  }

  out.push(renderAnsiTextSegment(input.slice(segmentStart), style));
  return out.join("");
}

function isCsiStart(input: string, index: number): boolean {
  return input.charCodeAt(index) === 0x1b && input[index + 1] === "[";
}

function findCsiEnd(input: string, start: number): number {
  for (let index = start; index < input.length; index += 1) {
    const code = input.charCodeAt(index);
    if (code >= 0x40 && code <= 0x7e) {
      return index;
    }
  }
  return -1;
}

function parseSgrCodes(input: string): number[] {
  if (!input) return [0];
  return input.split(";").map((value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  });
}

function applySgrCodes(current: RawAnsiTextStyle, codes: readonly number[]): RawAnsiTextStyle {
  const next: RawAnsiTextStyle = { ...current };

  for (let index = 0; index < codes.length; index += 1) {
    const code = codes[index] ?? 0;

    if (code === 0) {
      resetStyle(next);
      continue;
    }
    if (code === 1) next.bold = true;
    else if (code === 2) next.dim = true;
    else if (code === 3) next.italic = true;
    else if (code === 4) next.underline = true;
    else if (code === 7) next.inverse = true;
    else if (code === 9) next.strikethrough = true;
    else if (code === 22) {
      next.bold = false;
      next.dim = false;
    } else if (code === 23) next.italic = false;
    else if (code === 24) next.underline = false;
    else if (code === 27) next.inverse = false;
    else if (code === 29) next.strikethrough = false;
    else if (code === 39) next.fg = undefined;
    else if (code === 49) next.bg = undefined;
    else if (code >= 30 && code <= 37) next.fg = ansiPaletteColor(code - 30);
    else if (code >= 90 && code <= 97) next.fg = ansiPaletteColor(code - 90 + 8);
    else if (code >= 40 && code <= 47) next.bg = ansiPaletteColor(code - 40);
    else if (code >= 100 && code <= 107) next.bg = ansiPaletteColor(code - 100 + 8);
    else if ((code === 38 || code === 48) && codes[index + 1] === 5) {
      const color = ansiPaletteColor(codes[index + 2] ?? 0);
      if (code === 38) next.fg = color;
      else next.bg = color;
      index += 2;
    } else if ((code === 38 || code === 48) && codes[index + 1] === 2) {
      const r = clampColor(codes[index + 2] ?? 0);
      const g = clampColor(codes[index + 3] ?? 0);
      const b = clampColor(codes[index + 4] ?? 0);
      const color = `rgb(${r} ${g} ${b})`;
      if (code === 38) next.fg = color;
      else next.bg = color;
      index += 4;
    }
  }

  return next;
}

function resetStyle(style: RawAnsiTextStyle): void {
  style.fg = undefined;
  style.bg = undefined;
  style.bold = false;
  style.dim = false;
  style.italic = false;
  style.underline = false;
  style.inverse = false;
  style.strikethrough = false;
}

function renderAnsiTextSegment(text: string, style: RawAnsiTextStyle): string {
  if (!text) return "";
  const safeText = escapeHtml(text);
  const css = ansiStyleToCss(style);
  return css ? `<span style="${escapeAttribute(css)}">${safeText}</span>` : safeText;
}

function ansiStyleToCss(style: RawAnsiTextStyle): string {
  const decls: string[] = [];
  const fg = style.inverse ? style.bg : style.fg;
  const bg = style.inverse ? style.fg : style.bg;

  if (fg) decls.push(`color: ${fg}`);
  if (bg) decls.push(`background-color: ${bg}`);
  if (style.bold) decls.push("font-weight: 700");
  if (style.italic) decls.push("font-style: italic");
  if (style.dim) decls.push("opacity: 0.72");

  const decorations: string[] = [];
  if (style.underline) decorations.push("underline");
  if (style.strikethrough) decorations.push("line-through");
  if (decorations.length > 0) {
    decls.push(`text-decoration: ${decorations.join(" ")}`);
  }

  return decls.join("; ");
}

function ansiPaletteColor(index: number): string {
  const table16 = [
    "#151b23",
    "#ff7b72",
    "#7ee787",
    "#f2cc60",
    "#79c0ff",
    "#d2a8ff",
    "#70e1e8",
    "#e6edf7",
    "#6e7681",
    "#ffa198",
    "#aff5b4",
    "#ffdf80",
    "#a5d6ff",
    "#e2c5ff",
    "#96f0f5",
    "#ffffff",
  ];

  const normalized = clampColor(index);
  if (normalized < table16.length) return table16[normalized] ?? "#e6edf7";

  if (normalized <= 231) {
    const values = [0, 95, 135, 175, 215, 255];
    const offset = normalized - 16;
    const r = values[Math.trunc(offset / 36) % 6] ?? 0;
    const g = values[Math.trunc(offset / 6) % 6] ?? 0;
    const b = values[offset % 6] ?? 0;
    return `rgb(${r} ${g} ${b})`;
  }

  const gray = clampColor(8 + (normalized - 232) * 10);
  return `rgb(${gray} ${gray} ${gray})`;
}

function clampColor(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(255, Math.trunc(value)));
}
