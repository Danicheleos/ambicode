import type { GuardedCommand } from '#types/harness';

export const COMMAND_SPECS = {
  review: { name: 'review', skill: 'review', route: 'optional' },
} as const satisfies Record<string, GuardedCommand>;
