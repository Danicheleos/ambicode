import type { GuardedCommand } from '#types/harness';

export const COMMAND_SPECS = {
  initApply: { name: 'init --apply', skill: 'init', route: 'optional' },
  initPropose: { name: 'init propose', skill: 'init', route: 'optional' },
} as const satisfies Record<string, GuardedCommand>;
