import { openWorkspace } from '#modules/config/workspace';
import type { ProjectConfig } from '#types/modules/config';
import { Git, literalPathspec } from '#platform/git/git';
import { AmbicodeError } from '#util/errors';
import { matchesAnyGlob } from '#util/glob';
import { normalizeRelative, toProjectRelative } from '#util/paths';
import { isSearchable, pathExclusionReason } from '#util/path-classes';
import { harvest } from './harvest.ts';
import { tooBroad } from './refs.ts';
import { holdsWords, MIN_TERM_LENGTH, stemsOf, wordsOf } from './words.ts';
import { isModuleSource, maxModulesFor } from '#modules/context/context';
import { searchIndexFor, type FolderRow } from '#modules/context/search-index';
import type { Runtime } from '#types/composition';
import { LAYER_NAMES, type Declaration, type LayerName, type MapCandidate, type MapSymbol } from '#types/modules/search';

/** What the map is, once, above its JSON. It replaces the `layers:` debug line, which nothing parsed; the model had no explanation of the row tuples or of `limitations`. */
export const MAP_LEGEND = [
  'Map: files ranked by how many request words they match in paths, contents, names and UI text; built by script, unverified.',
  'candidates: [path, score (relative; higher = more request words), why matched, line spans to open].',
  'limitations: request words the map could not use (found in no code file, or too common).',
].join('\n');

/** The one line a map with no rows ends with, and the limitation the ledger keeps for it. */
const EMPTY_MAP = 'The map found no files for this request; search the repository yourself with your own tools.';

/** Harvested names take the last slots of a full term list, so a full first pass still lets them in. 6 -> 4: F1 .257 -> .301 on one 10-case bench of one repository, chosen on the mean of all 10 cases; 0-3 or 5 gave a lower mean. A name from a harvested file is a guess; the first-pass terms are the request's own words. */
const PASS2_NAMES = 4;
/** One row per entity (folder + file name before the first dot): the answer unit is the entity, so unrelated files of one folder each get a row. 10-case bench of one repository: F1 .384 -> .387, recall .509 -> .493, precision .370 -> .376, rows 15.9 -> 16.0. */
const MAX_PER_ENTITY = 1;
/** An entity holding a named file lists 2: the files beside the change are the ones whose convention it follows or breaks (the review brief's per-file same-folder count). */
const MAX_PER_SEED_ENTITY = 2;
/** Rows scoring under this share of the best row are not listed. inseer-frontend map-bench, 10 cases, no byte cut: .12 R .702 P .206 F1 .267 145.6 rows; .30 R .662 P .328 F1 .372 58.3 rows; .40 F1 .328;
 *  The sweep found F1 highest at .30 of the floors tried. */
export const LIST_FLOOR = 0.30;
/** Most rows a map lists after the floor. Measured 2026-11-12 on the map bench, 27 cases over FE and k12 repositories: top-N F1 is a plateau from 15 to 25;
 *  20 halves FE's mean row count (58 -> 20) at +.019 mean F1 over the floor alone (p .078, within noise). */
export const TOP_ROWS = 20;
/** Hits closer than this many lines read as one span. */
const SPAN_GAP = 8;
/** Per-term scores only order one call's list; content is weakest because a word can sit in any comment. 5/8/2/10: unmeasured, no sweep records them. */
const SCORE = { directory: 5, filename: 8, content: 2, named: 10 };
/** git grep already spreads one search over the cores: four at a time was the fastest on the 29-grep bench (1.45 s against 2.26 s serial). */
const GREP_CONCURRENCY = 4;

interface MapLayer { name: LayerName; ms: number; hits: number }

interface MapResult {
  layers: MapLayer[];
  terms: { pass1: string[]; pass2: string[] };
  /** The part of the ranking the floor kept: every row of the text. */
  candidates: MapCandidate[];
  /** The whole ranking with every reason; the offline bench reads it to see what the floor cut. */
  pool: MapCandidate[];
  symbols: Record<string, MapSymbol[]>;
  collisions: string[];
  limitations: string[];
  /** Where each pool stage dropped or moved a file (`listDropped`: under the floor or past TOP_ROWS); the offline replay reads it. Not in `entry`, not printed. */
  debug: { folded: Record<string, string | null>; spreadDropped: string[]; listDropped: string[] };
  /** MAP_LEGEND (three lines), then compact JSON. */
  text: string;
  bytes: number;
  /** The `map` ledger entry's fields. */
  entry: Record<string, unknown>;
}


interface MapInput {
  project: ProjectConfig;
  layers: readonly string[];
  terms?: readonly string[];
  paths?: readonly string[];
  symbols?: readonly string[];
  /** Files the caller already has (the changed files of a review): never listed, searched, retrieved, folded onto or counted as a hit. */
  exclude?: readonly string[];
  /** A checkout other than the working repository (a merge request head): its files are the ones searched. */
  checkout?: string;
  /** Request text; the terms come from it when none are given, with a prose retry when that finds nothing. */
  request?: string;
}

