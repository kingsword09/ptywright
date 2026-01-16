import type { Terminal } from "@xterm/headless";

export type Color =
  | { mode: "default" }
  | { mode: "palette"; value: number }
  | { mode: "rgb"; value: number };

export type CellStyle = {
  fg: Color;
  bg: Color;
  bold: boolean;
  dim: boolean;
  italic: boolean;
  underline: boolean;
  inverse: boolean;
  strikethrough: boolean;
};

export const DEFAULT_STYLE: CellStyle = {
  fg: { mode: "default" },
  bg: { mode: "default" },
  bold: false,
  dim: false,
  italic: false,
  underline: false,
  inverse: false,
  strikethrough: false,
};

export function extractStyle(
  cell: ReturnType<Terminal["buffer"]["active"]["getNullCell"]>,
): CellStyle {
  const fg = extractColor(
    cell.isFgDefault(),
    cell.isFgPalette(),
    cell.isFgRGB(),
    cell.getFgColor(),
  );
  const bg = extractColor(
    cell.isBgDefault(),
    cell.isBgPalette(),
    cell.isBgRGB(),
    cell.getBgColor(),
  );

  const style: CellStyle = {
    fg,
    bg,
    bold: cell.isBold() !== 0,
    dim: cell.isDim() !== 0,
    italic: cell.isItalic() !== 0,
    underline: cell.isUnderline() !== 0,
    inverse: cell.isInverse() !== 0,
    strikethrough: cell.isStrikethrough() !== 0,
  };

  return isDefaultStyle(style) ? DEFAULT_STYLE : style;
}

export function isDefaultStyle(style: CellStyle): boolean {
  return (
    style.fg.mode === "default" &&
    style.bg.mode === "default" &&
    !style.bold &&
    !style.dim &&
    !style.italic &&
    !style.underline &&
    !style.inverse &&
    !style.strikethrough
  );
}

export function styleKey(style: CellStyle): string {
  const fg = style.fg.mode === "default" ? "d" : `${style.fg.mode}:${style.fg.value}`;
  const bg = style.bg.mode === "default" ? "d" : `${style.bg.mode}:${style.bg.value}`;
  return [
    fg,
    bg,
    style.bold ? "b" : "",
    style.dim ? "d" : "",
    style.italic ? "i" : "",
    style.underline ? "u" : "",
    style.inverse ? "r" : "",
    style.strikethrough ? "s" : "",
  ].join("|");
}

export function findMeaningfulEndCol(
  line: ReturnType<Terminal["buffer"]["active"]["getLine"]>,
  cols: number,
  nullCell: ReturnType<Terminal["buffer"]["active"]["getNullCell"]>,
): number {
  if (!line) return 0;

  for (let x = cols - 1; x >= 0; x -= 1) {
    const cell = line.getCell(x, nullCell);
    if (!cell) continue;
    if (cell.getWidth() === 0) continue;

    const chars = cell.getChars();
    const style = extractStyle(cell);
    const meaningful = (chars !== "" && chars !== " ") || !isDefaultStyle(style);
    if (meaningful) {
      return x + 1;
    }
  }

  return 0;
}

function extractColor(
  isDefault: boolean,
  isPalette: boolean,
  isRgb: boolean,
  value: number,
): Color {
  if (isDefault) return { mode: "default" };
  if (isRgb) return { mode: "rgb", value };
  if (isPalette) return { mode: "palette", value };
  return { mode: "default" };
}
