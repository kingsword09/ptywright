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
  const text = await page.evaluate(() => {
    const node = document.querySelector("[data-terminal-root]");
    if (!node) return null;
    const rows = Array.from(node.querySelectorAll(".term-grid .term-row"));
    if (rows.length > 0) {
      return rows.map((row) => row.textContent ?? "").join("\n");
    }
    return node.textContent ?? "";
  });
  if (text === null) {
    throw new Error("terminal root is not attached");
  }
  return text;
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
