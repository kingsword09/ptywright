import { afterAll, beforeAll, expect, test } from "bun:test";
import { chromium, type Browser, type Page } from "playwright";

import { readTerminalLayout, readTerminalText } from "../src/agent/terminal_dom";

let browser: Browser;

beforeAll(async () => {
  browser = await chromium.launch({ headless: true });
});

afterAll(async () => {
  await browser?.close();
});

async function withPage(fn: (page: Page) => Promise<void>): Promise<void> {
  const page = await browser.newPage();

  try {
    await fn(page);
  } finally {
    await page.close();
  }
}

test("readTerminalText preserves visual gaps represented by cell-width spans", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <div data-terminal-root>
        <div class="term-grid">
          <div class="term-row">
            <span style="width: var(--term-cell-width, 1ch);">•</span><span style="width: var(--term-cell-width, 1ch);"></span><span style="width: calc(var(--term-cell-width, 1ch) * 3);">Ran</span><span style="width: var(--term-cell-width, 1ch);"></span><span style="width: calc(var(--term-cell-width, 1ch) * 14);">pnpm typecheck</span><span style="width: calc(var(--term-cell-width, 1ch) * 22);"></span>
          </div>
          <div class="term-row">
            <span style="width: calc(var(--term-cell-width, 1ch) * 4);">pnpm</span><span style="width: var(--term-cell-width, 1ch);"></span><span style="width: calc(var(--term-cell-width, 1ch) * 9);">test:unit</span><span style="width: var(--term-cell-width, 1ch);"></span><span style="width: calc(var(--term-cell-width, 1ch) * 4);">pnpm</span>
          </div>
          <div class="term-row">
            <span class="term-wide" style="width: calc(var(--term-cell-width, 1ch) * 2); overflow: hidden;">测</span><span class="term-wide" style="width: calc(var(--term-cell-width, 1ch) * 2); overflow: hidden;">试</span><span style="width: var(--term-cell-width, 1ch);"></span><span style="width: calc(var(--term-cell-width, 1ch) * 2);">ok</span>
          </div>
        </div>
      </div>
    `);

    await expect(readTerminalText(page)).resolves.toBe(
      ["• Ran pnpm typecheck", "pnpm test:unit pnpm", "测试 ok"].join("\n"),
    );
  });
});

test("readTerminalLayout captures row widths and wide block structure", async () => {
  await withPage(async (page) => {
    await page.setContent(`
      <div data-terminal-root>
        <div class="term-grid" data-cols="10" data-rows="3">
          <div class="term-row" data-aitty-line-cols="10">
            <span style="width: calc(var(--term-cell-width, 1ch) * 2);">ok</span><span style="width: calc(var(--term-cell-width, 1ch) * 8);"></span>
          </div>
          <div class="term-wide-row-block" data-aitty-wide-block="true" data-aitty-wide-block-kind="guttered-code" style="--aitty-wide-block-cols: 32">
            <div class="term-row" data-aitty-line-cols="32">
              <span style="width: calc(var(--term-cell-width, 1ch) * 6);">1 +foo</span><span style="width: calc(var(--term-cell-width, 1ch) * 26);"></span>
            </div>
          </div>
        </div>
      </div>
    `);

    await expect(readTerminalLayout(page)).resolves.toBe(
      [
        "# terminal-layout v1 cols=10 rows=3",
        'row cols=10 text="ok"',
        'wide-block kind="guttered-code" cols=32',
        '  row cols=32 text="1 +foo"',
        "end-wide-block",
      ].join("\n"),
    );
  });
});
