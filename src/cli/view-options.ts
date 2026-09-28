/**
 * Kept out of `commands/view.ts`: the dispatcher parses every command's
 * arguments up front, and importing that would load Fastify on every hook.
 */
export const VIEW_OPTIONS = {
  values: ['review'],
  flags: ['json', 'no-open'],
} as const;