async function inBatches<T>(items: readonly string[], run: (item: string) => Promise<T>): Promise<T[]> {
  const out: T[] = [];
  for (let at = 0; at < items.length; at += GREP_CONCURRENCY) out.push(...(await Promise.all(items.slice(at, at + GREP_CONCURRENCY).map(run))));
  return out;
}

/** The filename (+8) or, failing that, the directory (+5) holding the form: a file in a matching folder with a matching name scores as the name; a dot segment is never a place. */
function pathHit(lower: string, form: string): 'directory' | 'filename' | null {
  const segments = lower.split('/');
  if (segments.some((segment) => segment.startsWith('.'))) return null;
  if (segments.at(-1)!.includes(form)) return 'filename';
  return segments.slice(0, -1).join('/').includes(form) ? 'directory' : null;
}

/** `unit price` finds `unit-price/`, `unit_price`, `unitPrice` and `UnitPrice.ts` alike: the term's own spelling, then the words joined, hyphenated and underscored. */
function spellingsOf(term: string, inflected = false): string[] {
  const words = inflected ? stemsOf(term) : wordsOf(term);
  const joined = words.length < 2 ? words : [words.join(''), words.join('-'), words.join('_')];
  const forms = inflected ? joined : words.length < 2 ? [term.toLowerCase(), ...words] : [term.toLowerCase(), ...joined];
  return [...new Set(forms)].filter((form) => form.length >= 3);
}

/** One term's files: path hits score by place, content hits are counted so the total has diminishing returns. */
async function shortlist(git: Git, files: readonly string[], pathspec: string | null, terms: readonly string[], note: (text: string) => void, declaredIn: ReadonlyMap<string, ReadonlySet<string>> = new Map(), plain: ReadonlySet<string> = new Set(), excluded: ReadonlySet<string> = new Set()): Promise<{ found: MapCandidate[]; live: string[]; dead: string[]; elsewhere: Map<string, string[]> }> {
  const live: string[] = [];
  const dead: string[] = [];
  const ranked = new Map<string, { score: number; content: number; reasons: string[]; terms: Set<string> }>();
  const fileSet = new Set(files);
  const entry = (file: string) => ranked.get(file) ?? ranked.set(file, { score: 0, content: 0, reasons: [], terms: new Set() }).get(file)!;
  const everywhere = new Map<string, string[]>();
  const search = async (wanted: readonly string[]): Promise<void> => {
    const todo = [...new Set(wanted)].filter((term) => !everywhere.has(term));
    const hits = await inBatches(todo, (term) => git.grepFiles(term, pathspec, (line) => holdsWords(line, term)));
    todo.forEach((term, at) => everywhere.set(term, hits[at]!));
  };
  await search(terms.filter((term) => !plain.has(term)));
  // The same grep already read the files a name search skips (json, html, markdown): a term found only there is not absent.
  const elsewhere = new Map<string, string[]>();
  let plainOpen: boolean | undefined;
  for (const term of terms) {
    // Plain words wait behind the other terms and are judged once, at the first of them: terms that match nothing do not count, so a ticket whose ids match nothing still searches its words. They are grepped only when the gate opens.
    if (plain.has(term)) {
      if (plainOpen === undefined) { plainOpen = live.length < PLAIN_LIVE_ENOUGH; if (plainOpen) await search(terms.filter((word) => plain.has(word))); }
      if (!plainOpen) continue;
    }
    // A name harvested from a file is that file's own word: it says nothing about the file, only about the files that use it.
    const own = declaredIn.get(term) ?? new Set<string>();
    const hits = everywhere.get(term)!;
    const content = new Set(hits.filter((file) => fileSet.has(file) && !own.has(file)));
    const places = new Map<string, 'directory' | 'filename'>();
    const place = (forms: readonly string[]): void => { for (const file of files) for (const form of forms) { const hit = pathHit(file.toLowerCase(), form); if (hit !== null && places.get(file) !== 'filename') places.set(file, hit); } };
    place(spellingsOf(term));
    if (places.size === 0) place(spellingsOf(term, true));
    for (const file of own) places.delete(file);
    const touched = new Set([...places.keys(), ...content]);
    const broad = tooBroad(term, touched.size, files.length);
    if (broad !== null) { note(broad); continue; }
    if (touched.size > 0) live.push(term);
    else {
      dead.push(term);
      const outside = hits.filter((file) => !fileSet.has(file) && !excluded.has(file) && pathExclusionReason(file) === null && !file.split('/').some((segment) => segment.startsWith('.')));
      if (outside.length > 0) elsewhere.set(term, outside);
    }
    // A term found in few files names a place; one found in many names a topic. Unweighted, a word like `value` outranked the one identifier a request carried. One 10-case bench of one repository: F1 .203 -> .253, top8 .157 -> .210.
    const weight = 1 - Math.log(Math.max(1, touched.size)) / Math.log(Math.max(2, files.length));
    for (const [file, place] of places) {
      const row = entry(file);
      row.score += SCORE[place] * weight;
      row.terms.add(term.toLowerCase());
      row.reasons.push(place === 'directory' ? `sits under a directory matching "${term}"` : `filename matched "${term}"`);
    }
    for (const file of content) {
      const row = entry(file);
      row.content += weight;
      row.terms.add(term.toLowerCase());
      row.reasons.push(`contains "${term}"`);
    }
  }
  // Diminishing returns: the content total approaches 2 * SCORE.content, below one directory hit, so repeating the words never beats naming the place.
  return { live, dead, elsewhere, found: [...ranked].map(([path, row]) => ({ path, score: row.score + (row.content === 0 ? 0 : SCORE.content * (2 - 2 ** (1 - row.content))), reasons: row.reasons, terms: [...row.terms] })) };
}

