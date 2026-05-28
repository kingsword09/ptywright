import type { Terminal } from "@xterm/headless";

import { escapeHtml } from "../common/html";
import type { CellStyle, Color } from "../terminal/style";
import { extractStyle, findMeaningfulEndCol, isDefaultStyle, styleKey } from "../terminal/style";
import { clampInt } from "./term_info";

export function renderVisibleRowHtml(
  terminal: Terminal,
  rowIndex: number,
  trimRight: boolean,
): string {
  const buffer = terminal.buffer.active;
  const nullCell = buffer.getNullCell();

  const startY = buffer.viewportY;
  const line = buffer.getLine(startY + rowIndex);
  const endCol = trimRight ? findMeaningfulEndCol(line, terminal.cols, nullCell) : terminal.cols;

  type Segment = { key: string; style: CellStyle; text: string };

  const segments: Segment[] = [];

  let currentKey: string | null = null;
  let currentStyle: CellStyle | null = null;
  let currentText = "";

  const flush = () => {
    if (!currentStyle) return;
    if (currentText.length === 0) return;
    segments.push({
      key: currentKey ?? styleKey(currentStyle),
      style: currentStyle,
      text: currentText,
    });
    currentText = "";
  };

  for (let x = 0; x < endCol; x += 1) {
    const cell = line?.getCell(x, nullCell);
    if (!cell) {
      if (currentStyle) {
        flush();
        currentStyle = null;
        currentKey = null;
      }
      continue;
    }

    const width = cell.getWidth();
    if (width === 0) {
      continue;
    }

    const chars = cell.getChars() || " ";
    const style = extractStyle(cell);
    const key = styleKey(style);

    if (!currentStyle) {
      currentStyle = style;
      currentKey = key;
      currentText = chars;
      continue;
    }

    if (key === currentKey) {
      currentText += chars;
      continue;
    }

    flush();
    currentStyle = style;
    currentKey = key;
    currentText = chars;
  }

  if (currentStyle) {
    flush();
  }

  return segments.map((segment) => renderSegmentHtml(segment.text, segment.style)).join("");
}

function renderSegmentHtml(text: string, style: CellStyle): string {
  const safeText = escapeHtml(text);

  if (isDefaultStyle(style)) {
    return safeText;
  }

  const css = styleToCss(style);
  if (!css) {
    return `<span class="seg">${safeText}</span>`;
  }

  return `<span class="seg" style="${css}">${safeText}</span>`;
}

function styleToCss(style: CellStyle): string {
  let fg = colorToCss(style.fg);
  let bg = colorToCss(style.bg);

  if (style.inverse) {
    const tmp = fg;
    fg = bg;
    bg = tmp;
  }

  const decls: string[] = [];

  if (fg) decls.push(`color: ${fg}`);
  if (bg) decls.push(`background-color: ${bg}`);

  if (style.bold) decls.push("font-weight: 600");
  if (style.italic) decls.push("font-style: italic");
  if (style.dim) decls.push("opacity: 0.75");

  const decorations: string[] = [];
  if (style.underline) decorations.push("underline");
  if (style.strikethrough) decorations.push("line-through");
  if (decorations.length > 0) {
    decls.push(`text-decoration: ${decorations.join(" ")}`);
  }

  return decls.join("; ");
}

function colorToCss(color: Color): string | null {
  if (color.mode === "default") return null;

  if (color.mode === "rgb") {
    const value = color.value & 0xffffff;
    return `#${value.toString(16).padStart(6, "0")}`;
  }

  const idx = clampInt(color.value, 0, 255);
  return xterm256Color(idx);
}

function xterm256Color(idx: number): string {
  const table16 = [
    "#000000",
    "#800000",
    "#008000",
    "#808000",
    "#000080",
    "#800080",
    "#008080",
    "#c0c0c0",
    "#808080",
    "#ff0000",
    "#00ff00",
    "#ffff00",
    "#0000ff",
    "#ff00ff",
    "#00ffff",
    "#ffffff",
  ];

  if (idx < 16) return table16[idx] ?? "#000000";

  if (idx >= 16 && idx <= 231) {
    const c = [0, 95, 135, 175, 215, 255];
    const n = idx - 16;

    const r = c[Math.trunc(n / 36) % 6] ?? 0;
    const g = c[Math.trunc(n / 6) % 6] ?? 0;
    const b = c[n % 6] ?? 0;

    return `rgb(${r} ${g} ${b})`;
  }

  const gray = 8 + (idx - 232) * 10;
  const v = clampInt(gray, 0, 255);
  return `rgb(${v} ${v} ${v})`;
}
