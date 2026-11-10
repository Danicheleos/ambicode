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

const INFLECTIONS: readonly (readonly [string, string])[] = [['ies', 'y'], ['ing', ''], ['ion', ''], ['ed', ''], ['es', ''], ['s', '']];
/** Shortest stem: 3-letter stems collide with unrelated words. `faces` and `facing` gave `fac`, which `includes` found in `user-facade.mocks.ts`, a mocks file that became row 1 of a case. */
const STEM_MIN = 4;
/** A word without a final `e`, then without its plural, past or `-ing`/`-ion` ending, each leaving at least STEM_MIN letters: `faces` and `face` give `face`, `complete` and `completed` give `complet`, `facing` stays `facing`. Against the 3-letter rule on the 10 map-bench cases: F1 .386 to .389, recall .493 to .499, precision .377 to .369. */
export function stem(word: string): string {
  const bare = word.length - 1 >= STEM_MIN && word.endsWith('e') ? word.slice(0, -1) : word;
  for (const [suffix, base] of INFLECTIONS) {
    if (suffix === 's' && bare.endsWith('ss')) continue;
    if (bare.endsWith(suffix) && bare.length - suffix.length >= STEM_MIN) {
      const cut = bare.slice(0, -suffix.length) + base;
      return cut.endsWith('e') && cut.length - 1 >= STEM_MIN ? cut.slice(0, -1) : cut;
    }
  }
  return bare;
}

/** Whether the text holds the term's words as whole words in a row: `est` is in `a EST list` and `RebaWizard` (parts), not in `test` or `destroy`. Both sides are split and stemmed as the search index's are. */
export function holdsWords(text: string, term: string): boolean {
  const wanted = wordsOf(term).map(stem);
  if (wanted.length === 0) return false;
  const have = wordsOf(text).map(stem);
  for (let at = 0; at + wanted.length <= have.length; at += 1) if (wanted.every((word, offset) => have[at + offset] === word)) return true;
  return false;
}
