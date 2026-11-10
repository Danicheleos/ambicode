// Word forms shared by the query (map.ts) and the search index (context/search-index.ts): both sides must split and stem alike or a path word never meets its request word.

export const MIN_TERM_LENGTH = 3;

/** `Order/Refund`, `order-refund` and `orderRefund` all reduce to the same lowercased word list. */
export function wordsOf(term: string): string[] {
  return term
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase());
}

const PLURALS: readonly (readonly [string, string])[] = [['ies', 'y'], ['es', ''], ['s', '']];
const ENDINGS = ['ing', 'ion', 'ed'];
const VOWELS = 'aeiouy';
/** Shortest stem: 3-letter stems collide with unrelated words. `faces` and `facing` gave `fac`, which `includes` found in `user-facade.mocks.ts`, a mocks file that became row 1 of a case. */
const STEM_MIN = 4;
/** In order: plural (not `-ss`, `-us`, `-is`), one `-ing`/`-ion`/`-ed`, a doubled consonant, then every final `e`, each leaving at least STEM_MIN letters: `faces`/`face` give `face`, `submitted` gives `submit`, `entries` gives `entry`.
 * On 33 probe pairs: forms of one word sharing a stem 9 to 14 of 15, unrelated pairs sharing one 2 of 18 (unchanged). Map-bench, 10 cases: F1 slightly lower, .389 to .387 (top-8 .405 to .391), recall .499 unchanged, precision .369 to .368. */
export function stem(word: string): string {
  let x = word;
  for (const [suffix, base] of PLURALS) {
    if (suffix === 's' && (x.endsWith('ss') || x.endsWith('us') || x.endsWith('is'))) continue;
    if (x.endsWith(suffix) && x.length - suffix.length >= STEM_MIN) { x = x.slice(0, -suffix.length) + base; break; }
  }
  for (const suffix of ENDINGS) {
    if (x.endsWith(suffix) && x.length - suffix.length >= STEM_MIN) { x = x.slice(0, -suffix.length); break; }
  }
  const last = x.at(-1)!;
  if (x.length - 1 >= STEM_MIN && last === x.at(-2) && !VOWELS.includes(last) && last !== 's') x = x.slice(0, -1);
  while (x.length - 1 >= STEM_MIN && x.endsWith('e')) x = x.slice(0, -1);
  return x;
}

/** Whether the text holds the term's words as whole words in a row: `est` is in `a EST list` and `RebaWizard` (parts), not in `test` or `destroy`. Both sides are split and stemmed as the search index's are. */
export function holdsWords(text: string, term: string): boolean {
  const wanted = wordsOf(term).map(stem);
  if (wanted.length === 0) return false;
  const have = wordsOf(text).map(stem);
  for (let at = 0; at + wanted.length <= have.length; at += 1) if (wanted.every((word, offset) => have[at + offset] === word)) return true;
  return false;
}
