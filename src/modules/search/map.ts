import { openWorkspace } from '#modules/config/workspace';
import { SEARCH_LAYER_DEFAULTS } from '#types/defaults';
import type { ProjectConfig } from '#types/modules/config';
import { literalPathspec, type Git } from '#platform/git/git';
import { AmbicodeError } from '#util/errors';
import { matchesAnyGlob } from '#util/glob';
import { normalizeRelative, toProjectRelative } from '#util/paths';
import { isSearchable } from '#util/path-classes';
import { harvest } from './harvest.ts';
import type { Runtime } from '#types/composition';
import { COMMON_NAMES, LAYER_NAMES, type Declaration, type LayerName, type MapCandidate, type MapSymbol } from '#types/modules/search';

export const MAP_LIMIT_BYTES = 6144;
/** Wider than this many files, a term describes the project (`src`, a company name), not a boundary; the floor keeps tiny projects out of the rule. */
const TOO_BROAD_SHARE = 0.6;
const TOO_BROAD_MIN_FILES = 5;
const TOP_FILES = 8;
/** Harvested names take the second half of a full term list, so a full first pass still lets them in. */
const PASS2_NAMES = 6;
const SPANS = 3;
const SPAN_CANDIDATES = 20;
/** Hits closer than this many lines read as one span. */
const SPAN_GAP = 8;
/** Per-term scores only order one call's list; content is weakest because a word can sit in any comment. */
const SCORE = { directory: 5, filename: 8, content: 2, named: 10 };
/** git grep already spreads one search over the cores: four at a time was the fastest on the 29-grep bench (1.45 s against 2.26 s serial). */
const GREP_CONCURRENCY = 4;

interface MapLayer { name: LayerName; ms: number; hits: number }

export interface MapResult {
  mode: 'prompt' | 'context';
  layers: MapLayer[];
  layersSource: 'config' | 'default' | 'route';
  terms: { pass1: string[]; pass2: string[] };
  /** The part of the ranking the 6 KiB text kept. */
  candidates: MapCandidate[];
  symbols: Record<string, MapSymbol[]>;
  collisions: string[];
  limitations: string[];
  omitted: number;
  /** The first line is the layer list; the rest is compact JSON. At most 6,144 bytes. */
  text: string;
  bytes: number;
  /** The `map` ledger entry's fields. */
  entry: Record<string, unknown>;
}

export function resolveLayers(mode: 'prompt' | 'context'): { layers: string[]; source: 'default' } {
  return { layers: [...SEARCH_LAYER_DEFAULTS[mode]], source: 'default' };
}

export interface MapInput {
  project: ProjectConfig;
  mode: 'prompt' | 'context';
  layers: readonly string[];
  layersSource?: 'config' | 'default' | 'route';
  terms?: readonly string[];
  paths?: readonly string[];
  symbols?: readonly string[];
  /** Request text; the terms come from it when none are given, with a prose retry when that finds nothing. */
  request?: string;
}

async function inBatches<T>(items: readonly string[], run: (item: string) => Promise<T>): Promise<T[]> {
  const out: T[] = [];
  for (let at = 0; at < items.length; at += GREP_CONCURRENCY) out.push(...(await Promise.all(items.slice(at, at + GREP_CONCURRENCY).map(run))));
  return out;
}

/** The directory (+5) or filename (+8) holding the form; a dot segment is never a place. */
function pathHit(lower: string, form: string): 'directory' | 'filename' | null {
  const segments = lower.split('/');
  if (segments.some((segment) => segment.startsWith('.'))) return null;
  if (segments.slice(0, -1).join('/').includes(form)) return 'directory';
  return segments.at(-1)!.includes(form) ? 'filename' : null;
}

/** `refundlimit` finds `refundLimit` and `REFUND_LIMIT` alike: the term's own spelling first, then the joined words. */
const spellingsOf = (term: string): string[] => [...new Set([term.toLowerCase(), wordsOf(term).join('')])].filter((form) => form.length >= 3);

