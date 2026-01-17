function parseArgs(argv: string[]): { inPath: string; outPath?: string; stripAnsi: boolean } {
  const out: Partial<{ inPath: string; outPath?: string; stripAnsi: boolean }> = {
    stripAnsi: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (!out.inPath && arg && !arg.startsWith("-")) {
      out.inPath = arg;
      continue;
    }

    if (arg === "--in" && next) {
      out.inPath = next;
      i += 1;
      continue;
    }

    if (arg === "--out" && next) {
      out.outPath = next;
      i += 1;
      continue;
    }

    if (arg === "--strip-ansi") {
      out.stripAnsi = true;
      continue;
    }

    if (arg === "--keep-ansi") {
      out.stripAnsi = false;
      continue;
    }

    throw new Error(`unknown arg: ${arg ?? ""}`);
  }

  if (!out.inPath) throw new Error("missing <castPath> (or --in <path>)");
  return out as { inPath: string; outPath?: string; stripAnsi: boolean };
}

type AsciicastHeader = {
  version?: number;
};

type AsciicastEvent = [timeSeconds: number, type: "o" | "i" | "m" | "r", data: string];

function stripAnsi(text: string): string {
  // CSI: ESC [ ... @-~ (includes SGR, cursor, erase, etc)
  // eslint-disable-next-line no-control-regex
  const csi = /\u001b\[[0-?]*[ -/]*[@-~]/g;
  // OSC: ESC ] ... BEL or ST (ESC \)
  // eslint-disable-next-line no-control-regex
  const osc = /\u001b\][\s\S]*?(?:\u0007|\u001b\\)/g;
  // Two-byte escapes: SS3 (ESC O) + final
  // eslint-disable-next-line no-control-regex
  const ss3 = /\u001bO[@-~]/g;

  return text.replace(osc, "").replace(csi, "").replace(ss3, "");
}

async function run(args: { inPath: string; outPath?: string; stripAnsi: boolean }): Promise<void> {
  const input = await Bun.file(args.inPath).text();
  const lines = input.split("\n").filter((l) => l.length > 0);
  if (lines.length === 0) throw new Error("empty cast");

  let header: AsciicastHeader | null = null;
  try {
    header = JSON.parse(lines[0] ?? "") as AsciicastHeader;
  } catch {
    throw new Error("invalid cast header JSON");
  }

  if (header?.version !== 2) {
    throw new Error(`unsupported asciicast version: ${header?.version ?? "unknown"}`);
  }

  let out = "";
  for (const line of lines.slice(1)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }

    if (!Array.isArray(parsed) || parsed.length < 3) continue;
    const event = parsed as Partial<AsciicastEvent>;
    if (event[1] !== "o") continue;
    if (typeof event[2] !== "string") continue;

    out += event[2];
  }

  const rendered = args.stripAnsi ? stripAnsi(out) : out;

  if (args.outPath) {
    await Bun.write(args.outPath, rendered);
  } else {
    process.stdout.write(rendered);
    if (!rendered.endsWith("\n")) process.stdout.write("\n");
  }
}

if (import.meta.main) {
  try {
    const args = parseArgs(process.argv.slice(2));
    await run(args);
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
