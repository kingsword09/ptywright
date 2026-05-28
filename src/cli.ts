import { cmdAgent } from "./cli/agent";
import { isHelp, usage } from "./cli/common";
import { cmdMcp, cmdMcpHttp } from "./cli/mcp";
import { cmdRun, cmdRunAll, cmdScript } from "./cli/script";
import { cmdPty } from "./pty-cassette/cli";

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const [command, ...rest] = argv;

  if (!command) {
    await cmdMcp([]);
    return;
  }

  if (isHelp(command)) {
    // eslint-disable-next-line no-console
    console.log(usage());
    return;
  }

  if (command === "mcp") {
    await cmdMcp(rest);
    return;
  }

  if (command === "mcp-http") {
    await cmdMcpHttp(rest);
    return;
  }

  if (command === "agent") {
    process.exitCode = await cmdAgent(rest);
    return;
  }

  if (command === "pty") {
    process.exitCode = await cmdPty(rest);
    return;
  }

  if (command === "run") {
    process.exitCode = await cmdRun(rest);
    return;
  }

  if (command === "run-all") {
    process.exitCode = await cmdRunAll(rest);
    return;
  }

  if (command === "script") {
    process.exitCode = await cmdScript(rest);
    return;
  }

  throw new Error(`unknown command: ${command}\n\n` + usage());
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error((error as Error).message);
    process.exitCode = 1;
  }
}