/** One term's files: path hits score by place, content hits are counted so the total has diminishing returns. */
async function shortlist(git: Git, files: readonly string[], pathspec: string | null, terms: readonly string[], limitations: string[]): Promise<MapCandidate[]> {
  const ranked = new Map<string, { score: number; content: number; reasons: string[] }>();
  const fileSet = new Set(files);
  const entry = (file: string) => ranked.get(file) ?? ranked.set(file, { score: 0, content: 0, reasons: [] }).get(file)!;
  const grepped = await inBatches(terms, async (term) => new Set((await git.grepFiles(term, pathspec)).filter((file) => fileSet.has(file))));
  terms.forEach((term, index) => {
    const content = grepped[index]!;
    const places = new Map<string, 'directory' | 'filename'>();
    for (const file of files) for (const form of spellingsOf(term)) { const hit = pathHit(file.toLowerCase(), form); if (hit !== null && places.get(file) !== 'filename') places.set(file, hit); }
    const touched = new Set([...places.keys(), ...content]);
    if (touched.size >= TOO_BROAD_MIN_FILES && touched.size > files.length * TOO_BROAD_SHARE) return void limitations.push(`"${term}" matched ${touched.size} of ${files.length} files; ignored`);
    for (const [file, place] of places) {
      const row = entry(file);
      row.score += SCORE[place];
      row.reasons.push(place === 'directory' ? `sits under a directory matching "${term}"` : `filename matched "${term}"`);
    }
    for (const file of content) {
      const row = entry(file);
      row.content += 1;
      row.reasons.push(`contains "${term}"`);
    }
  });
  // Diminishing returns: the content total approaches 2 * SCORE.content, below one directory hit, so repeating the words never beats naming the place.
  return [...ranked].map(([path, row]) => ({ path, score: row.score + (row.content === 0 ? 0 : SCORE.content * (2 - 2 ** (1 - row.content))), reasons: row.reasons }));
}

/** Up to three line ranges per candidate from the lines holding a term: hits within a few lines of each other are one span. */
async function spansOf(git: Git, candidates: MapCandidate[], terms: readonly string[]): Promise<void> {
  const lines = await git.grepLines(terms, candidates.slice(0, SPAN_CANDIDATES).map((candidate) => candidate.path));
  for (const candidate of candidates) {
    const ranges: string[] = [];
    let from = 0;
    let to = 0;
    for (const line of [...(lines.get(candidate.path) ?? []), Infinity]) {
      if (from > 0 && line - to > SPAN_GAP) { ranges.push(from === to ? `${from}` : `${from}-${to}`); from = 0; }
      if (from === 0) from = line;
      to = line;
    }
    if (ranges.length > 0) candidate.spans = ranges.slice(0, SPANS);
  }
}

