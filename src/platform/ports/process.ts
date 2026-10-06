import type { EnvironmentPolicy } from '#types/ports';

export function resolveEnvironment(
  policy: EnvironmentPolicy,
  base: Readonly<Record<string, string | undefined>>,
): Record<string, string> {
  if (policy.kind === 'inherited') {
    const resolved: Record<string, string> = {};
    for (const [name, value] of Object.entries(base)) {
      if (value !== undefined) resolved[name] = value;
    }
    return { ...resolved, ...(policy.overrides ?? {}) };
  }

  const resolved: Record<string, string> = {};
  for (const name of policy.allow) {
    const value = base[name];
    if (value !== undefined) resolved[name] = value;
  }
  return { ...resolved, ...(policy.set ?? {}) };
}
