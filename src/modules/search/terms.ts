// Term extraction for the map: identifiers a request names, in the order that finds code.
const MIN_TERM_LENGTH = 3;
export const MAX_TERMS = 12;
const IDENTIFIER = /[_./-]|\p{Ll}\p{Lu}/u;
const QUOTED = /["“`]([^"”`\n]{3,60})["”`]/g;
const COMPOUND = /[-/]/;
const TICKET_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d+$/;
const ABBREVIATION = /^(?:e\.g|i\.e|etc|vs|cf)\.?$/i;

/** Words every question about a repository carries; as search terms they match paths like `repository.ts` or `files/`. */
const REQUEST_WORDS = new Set(['repo', 'repository', 'file', 'files', 'change', 'changes', 'implement', 'implemented', 'below', 'above', 'touch', 'section', 'answer', 'question', 'anything', 'investigate', 'read', 'relevant', 'editing', 'explain', 'relative', 'creation', 'creations', 'deletion', 'deletions', 'pre', 'distinguish', 'existing', 'proposed', 'bullet', 'cite', 'evidence', 'assumptions']);

export const isIdentifierLike = (token: string): boolean => IDENTIFIER.test(token);

/** `Order/Refund`, `order-refund` and `orderRefund` all reduce to the same lowercased word list. */
export function wordsOf(term: string): string[] {
  return term
    .replace(/(\p{Ll}|\p{N})(\p{Lu})/gu, '$1 $2')
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word !== '')
    .map((word) => word.toLowerCase());
}

/** URLs, host names, UUIDs, `__`-prefixed attributes and markup carry no names from the code. */
export function cleanRequestText(text: string): string {
  return text
    .replace(/!?\[[^\]\n]*\]\([^)\s]*\)/g, ' ')
    .replace(/\b(?:blob:)?https?:\/\/\S+/g, ' ')
    .replace(/<\/?[A-Za-z][^<>\n]{0,300}>/g, ' ')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ' ')
    .replace(/\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|cloud)\b/gi, ' ')
    .replace(/(^|[^\w])__\w+/g, '$1 ');
}

/** A heading, a shell command or a bare directory written in quotes is an instruction about the answer, not a name. */
const isBoilerplate = (value: string): boolean => /^#+\s/.test(value) || /^(?:cd|git|npm|npx|node|ls|cat|grep)\s/.test(value) || /^[\w.-]+\/$/.test(value);
// `pre-change` and `creations/deletions` frame a request like its single words do, and a compound of them names no code.
const isRequestWord = (term: string): boolean => REQUEST_WORDS.has(term.toLowerCase()) || ABBREVIATION.test(term) || (COMPOUND.test(term) && term.split(COMPOUND).every((part) => REQUEST_WORDS.has(part.toLowerCase())));

/** A word-frequency heuristic; identifier-shaped tokens rank first, because naming code names the boundary. */
export function termsFromRequirements(sources: readonly { title: string; content: string }[], limit = MAX_TERMS): string[] {
  const found = new Map<string, { term: string; count: number; order: number; identifier: boolean }>();
  let order = 0;
  for (const source of sources) {
    for (const token of tokenize(`${source.title}\n${source.content}`)) {
      const key = token.toLowerCase();
      const existing = found.get(key);
      if (existing !== undefined) existing.count += 1;
      else found.set(key, { term: token, count: 1, order: (order += 1), identifier: isIdentifierLike(token) });
    }
  }
  return [...found.values()].sort((a, b) => Number(b.identifier) - Number(a.identifier) || b.count - a.count || a.order - b.order).slice(0, limit).map((entry) => entry.term);
}

function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const raw of text.split(/[^\p{L}\p{N}_./-]+/u)) {
    const token = raw.replace(/^[./-]+/, '').replace(/[./-]+$/, '');
    if (token.length < MIN_TERM_LENGTH || /^\p{N}+$/u.test(token)) continue;
    if (isIdentifierLike(token)) {
      tokens.push(token);
      // `MO-REBA-11` names the REBA module and `manuallyOverriddenCvValues` the override code: the parts are what paths carry.
      for (const word of wordsOf(token)) if (word.length >= 4 && !/^\p{N}+$/u.test(word) && !STOPWORDS.has(word)) tokens.push(word);
    } else if (token.length >= 4 && !STOPWORDS.has(token.toLowerCase())) tokens.push(token);
  }
  return tokens;
}

/** Identifiers first, then quoted strings, prose only when identifiers are scarce (fewer than 3) or `withProse` asks for it first. */
export function rankTerms(sources: readonly { title: string; content: string }[], options: { withProse?: boolean } = {}): string[] {
  const clean = sources.map((source) => ({ title: cleanRequestText(source.title), content: cleanRequestText(source.content) }));
  const text = clean.map((source) => `${source.title}\n${source.content}`).join('\n');
  const all = termsFromRequirements(clean, 60).filter((term) => !isRequestWord(term));
  const mined = all.filter((term) => !TICKET_ID.test(term)).slice(0, MAX_TERMS);
  const identifiers = mined.filter(isIdentifierLike);
  const backticked = [...text.matchAll(/`([^`\s]{3,60})`/g)].map((match) => match[1]!).filter((term) => isIdentifierLike(term) && !isBoilerplate(term) && !TICKET_ID.test(term));
  const strings = [...text.matchAll(QUOTED)].map((match) => match[1]!.trim()).filter((value) => /\s|\p{Lu}/u.test(value) && !value.startsWith('`') && !isBoilerplate(value));
  const ranked = [...new Set([...backticked, ...identifiers, ...strings])];
  if (options.withProse === true) {
    const prose = all.filter((term) => !isIdentifierLike(term)).slice(0, 8);
    return [...new Set([...prose, ...ranked])].slice(0, MAX_TERMS);
  }
  if (new Set([...backticked, ...identifiers]).size < 3) ranked.push(...mined.filter((term) => !isIdentifierLike(term)).flatMap((term) => term.split('-').filter((part) => part.length >= 3)));
  return [...new Set(ranked)].slice(0, MAX_TERMS);
}

/** Deliberately short: the breadth guard stops useless terms; this only saves a grep on "should". */
const STOPWORDS = new Set([
  'about', 'after', 'also', 'always', 'another', 'because', 'been', 'before', 'being', 'both',
  'cannot', 'could', 'description', 'does', 'done', 'each', 'either', 'else', 'every', 'from',
  'given', 'have', 'here', 'however', 'into', 'issue', 'it’s', 'just', 'like', 'made', 'make',
  'many', 'more', 'most', 'must', 'need', 'needs', 'never', 'none', 'only', 'other', 'over',
  'page', 'part', 'please', 'rather', 'same', 'shall', 'should', 'since', 'some', 'stop', 'such',
  'summary', 'sure', 'than', 'that', 'their', 'them', 'then', 'there', 'these', 'they', 'this',
  'those', 'through', 'ticket', 'time', 'under', 'until', 'upon', 'used', 'user', 'using', 'very',
  'want', 'were', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'within', 'without',
  'work', 'would', 'your',
]);