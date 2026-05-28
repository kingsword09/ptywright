import { basename, extname } from "node:path";

export async function loadJsonScriptFileWithDefaultName(scriptPath: string): Promise<unknown> {
  const raw = await Bun.file(scriptPath).text();
  const parsedJson = JSON.parse(raw) as unknown;
  const baseName = basename(scriptPath, extname(scriptPath));

  return parsedJson &&
    typeof parsedJson === "object" &&
    !Array.isArray(parsedJson) &&
    !("name" in parsedJson)
    ? { ...parsedJson, name: baseName }
    : parsedJson;
}
