import type { SearchProfile } from '#types/config';

/** The reviewer reads these on top of the change; eight keeps a wide change inside the input limit. */
export const MAX_DEPENDENTS = 8;

/** Used when a project has no profile: today's source extensions, nothing else assumed. */
export const GENERIC_PROFILE: Omit<SearchProfile, 'stamp'> = {
  sources: ['ts', 'tsx', 'mts', 'cts', 'js', 'jsx', 'mjs', 'cjs', 'vue', 'svelte', 'astro', 'graphql', 'gql', 'py', 'pyi'],
  companions: [],
  catalogs: [],
  featureKinds: [],
  exportOnly: false,
};
