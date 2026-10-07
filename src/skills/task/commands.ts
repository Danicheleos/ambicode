import type { GuardedCommand } from '#types/harness';

export const COMMAND_SPECS = {
  check: { name: 'check', skill: 'task', route: 'optional' },
  format: { name: 'format', skill: 'task', route: 'optional' },
} as const satisfies Record<string, GuardedCommand>;