/** The line ranges per candidate from the lines holding a term: hits within a few lines of each other are one span. */
async function spansOf(git: Git, candidates: MapCandidate[], terms: readonly string[]): Promise<void> {
  const lines = await git.grepLines(terms, candidates.map((candidate) => candidate.path));
  for (const candidate of candidates) {
    const ranges: string[] = [];
    let from = 0;
    let to = 0;
    for (const line of [...(lines.get(candidate.path) ?? []), Infinity]) {
      if (from > 0 && line - to > SPAN_GAP) { ranges.push(from === to ? `${from}` : `${from}-${to}`); from = 0; }
      if (from === 0) from = line;
      to = line;
    }
    if (ranges.length > 0) candidate.spans = ranges;
  }
}

/** How much a request word counts by the field of a folder row it meets: the path names the place, a declared name nearly does, a label is what a user reads, a file name repeats the path. Unmeasured: no sweep records these weights. */
const FIELD_WEIGHT = { words: 1, names: 0.9, labels: 0.7, files: 0.6 } as const;
type Field = keyof typeof FIELD_WEIGHT;
/** Two adjacent words of one term on one row: a phrase, worth half the rarer word again. */
const BIGRAM_BONUS = 0.5;
/** A label holding the whole phrase. */
const PHRASE_BONUS = 0.3;
/**
 * A row with a hit of its own (below its module) gains this share of its module's path score; the module's words alone
 * retrieve nothing. One 10-case bench of one repository: F1 .368 against .367 without the gate, top8 .341 against .333.
 */
const MODULE_GATE = 0.5;
/** Retrieved rows kept, best first: a selection, not a data cap. One 10-case bench of one repository, chosen on all 10: F1 .357 / .368 / .364 for 12 / 24 / 48; with no cut .349 (FE rebuilt-index bench 2026-11-12, .4286 with 24). */
const RETRIEVED_ROWS = 24;
/** Factor that puts the best single-term row just under the worst multi-term row, so printed scores stay in rank order. */
const UNDER_FLOOR = 0.999;

/** A folder that has a hit of its own and sits one import or mention away from one of the 8 best-scored rows takes half that row's score. 10 cases of one repository: F1 .419 -> .452, top8 .381 -> .410, absent/cut/printed/top 20/51/25/30 (weights .3 gave .444/.390 and sources 3 .432-.441, .8 gave .439). */
const NEIGHBOUR_SOURCES = 8;
const NEIGHBOUR_BOOST = 0.5;
const namedWords = (name: string, stems: ReadonlySet<string>): number => stemsOf(name.replace(/\.[^.]+$/, '')).filter((word) => stems.has(word)).length;
/**
 * Folder rows of the search index scored against the request's words: idf over rows, field weights, phrase bonuses and
 * the module gate; one candidate file per retrieved folder, the best at SCORE.directory and the rest in proportion.
 * A folder with a hit of its own that sits one uses/usedBy edge from a top row is lifted (NEIGHBOUR_*).
 */
