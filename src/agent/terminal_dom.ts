import type { Page } from "playwright";

export async function waitForTerminalRoot(page: Page, timeoutMs: number): Promise<void> {
  await page
    .locator("[data-terminal-root]")
    .first()
    .waitFor({ state: "attached", timeout: timeoutMs });
}

export async function waitForTerminalText(
  page: Page,
  args: { text?: string; regex?: string; timeoutMs: number },
): Promise<void> {
  const started = Date.now();
  const matcher = args.regex ? new RegExp(args.regex) : null;

  while (Date.now() - started < args.timeoutMs) {
    const text = await readTerminalText(page);
    if (args.text && text.includes(args.text)) return;
    if (matcher?.test(text)) return;
    await new Promise((resolvePoll) => setTimeout(resolvePoll, 100));
  }

  throw new Error(`timed out waiting for terminal text ${args.text ?? args.regex ?? ""}`);
}

export async function waitForStableDom(
  page: Page,
  args: { timeoutMs: number; quietMs: number; intervalMs: number },
): Promise<void> {
  const started = Date.now();
  let last = "";
  let stableSince = Date.now();

  while (Date.now() - started < args.timeoutMs) {
    const current = await readTerminalDomIfPresent(page);
    if (current === null) {
      await new Promise((resolvePoll) => setTimeout(resolvePoll, args.intervalMs));
      continue;
    }
    if (current !== last) {
      last = current;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= args.quietMs) {
      return;
    }
    await new Promise((resolvePoll) => setTimeout(resolvePoll, args.intervalMs));
  }

  throw new Error(`timed out waiting for stable terminal DOM`);
}

export async function readTerminalText(page: Page): Promise<string> {
  const text = await readTerminalProjection(page, "text");
  if (text === null) {
    throw new Error("terminal root is not attached");
  }
  return text;
}

export async function readTerminalLayout(page: Page): Promise<string> {
  const layout = await readTerminalProjection(page, "layout");
  if (layout === null) {
    throw new Error("terminal root is not attached");
  }
  return layout;
}

async function readTerminalProjection(page: Page, mode: "layout" | "text"): Promise<string | null> {
  return page.evaluate((projectionMode) => {
    const node = document.querySelector("[data-terminal-root]");
    if (!node) return null;
    const rows = Array.from(node.querySelectorAll(".term-grid .term-row"));
    if (projectionMode === "text") {
      if (rows.length > 0) {
        return rows.map((row) => serializeTerminalRowText(row)).join("\n");
      }
      return node.textContent ?? "";
    }

    return serializeTerminalLayout(node);

    function serializeTerminalLayout(root: Element): string {
      const grid = root.querySelector(".term-grid");
      const target = grid ?? root;
      const lines = [
        `# terminal-layout v1 cols=${readElementInteger(grid, "data-cols") ?? "unknown"} rows=${
          readElementInteger(grid, "data-rows") ?? "unknown"
        }`,
      ];

      for (const child of Array.from(target.children)) {
        serializeTerminalLayoutElement(child, "", lines);
      }

      return lines.join("\n");
    }

    function serializeTerminalLayoutElement(
      element: Element,
      indent: string,
      lines: string[],
    ): void {
      if (element.classList.contains("term-wide-row-block")) {
        lines.push(
          `${indent}wide-block kind=${JSON.stringify(readWideBlockKind(element))} cols=${
            readWideBlockCols(element) ?? "unknown"
          }`,
        );

        for (const child of Array.from(element.children)) {
          serializeTerminalLayoutElement(child, `${indent}  `, lines);
        }

        lines.push(`${indent}end-wide-block`);
        return;
      }

      if (element.classList.contains("term-row")) {
        lines.push(
          `${indent}row cols=${readElementInteger(element, "data-aitty-line-cols") ?? "unknown"} text=${JSON.stringify(
            serializeTerminalRowText(element),
          )}`,
        );
        return;
      }

      for (const child of Array.from(element.children)) {
        serializeTerminalLayoutElement(child, indent, lines);
      }
    }

    function readWideBlockKind(element: Element): string {
      if (!(element instanceof HTMLElement)) {
        return "wide";
      }

      return element.dataset.aittyWideBlockKind || "wide";
    }

    function readWideBlockCols(element: Element): number | null {
      if (!(element instanceof HTMLElement)) {
        return null;
      }

      const styleCols = element.style.getPropertyValue("--aitty-wide-block-cols").trim();
      const cols = Number.parseInt(styleCols, 10);

      return Number.isFinite(cols) && cols > 0 ? cols : null;
    }

    function readElementInteger(element: Element | null, attribute: string): number | null {
      const raw = element?.getAttribute(attribute) ?? "";
      const value = Number.parseInt(raw, 10);

      return Number.isFinite(value) && value >= 0 ? value : null;
    }

    function serializeTerminalRowText(row: Element): string {
      let text = "";

      for (const child of Array.from(row.childNodes)) {
        text += serializeTerminalNodeText(child);
      }

      return text.trimEnd();
    }

    function serializeTerminalNodeText(node: Node): string {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = normalizeTerminalTextSegment(node.textContent ?? "");

        return text.trim().length === 0 ? "" : text;
      }

      if (!(node instanceof HTMLElement)) {
        return "";
      }

      const text = normalizeTerminalTextSegment(node.textContent ?? "");
      const cols = parseTerminalCellWidth(node);

      if (cols === null) {
        return text;
      }

      const width = terminalTextDisplayWidth(text);
      const padding = Math.max(0, cols - width);

      return text + " ".repeat(padding);
    }

    function normalizeTerminalTextSegment(text: string): string {
      return text.replace(/\u00a0/g, " ");
    }

    function parseTerminalCellWidth(element: HTMLElement): number | null {
      const width = element.style.getPropertyValue("width");

      if (/^var\(--term-cell-width\b/.test(width)) {
        return 1;
      }

      const calcMatch = /calc\(\s*var\(--term-cell-width[^)]*\)\s*\*\s*(\d+(?:\.\d+)?)\s*\)/.exec(
        width,
      );

      if (!calcMatch) {
        return null;
      }

      const cols = Number.parseFloat(calcMatch[1] ?? "");

      return Number.isFinite(cols) && cols > 0 ? Math.round(cols) : null;
    }

    function terminalTextDisplayWidth(text: string): number {
      let width = 0;

      for (const char of text) {
        if (/[\u0300-\u036f]/u.test(char)) {
          continue;
        }

        width += isWideTerminalChar(char) ? 2 : 1;
      }

      return width;
    }

    function isWideTerminalChar(char: string): boolean {
      return (
        /[\u1100-\u115f\u2329\u232a\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe19\ufe30-\ufe6f\uff00-\uff60\uffe0-\uffe6]/u.test(
          char,
        ) || /\p{Extended_Pictographic}/u.test(char)
      );
    }
  }, mode);
}

export async function readTerminalDom(page: Page): Promise<string> {
  const dom = await readTerminalDomIfPresent(page);
  if (dom === null) {
    throw new Error("terminal root is not attached");
  }
  return dom;
}

async function readTerminalDomIfPresent(page: Page): Promise<string | null> {
  return page.evaluate(() => document.querySelector("[data-terminal-root]")?.innerHTML ?? null);
}