export async function buildMap(runtime: Runtime, input: MapInput): Promise<MapResult> {
  const unknown = input.layers.filter((layer) => !(LAYER_NAMES as readonly string[]).includes(layer));
  if (unknown.length > 0) throw new AmbicodeError('search-layer-unknown', `Unknown search layer: ${unknown.join(', ')}.`, { details: [`Known layers: ${LAYER_NAMES.join(', ')}.`] });
  const { project, mode } = input;
  const { git, repositoryRoot } = await openWorkspace(runtime);
  const root = normalizeRelative(project.root);
  const pathspec = root === '' ? null : literalPathspec(root);
  const files = (await git.listFiles(pathspec)).filter((file) => {
    const relative = toProjectRelative(root, file) ?? file;
    return isSearchable(file) && (project.include.length === 0 || matchesAnyGlob(relative, project.include)) && !matchesAnyGlob(relative, project.exclude);
  });
  const limitations: string[] = [];
  const layers: MapLayer[] = [];
  const candidates = new Map<string, MapCandidate>();
  let declarations: Declaration[] = [];
  const derived = input.terms === undefined || input.terms.length === 0;
  const pass1 = (derived ? rankTerms([{ title: '', content: input.request ?? '' }]) : [...input.terms!]).slice(0, MAX_TERMS);
  let pass2: string[] = [];
  let passes = 0;
  const merge = (found: readonly MapCandidate[]): void => {
    for (const candidate of found) {
      const have = candidates.get(candidate.path);
      if (have === undefined) candidates.set(candidate.path, { ...candidate, reasons: [...candidate.reasons] });
      else {
        have.score = Math.max(have.score, candidate.score);
        have.reasons.push(...candidate.reasons.filter((reason) => !have.reasons.includes(reason)));
      }
    }
  };
  const top = (): string[] => [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, TOP_FILES).map((candidate) => candidate.path);
  const names = (): string[] => [...new Set(declarations.map((declaration) => declaration.name))];
  for (const known of input.paths ?? []) merge([{ path: known, score: SCORE.named, reasons: ['named by the caller'] }]);

  const run = async (layers_: readonly string[], terms: readonly string[]): Promise<void> => {
    for (const layer of layers_ as readonly LayerName[]) {
      const started = runtime.clock.elapsed();
      let hits = 0;
      if (layer === 'shortlist') {
        passes += 1;
        const used = passes === 1 ? [...terms] : [...new Set([...pass1.slice(0, MAX_TERMS - PASS2_NAMES), ...names().slice(0, PASS2_NAMES), ...pass1.slice(MAX_TERMS - PASS2_NAMES)])].slice(0, MAX_TERMS);
        if (passes > 1) pass2 = used;
        const found = await shortlist(git, files, pathspec, used, limitations);
        merge(found);
        hits = found.length;
      } else if (layer === 'harvest') {
        declarations = await harvest(runtime.fs, repositoryRoot, mode === 'context' ? [...new Set([...(input.paths ?? []), ...top()])].slice(0, TOP_FILES) : top());
        hits = declarations.length;
      } else {
        const words = [...new Set([...(input.symbols ?? []), ...pass1.filter(isIdentifierLike)])].filter((word) => !COMMON_NAMES.has(word));
        const perWord = await inBatches(words, async (word) => (await git.grepWords([word], pathspec)).filter(isSearchable));
        const broad = (count: number): boolean => count >= TOO_BROAD_MIN_FILES && count > files.length * TOO_BROAD_SHARE;
        words.forEach((word, at) => { if (broad(perWord[at]!.length)) limitations.push(`"${word}" matched ${perWord[at]!.length} of ${files.length} files; ignored`); });
        const found = [...new Set(perWord.filter((hit) => !broad(hit.length)).flat())];
        merge(found.map((path) => ({ path, score: SCORE.content, reasons: [`contains the word ${words.length === 1 ? `"${words[0]}"` : 'of the request'}`] })));
        hits = found.length;
      }
      layers.push({ name: layer, ms: Math.max(0, Math.round(runtime.clock.elapsed() - started)), hits });
    }
  };
  await run(input.layers, pass1);
  if (candidates.size === 0 && derived && (input.request ?? '') !== '') {
    // No identifier found anything: the request's plain words get one try before the map is reported empty.
    const prose = rankTerms([{ title: '', content: input.request! }], { withProse: true });
    if (prose.join('\n') !== pass1.join('\n')) {
      layers.length = 0;
      passes = 0;
      pass1.splice(0, pass1.length, ...prose);
      await run(input.layers, pass1);
    }
  }

  const collisions = [...new Set(declarations.filter((declaration) => declaration.declarations > 1).map((declaration) => declaration.name))];
  const symbols: Record<string, MapSymbol[]> = {};
  for (const term of [...pass1, ...pass2]) {
    const rows = declarations.filter((declaration) => declaration.name.toLowerCase().includes(term.toLowerCase())).slice(0, 3);
    if (rows.length > 0 && symbols[term] === undefined) symbols[term] = rows.map((row) => ({ name: row.name, kind: row.kind, at: `${row.path}:${row.line}`, declarations: row.declarations, collides: row.declarations > 1 }));
  }
  const ordered = [...candidates.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).map((candidate) => ({ ...candidate, score: Math.round(candidate.score * 100) / 100, reasons: candidate.reasons.slice(0, 2) }));
  await spansOf(git, ordered, [...new Set([...pass1, ...pass2, ...(input.symbols ?? [])])]);
  const head = `layers: ${layers.map((layer) => layer.name).join(' → ') || 'none'} (${input.layersSource ?? 'default'})`;
  const render = (kept: readonly MapCandidate[]): string => {
    const cut = ordered.length - kept.length;
    const document = {
      terms: { pass1, pass2 },
      candidates: kept.map((candidate) => [candidate.path, candidate.score, candidate.reasons, ...(candidate.spans === undefined ? [] : [candidate.spans])]),
      ...(Object.keys(symbols).length === 0 ? {} : { symbols }),
      ...(collisions.length === 0 ? {} : { collides: collisions }),
      limitations: cut === 0 ? limitations : [...limitations, `${cut} lower-ranked candidate(s) cut to fit ${MAP_LIMIT_BYTES} bytes`],
    };
    return `${head}\n${JSON.stringify(document)}`;
  };
  let kept = ordered;
  let text = render(kept);
  while (Buffer.byteLength(text) > MAP_LIMIT_BYTES && kept.length > 0) {
    kept = kept.slice(0, Math.max(0, kept.length - Math.max(1, Math.ceil(kept.length / 10))));
    text = render(kept);
  }
  const bytes = Buffer.byteLength(text);
  const reported = ordered.length === kept.length ? limitations : [...limitations, `${ordered.length - kept.length} lower-ranked candidate(s) cut to fit ${MAP_LIMIT_BYTES} bytes`];
  return {
    mode, layers, layersSource: input.layersSource ?? 'default', terms: { pass1, pass2 }, candidates: kept, symbols, collisions, limitations: reported, omitted: ordered.length - kept.length, text, bytes,
    entry: { mode, layers, layersSource: input.layersSource ?? 'default', terms: { pass1, pass2 }, candidates: ordered.length, limitations: reported, bytes, ...(collisions.length === 0 ? {} : { collisions }) },
  };
}

