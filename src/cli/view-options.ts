/**
 * `view`'s options, apart from the command. The dispatcher parses every
 * command's arguments up front, and importing `commands/view.ts` for this would
 * load the page server — Fastify and its plugins, 1.5 MB of the bundle — on
 * every hook and every `prepare`.
 */
export const VIEW_OPTIONS = {
  values: ['review'],
  flags: ['json', 'no-open'],
} as const;
