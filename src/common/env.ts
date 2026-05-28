export function envTruthy(value: string | undefined): boolean {
  if (!value?.trim()) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

export function mergeProcessEnv(
  base: Record<string, string>,
  override?: Record<string, string>,
): Record<string, string> {
  const env: Record<string, string> = {};

  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === "string") env[key] = value;
  }

  for (const [key, value] of Object.entries(base)) {
    env[key] = value;
  }

  if (override) {
    for (const [key, value] of Object.entries(override)) {
      env[key] = value;
    }
  }

  return env;
}
