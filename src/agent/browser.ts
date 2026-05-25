import { chromium, type Browser } from "playwright";

export async function launchAgentBrowser(args: { headless: boolean }): Promise<Browser> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const browser = await chromium.launch({ headless: args.headless });
      await verifyBrowserLaunch(browser);
      return browser;
    } catch (error) {
      lastError = error;
      if (!isTransientBrowserLaunchError(error) || attempt === 4) {
        throw error;
      }
      await new Promise((resolveRetry) => setTimeout(resolveRetry, 250 * (attempt + 1)));
    }
  }

  throw lastError;
}

async function verifyBrowserLaunch(browser: Browser): Promise<void> {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await page.goto("data:text/html,<title>ptywright</title>", { waitUntil: "load" });
    await page.close();
  } catch (error) {
    await browser.close();
    throw error;
  } finally {
    await context.close().catch(() => undefined);
  }
}

function isTransientBrowserLaunchError(error: unknown): boolean {
  const fields = errorFields(error);
  return (
    fields.message.includes("Failed to connect") ||
    fields.message.includes("Target page, context or browser has been closed") ||
    fields.message.includes("browserType.launch") ||
    fields.code === "ENOENT" ||
    fields.code === "ECONNREFUSED" ||
    fields.syscall === "connect"
  );
}

function errorFields(error: unknown): { message: string; code: string; syscall: string } {
  const record =
    typeof error === "object" && error !== null ? (error as Record<string, unknown>) : {};
  return {
    message: error instanceof Error ? error.message : String(error),
    code: typeof record.code === "string" ? record.code : "",
    syscall: typeof record.syscall === "string" ? record.syscall : "",
  };
}
