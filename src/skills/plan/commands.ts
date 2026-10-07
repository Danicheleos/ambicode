import type { GuardedCommand } from '#types/harness';

export const COMMAND_SPECS = {
  noteSave: { name: 'note save', skill: 'plan', route: 'optional' },
  notePromote: { name: 'note promote', skill: 'plan', route: 'owned' },
  planCheck: { name: 'plan check', skill: 'plan', route: 'optional' },
  worker: { name: 'worker', skill: 'plan', route: 'optional' },
} as const satisfies Record<string, GuardedCommand>;