function retrieve(rows: readonly FolderRow[], terms: readonly string[], files: ReadonlySet<string>): MapCandidate[] {
  const wordsIn = (texts: readonly string[]): Set<string> => new Set(texts.flatMap(stemsOf));
  const withUnits = terms.map((term) => ({ term: term.toLowerCase(), units: stemsOf(term).filter(isTermWord) })).filter((entry) => entry.units.length > 0);
  const phrases = withUnits.map((entry) => entry.units);
  const units = [...new Set(phrases.flat())];
  const ownPath = (row: FolderRow): string => (row.path === row.module ? row.path.slice(row.path.lastIndexOf('/') + 1) : row.module !== '' && row.path.startsWith(`${row.module}/`) ? row.path.slice(row.module.length + 1) : row.path);
  const indexed = rows.map((row) => ({
    row,
    fields: { words: new Set(row.words), names: wordsIn(row.names), labels: wordsIn(row.labels), files: wordsIn(row.files.map((file) => file.replace(/\.[^.]+$/, ''))) } as Record<Field, Set<string>>,
    // Path words below the module (or the module's own last segment) are the row's; the module's words above it belong to every row under it.
    own: wordsIn([ownPath(row)]),
    labelPhrases: row.labels.map((label) => ` ${stemsOf(label).join(' ')} `),
  }));
  const n = Math.max(2, rows.length);
  const idf = new Map<string, number>();
  for (const unit of units) {
    const df = indexed.filter((entry) => Object.values(entry.fields).some((field) => field.has(unit))).length;
    if (df > 0 && tooBroad(unit, df, rows.length) === null) idf.set(unit, 1 - Math.log(df) / Math.log(n));
  }
  const moduleScore = new Map<string, number>();
  const moduleOf = (module: string): number => moduleScore.get(module) ?? moduleScore.set(module, [...wordsIn([module])].reduce((sum, word) => sum + (idf.get(word) ?? 0), 0)).get(module)!;
  const scored = indexed.map((entry) => {
    let own = 0;
    let above = 0;
    const hits = new Set<string>();
    const reasons = new Map<Field, string>();
    for (const [unit, weight] of idf) {
      for (const field of Object.keys(FIELD_WEIGHT) as Field[]) {
        if (!entry.fields[field].has(unit)) continue;
        hits.add(unit);
        if (field === 'words' && !entry.own.has(unit)) above += FIELD_WEIGHT[field] * weight;
        else own += FIELD_WEIGHT[field] * weight;
        if (reasons.has(field)) continue;
        const holds = (text: string): boolean => stemsOf(text).includes(unit);
        const shown = field === 'words' ? unit : field === 'names' ? entry.row.names.find(holds) : field === 'labels' ? entry.row.labels.find(holds) : entry.row.files.find(holds);
        reasons.set(field, `${field === 'words' ? 'path' : field.slice(0, -1)} "${shown ?? unit}"`);
      }
    }
    for (const phrase of phrases) {
      for (let at = 1; at < phrase.length; at += 1) if (hits.has(phrase[at - 1]!) && hits.has(phrase[at]!)) own += BIGRAM_BONUS * Math.max(idf.get(phrase[at - 1]!) ?? 0, idf.get(phrase[at]!) ?? 0);
      if (phrase.length > 1 && entry.labelPhrases.some((label) => label.includes(` ${phrase.join(' ')} `))) own += PHRASE_BONUS * Math.max(...phrase.map((unit) => idf.get(unit) ?? 0));
    }
    return { entry, hits, reasons: [...reasons.values()], behind: withUnits.filter((one) => one.units.some((unit) => hits.has(unit))).map((one) => one.term), score: own === 0 ? 0 : own + above + MODULE_GATE * moduleOf(entry.row.module) };
  });
  const lead = [...scored].filter((row) => row.score > 0).sort((a, b) => b.score - a.score).slice(0, NEIGHBOUR_SOURCES);
  const boost = new Map<string, { by: number; from: string }>();
  for (const source of lead) for (const target of [...source.entry.row.uses, ...source.entry.row.usedBy]) if ((boost.get(target)?.by ?? 0) < NEIGHBOUR_BOOST * source.score) boost.set(target, { by: NEIGHBOUR_BOOST * source.score, from: source.entry.row.path });
  for (const row of scored) {
    const near = boost.get(row.entry.row.path);
    if (near !== undefined && row.score > 0) { row.score += near.by; row.reasons.push(`neighbour of ${near.from}`); }
  }
  const ranked = scored.filter((row) => row.score > 0).sort((a, b) => b.score - a.score || (a.entry.row.path < b.entry.row.path ? -1 : 1)).slice(0, RETRIEVED_ROWS);
  const found: MapCandidate[] = [];
  for (const { entry, hits, reasons, behind, score } of ranked) {
    const folder = entry.row.path;
    const choices = entry.row.files.map((file) => `${folder}/${file}`).filter((file) => files.has(file));
    if (choices.length === 0) continue;
    // The file whose own name carries the most request words stands for the folder; without any, the first by name.
    const path = choices.map((file) => ({ file, named: namedWords(file.slice(folder.length + 1), hits) })).sort((a, b) => b.named - a.named || (a.file < b.file ? -1 : 1))[0]!.file;
    found.push({ path, score: (SCORE.directory * score) / ranked[0]!.score, reasons: [`retrieved: ${reasons.join(', ')}`], terms: behind });
  }
  return found;
}

