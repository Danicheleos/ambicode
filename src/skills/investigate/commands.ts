import type { GuardedCommand } from '#types/harness';

export const COMMAND_SPECS = {
  requirementsNormalize: { name: 'requirements normalize', skill: 'investigate', route: 'owned' },
  search: { name: 'search', skill: 'investigate', route: 'optional' },
} as const satisfies Record<string, GuardedCommand>;
