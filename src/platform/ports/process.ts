import type { EnvironmentPolicy, ProcessOutcome } from '#types/platform/ports';

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

export type OutcomeFailure = 'spawn-failed' | 'timed-out' | 'truncated' | 'nonzero-exit';

/** What went wrong first, in this precedence; null for a complete, zero exit. */
export function outcomeFailure(outcome: ProcessOutcome): OutcomeFailure | null {
  if (outcome.kind === 'spawn-failed' || outcome.kind === 'timed-out') return outcome.kind;
  if (outcome.truncated) return 'truncated';
  return outcome.exitCode !== 0 && outcome.kind !== 'detached' ? 'nonzero-exit' : null;
}

/** The predicate for a "<program> …" message: `could not be started (…)`, `timed out`, `exited with N`. */
export function describeOutcome(outcome: ProcessOutcome): string {
  switch (outcomeFailure(outcome)) {
    case 'spawn-failed':
      return `could not be started (${outcome.failure ?? 'unknown'})`;
    case 'timed-out':
      return 'timed out';
    case 'truncated':
      return 'produced more output than AMBICODE reads';
    default:
      return `exited with ${String(outcome.exitCode)}`;
  }
}
