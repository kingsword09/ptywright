import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import type { CustomStepHandler } from "./runner";

function extractStepHandlers(
  mod: Record<string, unknown>,
): Record<string, CustomStepHandler> | undefined {
  return (mod.steps ?? mod.customSteps ?? mod.stepHandlers) as
    | Record<string, CustomStepHandler>
    | undefined;
}

export async function loadScriptModule(modulePath: string): Promise<{
  script: unknown;
  steps?: Record<string, CustomStepHandler>;
}> {
  const absPath = resolve(process.cwd(), modulePath);
  const mod = (await import(pathToFileURL(absPath).href)) as Record<string, unknown>;

  const script = mod.default ?? mod.script;
  if (!script) {
    throw new Error(`script module must export default or 'script': ${modulePath}`);
  }

  const steps = extractStepHandlers(mod);

  return { script, steps };
}

export async function loadStepHandlersModule(modulePath: string): Promise<{
  steps: Record<string, CustomStepHandler>;
}> {
  const absPath = resolve(process.cwd(), modulePath);
  const mod = (await import(pathToFileURL(absPath).href)) as Record<string, unknown>;
  const steps = extractStepHandlers(mod);
  if (!steps) {
    throw new Error(
      `steps module must export 'steps' (or customSteps/stepHandlers): ${modulePath}`,
    );
  }
  return { steps };
}
