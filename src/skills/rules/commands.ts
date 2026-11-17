import type { GuardedCommand } from '#types/harness';

export const COMMAND_SPECS = {
  rulesApply: { name: 'rules apply', skill: 'rules', route: 'optional' },
  policyCheckDrafts: { name: 'policy check --drafts', skill: 'rules', route: 'optional' },
} as const satisfies Record<string, GuardedCommand>;