// Term extraction for the map: identifiers a request names, in the order that finds code.
const MIN_TERM_LENGTH = 3;
const MAX_TERMS = 12;
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
const PATH_LIKE = /(?<![\w./-])((?:\.{0,2}\/)?[\w@.-]+(?:\/[\w@.-]+)+)(?::\d+(?:-\d+)?)?/g;
export const CODE_SHAPED = /`([^`\s]{2,80})`|\b([A-Za-z_$][\w$]*(?:[a-z0-9][A-Z]|_[A-Za-z0-9])[\w$]*)\b/g;
const MAX_SEEDS = 12;
/** A path, or a file name with a short lowercase extension: not a symbol. */
const FILE_LIKE = /\/|^[\w@-]+(?:\.[\w-]+)*\.[a-z]{1,5}$/;

/** Tracked files the text cites by path (an optional `:line` is dropped); a cited path that is not tracked seeds nothing. */
export function pathsCitedIn(text: string, files: readonly string[]): string[] {
  const tracked = new Set(files);
  const cited = [...text.matchAll(PATH_LIKE)].map((match) => match[1]!.replace(/^\.\//, '').replace(/[.,;:]+$/, ''));
  return [...new Set(cited.filter((file) => tracked.has(file)))].slice(0, MAX_SEEDS);
}

/** Backticked or code-shaped names (camelCase, snake_case); a dotted name keeps its last segment. */
export function symbolsCitedIn(text: string): string[] {
  const tokens = [...text.matchAll(CODE_SHAPED)].map((match) => match[1] ?? match[2] ?? '').filter((token) => !FILE_LIKE.test(token));
  const names = tokens.map((token) => token.replace(/\(\)$/, '').split('.').at(-1) ?? '');
  return [...new Set(names.filter((name) => /^[A-Za-z_$][\w$]{2,}$/.test(name)))].slice(0, MAX_SEEDS);
}
