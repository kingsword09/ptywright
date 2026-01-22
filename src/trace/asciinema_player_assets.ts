import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

export type EnsureAsciinemaPlayerAssetsResult = {
  ok: boolean;
  copied: boolean;
  cssPath: string;
  jsPath: string;
  error?: string;
};

export function ensureAsciinemaPlayerAssets(reportPath: string): EnsureAsciinemaPlayerAssetsResult {
  const dir = dirname(reportPath);
  const cssPath = join(dir, "asciinema-player.css");
  const jsPath = join(dir, "asciinema-player.min.js");

  const cssExists = existsSync(cssPath);
  const jsExists = existsSync(jsPath);
  if (cssExists && jsExists) {
    return { ok: true, copied: false, cssPath, jsPath };
  }

  try {
    mkdirSync(dir, { recursive: true });

    const require = createRequire(import.meta.url);
    const resolvedCss = require.resolve("asciinema-player/dist/bundle/asciinema-player.css");
    const resolvedJs = require.resolve("asciinema-player/dist/bundle/asciinema-player.min.js");

    if (!cssExists) copyFileSync(resolvedCss, cssPath);
    if (!jsExists) copyFileSync(resolvedJs, jsPath);

    return { ok: true, copied: true, cssPath, jsPath };
  } catch (error) {
    return {
      ok: false,
      copied: false,
      cssPath,
      jsPath,
      error: (error as Error).message,
    };
  }
}
