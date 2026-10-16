import type { GuardedCommand } from '#types/harness';

export const COMMAND_SPECS = {
  reviewRecord: { name: 'review record', skill: 'review', route: 'optional' },
} as const satisfies Record<string, GuardedCommand>;
