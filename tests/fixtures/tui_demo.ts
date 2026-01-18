export {};

const ESC = "\x1b";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function padRight(text: string, width: number): string {
  if (text.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}

function move(row: number, col: number): string {
  return `${ESC}[${row};${col}H`;
}

function clear(): string {
  return `${ESC}[H${ESC}[2J`;
}

function enterAltScreen(): string {
  return `${ESC}[?1049h`;
}

function exitAltScreen(): string {
  return `${ESC}[?1049l`;
}

function hideCursor(): string {
  return `${ESC}[?25l`;
}

function showCursor(): string {
  return `${ESC}[?25h`;
}

function resetStyle(): string {
  return `${ESC}[0m`;
}

function inverse(on: boolean): string {
  return on ? `${ESC}[7m` : resetStyle();
}

function fg(color: "cyan" | "green" | "yellow" | "magenta" | "white"): string {
  const code =
    color === "cyan"
      ? 36
      : color === "green"
        ? 32
        : color === "yellow"
          ? 33
          : color === "magenta"
            ? 35
            : 37;
  return `${ESC}[${code}m`;
}

function bg256(idx: number): string {
  const safe = Math.max(0, Math.min(255, Math.trunc(idx)));
  return `${ESC}[48;5;${safe}m`;
}

function drawLineWithBorder(cols: number, left: string, fill: string, right: string): string {
  const inner = Math.max(0, cols - 2);
  return `${left}${fill.repeat(inner)}${right}`;
}

type AppState = {
  cols: number;
  rows: number;
  selected: number;
  mode: "HIGH" | "LOW";
};

const menu = ["Dashboard", "Permissions", "Logs"];

function render(state: AppState): string {
  const { cols, rows, selected, mode } = state;
  const out: string[] = [];

  out.push(clear());

  // Border
  out.push(move(1, 1));
  out.push(drawLineWithBorder(cols, "┌", "─", "┐"));

  for (let r = 2; r <= rows - 1; r += 1) {
    out.push(move(r, 1));
    out.push("│" + " ".repeat(Math.max(0, cols - 2)) + "│");
  }

  out.push(move(rows, 1));
  out.push(drawLineWithBorder(cols, "└", "─", "┘"));

  // Title bar
  const title = "PTYWRIGHT TUI DEMO";
  out.push(move(2, 3));
  out.push(fg("cyan") + title + resetStyle());

  // Menu
  out.push(move(4, 3));
  out.push(fg("magenta") + "Menu" + resetStyle());

  for (let i = 0; i < menu.length; i += 1) {
    const label = menu[i] ?? "";
    const prefix = i === selected ? "> " : "  ";
    out.push(move(6 + i, 3));
    out.push(inverse(i === selected) + padRight(prefix + label, 20) + resetStyle());
  }

  // Content panel
  const active = menu[selected] ?? "";
  out.push(move(4, 26));
  out.push(fg("magenta") + "Details" + resetStyle());

  out.push(move(6, 26));
  out.push(`Screen: ${active}`);

  out.push(move(7, 26));
  out.push(`Mode: ${mode}`);

  out.push(move(9, 26));
  out.push(fg("yellow") + "Keys:" + resetStyle());

  out.push(move(10, 26));
  out.push("↑/↓ select  Enter toggle  q quit");

  // Status bar
  const status = ` status: ok  selected=${active.toLowerCase()}  mode=${mode.toLowerCase()} `;
  out.push(move(rows - 1, 2));
  out.push(bg256(25) + fg("white") + padRight(status, Math.max(0, cols - 3)) + resetStyle());

  return out.join("");
}

function decodeKey(data: string | Uint8Array): string {
  const s = typeof data === "string" ? data : Buffer.from(data).toString("utf8");
  if (s === "\x03") return "CTRL_C";
  if (s === "q" || s === "Q") return "Q";
  if (s === "\r" || s === "\n") return "ENTER";
  if (s === "\x1b[A") return "UP";
  if (s === "\x1b[B") return "DOWN";
  return "UNKNOWN";
}

function clampInt(v: number, min: number, max: number): number {
  const n = Math.trunc(v);
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

let state: AppState = {
  cols: clampInt(process.stdout.columns ?? 70, 20, 200),
  rows: clampInt(process.stdout.rows ?? 18, 8, 80),
  selected: 0,
  mode: "HIGH",
};

function cleanupAndExit(code: number): void {
  try {
    process.stdout.write(resetStyle() + showCursor() + exitAltScreen());
  } catch {
    // ignore
  }
  process.exit(code);
}

process.stdout.write(enterAltScreen() + hideCursor());
process.stdout.write(render(state));

// Give the runner a stable point for the first mark.
await sleep(20);

if (process.stdin.isTTY) {
  process.stdin.setRawMode(true);
}
process.stdin.resume();

process.stdin.on("data", (data) => {
  const key = decodeKey(data);

  if (key === "CTRL_C" || key === "Q") {
    cleanupAndExit(0);
    return;
  }

  if (key === "UP") {
    state = { ...state, selected: (state.selected - 1 + menu.length) % menu.length };
    process.stdout.write(render(state));
    return;
  }

  if (key === "DOWN") {
    state = { ...state, selected: (state.selected + 1) % menu.length };
    process.stdout.write(render(state));
    return;
  }

  if (key === "ENTER") {
    state = { ...state, mode: state.mode === "HIGH" ? "LOW" : "HIGH" };
    process.stdout.write(render(state));
  }
});

process.on("SIGTERM", () => cleanupAndExit(143));
process.on("SIGINT", () => cleanupAndExit(130));
process.on("exit", () => {
  try {
    process.stdout.write(resetStyle() + showCursor() + exitAltScreen());
  } catch {
    // ignore
  }
});
