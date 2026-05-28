import { writeFileSync } from "node:fs";
import { basename, dirname, extname, join } from "node:path";

import { ensureAsciinemaPlayerAssets } from "./asciinema_player_assets";

export type TraceReportGenerator = (cast: string) => Promise<string>;

export async function runTraceReportCli(
  argv: string[],
  generateTraceReportHtml: TraceReportGenerator,
): Promise<void> {
  const inputPath = argv[0];
  if (!inputPath) {
    console.error("Usage: bun run src/trace/report.ts <path/to/cast>");
    process.exit(2);
  }

  const cast = await Bun.file(inputPath).text();
  const html = await generateTraceReportHtml(cast);

  const dir = dirname(inputPath);
  const base = basename(inputPath, extname(inputPath));
  const outPath = join(dir, `${base}.report.html`);

  writeFileSync(outPath, html);
  ensureAsciinemaPlayerAssets(outPath);
  // eslint-disable-next-line no-console
  console.log(outPath);
}
