import type { GuardedCommand } from '#types/harness';

export const COMMAND_SPECS = {
  check: { name: 'check', skill: 'task', route: 'optional' },
} as const satisfies Record<string, GuardedCommand>;

/** The implementer is the plugin's own agent, so `subagent_type` is always namespaced (every launch in the eval traces is `ambicode:implementer`). */
export const IMPLEMENTER_AGENT_TYPE = /^ambicode:implementer$/;
