import { readFileSync } from "node:fs";

import { expect, test } from "bun:test";

import { main } from "../src/cli";

test("package check script includes committed agent cassette regression", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8")) as {
    scripts?: Record<string, string>;
  };
  const readme = readFileSync("README.md", "utf8");

  expect(pkg.scripts?.["agent:check"]).toBe("bun run src/cli.ts agent check");
  expect(pkg.scripts?.build).toBe("vp pack");
  expect(pkg.scripts?.test).toBe("bun run scripts/test_all.ts");
  expect(pkg.scripts?.check).toContain("bun run build");
  expect(pkg.scripts?.check).toContain("bun run agent:check");
  expect(pkg.scripts?.check).toContain("bun run test");
  expect(pkg.scripts?.prepublishOnly).toBe("bun run build");
  expect(readme).toContain("bun run test");
  expect(readme).not.toContain("\n# Run tests\nbun test\n");
});

test("CLI help documents summary reruns for replay, check, and promote", async () => {
  const logs: string[] = [];
  const originalLog = console.log;

  try {
    console.log = (...args: unknown[]) => {
      logs.push(args.map((arg) => String(arg)).join(" "));
    };
    await main(["help"]);
  } finally {
    console.log = originalLog;
  }

  const help = logs.join("\n");
  expect(help).toContain("agent rerun <summary>");
  expect(help).toContain("agent commands <artifact>");
  expect(help).toContain("agent inspect <artifact|dir>");
  expect(help).toContain("agent exec <artifact>");
  expect(help).toContain("script commands <summary|dir>");
  expect(help).toContain("script inspect <summary|dir>");
  expect(help).toContain("script exec <summary|dir>");
  expect(help).toContain("script validate <summary|dir>");
  expect(help).toContain("--command <name>");
  expect(help).toContain("agent replay/check/promote summary metadata");
});