export async function buildMap(runtime: Runtime, input: MapInput): Promise<MapResult> {
  const unknown = input.layers.filter((layer) => !(LAYER_NAMES as readonly string[]).includes(layer));
  if (unknown.length > 0) throw new AmbicodeError('search-layer-unknown', `Unknown search layer: ${unknown.join(', ')}.`, { details: [`Known layers: ${LAYER_NAMES.join(', ')}.`] });
  const { project } = input;
  const workspace = await openWorkspace(runtime);
  const { config } = workspace;
  const { git, repositoryRoot } = input.checkout === undefined ? workspace : { git: new Git({ runner: runtime.runner, repositoryRoot: input.checkout }), repositoryRoot: input.checkout };
  const root = normalizeRelative(project.root);
  const pathspec = root === '' ? null : literalPathspec(root);
  // The files the caller already has leave here: no search, retrieve pick, fold target or live count ever sees them.
  const excluded = new Set(input.exclude ?? []);
  const files = (await git.listFiles(pathspec)).filter((file) => {
    const relative = toProjectRelative(root, file) ?? file;
    return !excluded.has(file) && isSearchable(file) && (project.include.length === 0 || matchesAnyGlob(relative, project.include)) && !matchesAnyGlob(relative, project.exclude);
  });
  // `limitations` is everything the ledger keeps; `notes` is the part the model can act on (a request word the map could not use), the only part rendered.
  const limitations: string[] = [];
  const notes: string[] = [];
  const note = (text: string): void => void (limitations.push(text), notes.push(text));
  const layers: MapLayer[] = [];
  const candidates = new Map<string, MapCandidate>();
  let declarations: Declaration[] = [];
  const derived = input.terms === undefined || input.terms.length === 0;
  const derivedTerms = derived ? termsOf([{ title: '', content: input.request ?? '' }]) : { terms: [...input.terms!], plain: new Set<string>() };
  const { plain } = derivedTerms;
  const pass1 = [...derivedTerms.terms];
  let pass2: string[] = [];
  let passes = 0;
  let retrieved: number | null = null;
  const merge = (found: readonly MapCandidate[]): void => {
    for (const candidate of found) {
      const have = candidates.get(candidate.path);
      if (have === undefined) candidates.set(candidate.path, { ...candidate, reasons: [...candidate.reasons], ...(candidate.terms === undefined ? {} : { terms: [...candidate.terms] }) });
      else {
        have.score = Math.max(have.score, candidate.score);
        if (candidate.terms !== undefined) have.terms = [...new Set([...(have.terms ?? []), ...candidate.terms])];
        have.reasons.push(...candidate.reasons.filter((reason) => !have.reasons.includes(reason)));
      }
    }
  };
  // A named file the caller also has is not a row (it would count as a hit and block the retry), but its declarations are still harvested.
  const held = (input.paths ?? []).filter((known) => excluded.has(known));
  const top = (): string[] => [...held, ...[...candidates.values()].sort((a, b) => b.score - a.score).map((candidate) => candidate.path)];
  const names = (): string[] => [...new Set(declarations.map((declaration) => declaration.name))];
  for (const known of input.paths ?? []) if (!excluded.has(known)) merge([{ path: known, score: SCORE.named, reasons: ['named by the caller'] }]);

  const run = async (layers_: readonly string[], terms: readonly string[]): Promise<void> => {
    for (const layer of layers_ as readonly LayerName[]) {
      const started = runtime.clock.elapsed();
      let hits = 0;
      if (layer === 'retrieve') {
        const index = await searchIndexFor({ fs: runtime.fs, clock: runtime.clock, git, root: repositoryRoot }, { roots: [], maxModules: maxModulesFor(config.context) });
        if (index.limitation !== null) (index.limitation.startsWith('search index absent') ? note : (text: string) => void limitations.push(text))(index.limitation);
        // After the first shortlist pass1 holds the live terms only: retrieving on every ranked word let the request's prose ("video", "admin", "level") take the rows (F1 .337 against .368, one 10-case bench).
        const found = index.rows === null ? [] : retrieve(index.rows, pass1, new Set(files));
        merge(found);
        retrieved = found.length;
        hits = found.length;
      } else if (layer === 'shortlist') {
        passes += 1;
        const used = passes === 1 ? [...terms] : [...new Set([...pass1, ...names().slice(0, PASS2_NAMES)])];
        if (passes > 1) pass2 = used;
        const { found, live, dead, elsewhere } = await shortlist(git, files, pathspec, used, note, passes > 1 ? new Map(declarations.filter((declaration) => !pass1.some((term) => term.toLowerCase() === declaration.name.toLowerCase())).map((declaration) => [declaration.name, new Set(declarations.filter((other) => other.name === declaration.name).map((other) => other.path))])) : undefined, passes === 1 ? plain : undefined, excluded);
        const absent = dead.filter((term) => !elsewhere.has(term) && !plain.has(term));
        if (passes === 1 && absent.length > 0) note(`no file matches ${absent.length === 1 ? 'the term' : 'the terms'} ${absent.map((term) => `"${term}"`).join(', ')}${derived ? '' : '; they were left out of the ranking'}`);
        if (passes === 1) for (const [term, outside] of [...elsewhere].filter(([term]) => !plain.has(term))) note(`"${term}" is in no code file, only in ${outside.join(', ')}`);
        if (passes === 1 && derived) pass1.splice(0, pass1.length, ...live);
        merge(found);
        hits = found.length;
      } else if (layer === 'harvest') {
        declarations = await harvest(runtime.fs, repositoryRoot, top());
        hits = declarations.length;
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
      limitations.length = 0;
      notes.length = 0;
      pass1.splice(0, pass1.length, ...prose);
      await run(input.layers, pass1);
    }
  }

  const collisions = [...new Set(declarations.filter((declaration) => declaration.declarations > 1).map((declaration) => declaration.name))];
  const symbols: Record<string, MapSymbol[]> = {};
  for (const term of [...pass1, ...pass2]) {
    const rows = declarations.filter((declaration) => declaration.name.toLowerCase().includes(term.toLowerCase()));
    if (rows.length > 0 && symbols[term] === undefined) symbols[term] = rows.map((row) => ({ name: row.name, kind: row.kind, at: `${row.path}:${row.line}`, declarations: row.declarations, collides: row.declarations > 1 }));
  }
  // A row behind one request term is correct 16% of the time, behind two or three terms 31-37% (first 41 rows per case); F1 .368 -> .419 with all of them under the multi-term rows, one 10-case bench of one repository.
  const behindOne = [...candidates.values()].filter((candidate) => candidate.terms?.length === 1);
  const behindMore = [...candidates.values()].filter((candidate) => (candidate.terms?.length ?? 0) > 1);
  if (behindOne.length > 0 && behindMore.length > 0) {
    const floor = Math.min(...behindMore.map((candidate) => candidate.score));
    const ceiling = Math.max(...behindOne.map((candidate) => candidate.score));
    if (ceiling >= floor) for (const candidate of behindOne) candidate.score *= (floor * UNDER_FLOOR) / ceiling;
  }
  // A spec, mock or config file names the folder it sits in but is not what a question is about: its row moves to the folder's source file of the same stem, else the first source file, and is dropped when the folder has none.
  const sourceIn = new Map<string, string[]>();
  const folderOf = (file: string): string => file.slice(0, file.lastIndexOf('/') + 1);
  const entityOf = (file: string): string => folderOf(file) + file.slice(folderOf(file).length).split('.')[0]!;
  for (const file of files) if (isModuleSource(file)) sourceIn.set(folderOf(file), [...(sourceIn.get(folderOf(file)) ?? []), file]);
  const seedPaths = new Set(input.paths ?? []);
  const folded: Record<string, string | null> = {};
  for (const candidate of [...candidates.values()]) {
    if (isModuleSource(candidate.path) || seedPaths.has(candidate.path)) continue;
    candidates.delete(candidate.path);
    const siblings = sourceIn.get(folderOf(candidate.path)) ?? [];
    const target = siblings.find((file) => entityOf(file) === entityOf(candidate.path)) ?? siblings[0];
    folded[candidate.path] = target ?? null;
    if (target !== undefined) merge([{ ...candidate, path: target }]);
  }
  const ranked = [...candidates.values()];
  // Equal scores go to the file whose own name carries request words: 6545 had 83 rows tied at 4.40 and path order cut both truth files; map-bench F1 .3839 -> .3978.
  const requestStems = new Set([...pass1, ...pass2].flatMap(stemsOf).filter(isTermWord));
  const named = new Map(ranked.map((candidate) => [candidate.path, namedWords(candidate.path.split('/').pop() ?? '', requestStems)]));
  const sorted = ranked.sort((a, b) => b.score - a.score || named.get(b.path)! - named.get(a.path)! || a.path.localeCompare(b.path));
  const pool = sorted.map((candidate) => ({ ...candidate, reasons: [...candidate.reasons] }));
  const perEntity = new Map<string, number>();
  const seedEntities = new Set([...seedPaths].map(entityOf));
  const spread = sorted.filter((candidate) => {
    if (seedPaths.has(candidate.path)) return true;
    const entity = entityOf(candidate.path);
    perEntity.set(entity, (perEntity.get(entity) ?? 0) + 1);
    return perEntity.get(entity)! <= (seedEntities.has(entity) ? MAX_PER_SEED_ENTITY : MAX_PER_ENTITY);
  });
  if (spread.length < sorted.length) limitations.push(`${sorted.length - spread.length} more file(s) in entities already listed`);
  const spreadKept = new Set(spread);
  const spreadDropped = sorted.filter((candidate) => !spreadKept.has(candidate)).map((candidate) => candidate.path);
  const scored = spread.map((candidate) => ({ ...candidate, score: Math.round(candidate.score * 100) / 100 }));
  // The list is as long as the scores say: rows far below the best are noise the reader has to wade through, and one row that stands out is the whole answer; of those that pass, the best TOP_ROWS are listed.
  const ordered = scored.filter((candidate) => candidate.score >= LIST_FLOOR * (scored[0]?.score ?? 0)).slice(0, TOP_ROWS);
  const listDropped = scored.filter((candidate) => !ordered.includes(candidate)).map((candidate) => candidate.path);
  await spansOf(git, ordered, [...new Set([...pass1, ...pass2, ...(input.symbols ?? [])])]);
  // An empty map is said, not dropped: 3 of 10 bench maps were empty (requests in plain words) and the model never learned it had to search.
  const empty = ordered.length === 0;
  if (empty) limitations.push(EMPTY_MAP);
  const document = {
    candidates: ordered.map((candidate) => [candidate.path, candidate.score, candidate.reasons, ...(candidate.spans === undefined ? [] : [candidate.spans])]),
    ...(notes.length === 0 ? {} : { limitations: notes }),
  };
  const text = `${MAP_LEGEND}\n${JSON.stringify(document)}${empty ? `\n${EMPTY_MAP}` : ''}`;
  const bytes = Buffer.byteLength(text);
  return {
    layers, terms: { pass1, pass2 }, candidates: ordered, pool, symbols, collisions, limitations, debug: { folded, spreadDropped, listDropped }, text, bytes,
    entry: { layers, terms: { pass1, pass2 }, candidates: ordered.length, limitations, bytes, ...(collisions.length === 0 ? {} : { collisions }), ...(retrieved === null ? {} : { retrieved }) },
  };
}

// Term extraction for the map: identifiers a request names, in the order that finds code.
/** Plain words are searched only while fewer terms than this are live. Counting identifier-shaped tokens instead (same 3) left a ticket of dead ids without its words; 10-case bench F1 .411 -> .411, suite files 0/7 -> 2/7. */
const PLAIN_LIVE_ENOUGH = 3;
const IDENTIFIER = /[_./-]|\p{Ll}\p{Lu}/u;
/** Like pairs with like (`"…"`, `“…”`, a backtick pair, `'…'`, `‘…’`): a straight opener with a curly closer is no quote. */
const QUOTED = /"([^"\n]{3,60})"|“([^”\n]{3,60})”|`([^`\n]{3,60})`|(?<![\p{L}\p{N}])'([^'\n]{3,60})'(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])‘([^’\n]{3,60})’(?![\p{L}\p{N}])/gu;
const COMPOUND = /[-/]/;
const TICKET_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d+$/;
/** A ticket prefix whose number was left out (`ABC-DEF- title`): the dangling hyphen is where the number goes, so neither it nor its parts name code. */
const NUMBERLESS_TICKET = /^\p{Lu}[\p{Lu}\p{N}]*(?:-\p{Lu}[\p{Lu}\p{N}]*)+-$/u;
const ABBREVIATION = /^(?:e\.g|i\.e|etc|vs|cf)\.?$/i;

