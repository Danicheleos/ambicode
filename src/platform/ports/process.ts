import type { EnvironmentPolicy } from '#types/platform/ports';

export function resolveEnvironment(
  policy: EnvironmentPolicy,
  base: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [name, value] of Object.entries(base)) {
    if (value !== undefined) resolved[name] = value;
  }
  return { ...resolved, ...(policy.overrides ?? {}) };
}
