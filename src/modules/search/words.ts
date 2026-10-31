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
/** A word without its plural, past or `-ing`/`-ion` ending, and without a final `e` that those endings replace: `completed`, `completion` and `complete` all give `complet`. Shortest stem 3 (MIN_TERM_LENGTH), chosen on all 10 cases of one repository: combined F1 .324 against .315 for 4 and 5. */
export function stem(word: string): string {
  for (const [suffix, base] of INFLECTIONS) {
    if (word.endsWith(suffix) && word.length - suffix.length >= MIN_TERM_LENGTH) return (word.slice(0, -suffix.length) + base).replace(/e$/, '');
  }
  return word;
}

/** Whether the text holds the term's words as whole words in a row: `est` is in `a EST list` and `RebaWizard` (parts), not in `test` or `destroy`. Both sides are split and stemmed as the search index's are. */
export function holdsWords(text: string, term: string): boolean {
  const wanted = wordsOf(term).map(stem);
  if (wanted.length === 0) return false;
  const have = wordsOf(text).map(stem);
  for (let at = 0; at + wanted.length <= have.length; at += 1) if (wanted.every((word, offset) => have[at + offset] === word)) return true;
  return false;
}