/** Words every question about a repository carries; as search terms they match paths like `repository.ts` or `files/`. */
const REQUEST_WORDS = new Set(['repo', 'repository', 'file', 'files', 'change', 'changes', 'implement', 'implemented', 'below', 'above', 'touch', 'section', 'answer', 'question', 'anything', 'investigate', 'read', 'relevant', 'editing', 'explain', 'relative', 'creation', 'creations', 'deletion', 'deletions', 'pre', 'distinguish', 'existing', 'proposed', 'bullet', 'cite', 'evidence', 'assumptions']);

const ACRONYM = /^\p{Lu}{2,6}$/u;
const isIdentifierLike = (token: string): boolean => IDENTIFIER.test(token) || ACRONYM.test(token);

/** URLs, host names, UUIDs, `__`-prefixed attributes and markup carry no names from the code. */
function cleanRequestText(text: string): string {
  return text
    .replace(/!?\[[^\]\n]*\]\([^)\s]*\)/g, ' ')
    .replace(/\b(?:blob:)?https?:\/\/\S+/g, ' ')
    .replace(/<\/?[A-Za-z][^<>\n]{0,300}>/g, ' ')
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, ' ')
    .replace(/\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|dev|cloud)\b/gi, ' ')
    .replace(/(^|[^\w])__\w+/g, '$1 ');
}

