import type { GuardedCommand } from '#types/harness';

export const COMMAND_SPECS = {
  noteSave: { name: 'note save', skill: 'plan', route: 'optional' },
  notePromote: { name: 'note promote', skill: 'plan', route: 'owned' },
} as const satisfies Record<string, GuardedCommand>;
