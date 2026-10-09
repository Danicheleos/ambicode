// Code search: a deterministic map of the files a request touches, and whole-word references.

/** buildMap(runtime, {…}) — terms, candidates, symbols and collisions for a route, by the configured layers; at most 6 KiB. */
export { buildMap, resolveLayers, MAP_LIMIT_BYTES } from './map.ts';
export type { MapInput, MapResult } from './map.ts';
/** harvest(fs, root, files) — exported declarations of files; declarationsOf(…) — those of the files naming given names. */
export { harvest, declarationsOf } from './harvest.ts';
/** refs(runtime, names, {project, declarations?}) — lines using each whole word, or where each is declared; at most 4 KiB. */
export { refs } from './refs.ts';
/** rankTerms(sources, {withProse?}) — identifiers first, then quoted strings, prose only when identifiers are scarce. */
export { rankTerms, termsFromRequirements } from './terms.ts';
/** navigationFor(ecosystem) — the navigation guidance text for an ecosystem. */
export { navigationFor } from './text/navigation.ts';
