import type { GuardedCommand } from '#types/harness';

export const COMMAND_SPECS = {
  noteSave: { name: 'note save', skill: 'plan', route: 'optional' },
} as const satisfies Record<string, GuardedCommand>;