/** Markup and punctuation around or inside a quoted label (`Draft.`, `Unit Price*`, `Late (2)`) are not part of the name. */
const plainPhrase = (value: string): string => value.replace(/\(\s*[^()\s]{1,2}\s*\)/g, ' ').replace(/[^\p{L}\p{N}_./ -]+/gu, ' ').replace(/\s+/g, ' ').replace(/^[\s./-]+|[\s./-]+$/g, '');

/** Two or more capitalised words in a row name a thing (`Order Summary`); a sentence's first word is capitalised anyway, so it joins a run only when it is not a function word. */
function capitalisedRuns(text: string): string[] {
  const runs: string[] = [];
  for (const match of text.matchAll(/\p{Lu}\p{Ll}{2,}(?: \p{Lu}\p{Ll}{2,})+/gu)) {
    const words = match[0].split(' ');
    const sentenceStart = /(?:^|[.!?:\n#*>-])\s*$/.test(text.slice(0, match.index));
    if (sentenceStart && (words[0]!.length < 4 || STOPWORDS.has(words[0]!.toLowerCase()))) words.shift();
    if (words.length >= 2) runs.push(words.join(' '));
  }
  return runs;
}

/** A heading, a shell command or a bare directory written in quotes is an instruction about the answer, not a name. */
const isBoilerplate = (value: string): boolean => /^#+\s/.test(value) || /^(?:cd|git|npm|npx|node|ls|cat|grep)\s/.test(value) || /^[\w.-]+\/$/.test(value);
// `pre-change` and `creations/deletions` frame a request like its single words do, and a compound of them names no code.
const isRequestWord = (term: string): boolean => REQUEST_WORDS.has(term.toLowerCase()) || ABBREVIATION.test(term) || (COMPOUND.test(term) && term.split(COMPOUND).every((part) => REQUEST_WORDS.has(part.toLowerCase())));

/** A word-frequency heuristic; identifier-shaped tokens rank first, because naming code names the boundary. */
function termsFromRequirements(sources: readonly { title: string; content: string }[]): string[] {
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
  return [...found.values()].sort((a, b) => Number(b.identifier) - Number(a.identifier) || b.count - a.count || a.order - b.order).map((entry) => entry.term);
}

// Words under 4 letters are not terms (`>= 4` below; STEM_MIN in words.ts has its own evidence): unmeasured, no sweep records the 4.
function tokenize(text: string): string[] {
  const tokens: string[] = [];
  for (const raw of text.split(/[^\p{L}\p{N}_./-]+/u)) {
    const token = raw.replace(/^[./-]+/, '').replace(/[./-]+$/, '');
    if (token.length < MIN_TERM_LENGTH || /^\p{N}+$/u.test(token) || NUMBERLESS_TICKET.test(raw)) continue;
    if (isIdentifierLike(token)) {
      if (ACRONYM.test(token) && STOPWORDS.has(token.toLowerCase())) continue;
      tokens.push(token);
      // `ORD-INV-7` names the order-invoice module and `manuallyAdjustedTotals` the adjustment code: their parts are terms too.
      for (const word of wordsOf(token)) if (word.length >= 4 && !/^\p{N}+$/u.test(word) && !STOPWORDS.has(word)) tokens.push(word);
    } else if (token.length >= 4 && !STOPWORDS.has(token.toLowerCase())) tokens.push(token);
  }
  return tokens;
}

/** Identifiers first, then quoted strings, then plain words (`plain`, searched only while fewer than 3 terms are live) or, with `withProse`, plain words first. */
export function rankTerms(sources: readonly { title: string; content: string }[], options: { withProse?: boolean } = {}): string[] {
  return termsOf(sources, options).terms;
}

function termsOf(sources: readonly { title: string; content: string }[], options: { withProse?: boolean } = {}): { terms: string[]; plain: Set<string> } {
  const clean = sources.map((source) => ({ title: cleanRequestText(source.title), content: cleanRequestText(source.content) }));
  const text = clean.map((source) => `${source.title}\n${source.content}`).join('\n');
  const all = termsFromRequirements(clean).filter((term) => !isRequestWord(term));
  const mined = all.filter((term) => !TICKET_ID.test(term));
  const identifiers = mined.filter(isIdentifierLike);
  const backticked = [...text.matchAll(/`([^`\s]{3,60})`/g)].map((match) => match[1]!).filter((term) => isIdentifierLike(term) && !isBoilerplate(term) && !TICKET_ID.test(term));
  const strings = [...text.matchAll(QUOTED)].map((match) => match.slice(1).find((group) => group !== undefined)!.trim()).filter((value) => !value.startsWith('`') && !isBoilerplate(value)).map(plainPhrase).filter((value) => value.length >= MIN_TERM_LENGTH && /\s|\p{Lu}/u.test(value));
  const ranked = [...new Set([...backticked, ...identifiers, ...strings, ...capitalisedRuns(text)])];
  if (options.withProse === true) {
    const prose = all.filter((term) => !isIdentifierLike(term));
    return { terms: [...new Set([...prose, ...ranked])], plain: new Set() };
  }
  const plain = new Set(all.filter((term) => !isIdentifierLike(term) && !/\s/.test(term) && !ranked.includes(term)));
  return { terms: [...new Set([...ranked, ...plain])], plain };
}

/** A word that can be a search term: long enough and not a stopword. */
const isTermWord = (word: string): boolean => word.length >= MIN_TERM_LENGTH && !STOPWORDS.has(word);

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
  'all', 'and', 'any', 'are', 'but', 'can', 'for', 'has', 'may', 'not', 'the', 'was',
]);
const PATH_LIKE = /(?<![\w./-])((?:\.{0,2}\/)?[\w@.-]+(?:\/[\w@.-]+)+)(?::\d+(?:-\d+)?)?/g;
const CODE_SHAPED = /`([^`\s]{2,80})`|\b([A-Za-z_$][\w$]*(?:[a-z0-9][A-Z]|_[A-Za-z0-9])[\w$]*)\b/g;
/** A path, or a file name with a short lowercase extension: not a symbol. */
const FILE_LIKE = /\/|^[\w@-]+(?:\.[\w-]+)*\.[a-z]{1,5}$/;

/** Tracked files the text cites by path (an optional `:line` is dropped); a cited path that is not tracked seeds nothing. */
export function pathsCitedIn(text: string, files: readonly string[]): string[] {
  const tracked = new Set(files);
  const cited = [...text.matchAll(PATH_LIKE)].map((match) => match[1]!.replace(/^\.\//, '').replace(/[.,;:]+$/, ''));
  return [...new Set(cited.filter((file) => tracked.has(file)))];
}

/** Backticked or code-shaped names (camelCase, snake_case); a dotted name keeps its last segment. */
export function symbolsCitedIn(text: string): string[] {
  const tokens = [...text.matchAll(CODE_SHAPED)].map((match) => match[1] ?? match[2] ?? '').filter((token) => !FILE_LIKE.test(token));
  const names = tokens.map((token) => token.replace(/\(\)$/, '').split('.').at(-1) ?? '');
  return [...new Set(names.filter((name) => /^[A-Za-z_$][\w$]{2,}$/.test(name)))];
}
