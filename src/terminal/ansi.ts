import type { Terminal } from "@xterm/headless";

import type { SnapshotScope } from "./snapshot";
import type { CellStyle } from "./style";
import {
  DEFAULT_STYLE,
  extractStyle,
  findMeaningfulEndCol,
  isDefaultStyle,
  styleKey,
} from "./style";

export type AnsiRenderedLine = {
  ansi: string;
  plain: string;
  hasStyle: boolean;
};

export type SnapshotAnsiOptions = {
  scope?: SnapshotScope;
  trimRight?: boolean;
};

const ESC = "\x1b";
const SGR_RESET = `${ESC}[0m`;

export function renderAnsiLines(
  terminal: Terminal,
  options?: SnapshotAnsiOptions,
): AnsiRenderedLine[] {
  const scope = options?.scope ?? "visible";
  const trimRight = options?.trimRight ?? false;

  const buffer = terminal.buffer.active;
  const nullCell = buffer.getNullCell();

  let startY = 0;
  let count = buffer.length;
  if (scope === "visible") {
    startY = buffer.viewportY;
    count = terminal.rows;
  }

  const out: AnsiRenderedLine[] = [];
  for (let i = 0; i < count; i += 1) {
    const y = startY + i;
    const line = buffer.getLine(y);
    out.push(renderLine(line, terminal.cols, nullCell, trimRight));
  }

  return out;
}

function renderLine(
  line: ReturnType<Terminal["buffer"]["active"]["getLine"]>,
  cols: number,
  nullCell: ReturnType<Terminal["buffer"]["active"]["getNullCell"]>,
  trimRight: boolean,
): AnsiRenderedLine {
  let endCol = cols;
  if (trimRight) {
    endCol = findMeaningfulEndCol(line, cols, nullCell);
  }

  let ansi = "";
  let plain = "";
  let hasStyle = false;
  let usedSgr = false;

  const defaultKey = styleKey(DEFAULT_STYLE);
  let currentKey = defaultKey;
  for (let x = 0; x < endCol; x += 1) {
    const cell = line?.getCell(x, nullCell);
    if (!cell) {
      plain += " ";
      ansi += " ";
      continue;
    }

    const width = cell.getWidth();
    if (width === 0) {
      continue;
    }

    const chars = cell.getChars() || " ";
    const style = extractStyle(cell);
    const isDefault = isDefaultStyle(style);
    if (!isDefault) {
      hasStyle = true;
    }

    const key = styleKey(style);
    if (key !== currentKey) {
      ansi += isDefault ? SGR_RESET : toSgr(style);
      usedSgr = true;
      currentKey = key;
    }

    ansi += chars;
    plain += chars;
  }

  if (usedSgr && currentKey !== defaultKey) {
    ansi += SGR_RESET;
  }

  return { ansi, plain, hasStyle };
}

function toSgr(style: CellStyle): string {
  const codes: string[] = ["0"];

  if (style.bold) codes.push("1");
  if (style.dim) codes.push("2");
  if (style.italic) codes.push("3");
  if (style.underline) codes.push("4");
  if (style.inverse) codes.push("7");
  if (style.strikethrough) codes.push("9");

  if (style.fg.mode === "palette") {
    codes.push(`38;5;${style.fg.value}`);
  } else if (style.fg.mode === "rgb") {
    const [r, g, b] = rgb(style.fg.value);
    codes.push(`38;2;${r};${g};${b}`);
  }

  if (style.bg.mode === "palette") {
    codes.push(`48;5;${style.bg.value}`);
  } else if (style.bg.mode === "rgb") {
    const [r, g, b] = rgb(style.bg.value);
    codes.push(`48;2;${r};${g};${b}`);
  }

  return `${ESC}[${codes.join(";")}m`;
}

function rgb(value: number): [number, number, number] {
  const r = (value >> 16) & 0xff;
  const g = (value >> 8) & 0xff;
  const b = value & 0xff;
  return [r, g, b];
}
