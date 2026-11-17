import type { Omission } from '#types/modules/review';

/** Something a reader has to act on: work not reviewed, a ref or location dropped, a check that failed or did not run. */
export const attention = (text: string): Omission => ({ kind: 'attention', text });

/** A routine fact about how the review was scoped: the mode, the diff source, tests left out, no check recorded. */
export const scope = (text: string): Omission => ({ kind: 'scope', text });
