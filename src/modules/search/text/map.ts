import path from 'node:path';
import { openWorkspace } from '#modules/config/workspace';
import { SEARCH_LAYER_DEFAULTS } from '#types/defaults';
import { contentHash, hash12 } from '#util/hash';
import type { ProjectConfig, SearchConfig } from '#types/modules/config';
import { literalPathspec } from '#platform/git/git';
import { AmbicodeError } from '#util/errors';
import { matchesAnyGlob } from '#util/glob';
import { normalizeRelative } from '#util/paths';
import { pathExclusionReason } from '#util/path-classes';
import { harvest } from '../declarations/harvest.ts';
import { declarationPatternsOf, profileOf, readCatalog, testPatternsOf } from '../declarations/profile.ts';
import { cachedSearch, isPathReason, locate, termsFromRequirements } from './locate.ts';
import { formatIndexStatus, indexAdapterFor, ledgerIndex } from '../code-index/adapter.ts';
import { indexDepsOf } from '../code-index/codeindex.ts';
import { breadthGuard } from '../declarations/refs.ts';
import type { Runtime } from '#types/composition';
import { COMMON_NAMES, TEST_CANDIDATES, SCORE_FILENAME, SEARCH_TUNING_DEFAULTS, type SearchTuning, type IndexAdapter, type IndexStatus, type MapCandidate, type MapSymbol, type MapFeature, type Declaration } from '#types/modules/search';

const LAYER_NAMES = ['grep', 'shortlist', 'harvest', 'history', 'index.find', 'index.relates'] as const;
type LayerName = (typeof LAYER_NAMES)[number];

interface MapLayer { name: LayerName; ms: number; hits: number }

export interface MapResult {
  mode: 'prompt' | 'context';
  layers: MapLayer[];
  layersSource: 'config' | 'default' | 'route';
  terms: { pass1: string[]; pass2: string[] };
  candidates: MapCandidate[];
  /** Every candidate in rank order; `candidates` is the part the 6 KiB text kept. */
  ranked: MapCandidate[];
  symbols: Record<string, MapSymbol[]>;
  collisions: string[];
  feature: MapFeature | null;
  limitations: string[];
  index: IndexStatus;
  omitted: number;
  /** The first line is the layer list; the rest is compact JSON. At most 6,144 bytes. */
  text: string;
  bytes: number;
  tuningHash: string;
  /** The `map` ledger entry's fields. */
  entry: Record<string, unknown>;
}

export const MAP_LIMIT_BYTES = 6144;

export interface ResolvedTuning { tuning: SearchTuning; hash: string; overrides: string[] }

/** The defaults with the config's `search.tuning` applied; the hash covers every value, so a changed default changes it too. */
export function resolveTuning(search: Pick<SearchConfig, 'tuning'>): ResolvedTuning {
  const given = search.tuning ?? {};
  const keys = Object.keys(SEARCH_TUNING_DEFAULTS) as (keyof SearchTuning)[];
  const tuning = { ...SEARCH_TUNING_DEFAULTS, ...Object.fromEntries(keys.flatMap((key) => (given[key] === undefined ? [] : [[key, given[key]]]))) } as SearchTuning;
  const hash = hash12(contentHash(JSON.stringify(keys.map((key) => [key, tuning[key]]))));
  return { tuning, hash, overrides: keys.filter((key) => tuning[key] !== SEARCH_TUNING_DEFAULTS[key]) };
}

export function resolveLayers(search: SearchConfig, mode: 'prompt' | 'context'): { layers: string[]; source: 'config' | 'default' } {
  const configured = search.layers?.[mode];
  return configured === undefined ? { layers: [...SEARCH_LAYER_DEFAULTS[mode]], source: 'default' } : { layers: configured, source: 'config' };
}

const IDENTIFIER = /[_./-]|\p{Ll}\p{Lu}/u;
const QUOTED = /["“`]([^"”`\n]{3,60})["”`]/g;
const CANDIDATE_PATHS = 20;

/** Words every question about a repository carries; as search terms they match paths like `repository.ts` or `files/`. */
const REQUEST_WORDS = new Set(['repo', 'repository', 'file', 'files', 'change', 'changes', 'implement', 'implemented', 'below', 'above', 'touch', 'section', 'answer', 'question', 'anything', 'investigate', 'read', 'relevant', 'editing', 'explain', 'relative', 'creation', 'creations', 'deletion', 'deletions', 'pre', 'distinguish', 'existing', 'proposed', 'bullet', 'cite', 'evidence', 'assumptions']);
const COMPOUND = /[-/]/;

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
const ABBREVIATION = /^(?:e\.g|i\.e|etc|vs|cf)\.?$/i;
// `pre-change` and `creations/deletions` frame a request like its single words do, and a compound of them names no code.
const isRequestWord = (term: string): boolean => REQUEST_WORDS.has(term.toLowerCase()) || ABBREVIATION.test(term) || (COMPOUND.test(term) && term.split(COMPOUND).every((part) => REQUEST_WORDS.has(part.toLowerCase())));
const TICKET_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z][A-Z0-9]*)*-\d+$/;

/** `MO-REBA-11` matches no code, but `reba` names its module's directory: keep the parts some path segment spells. */
function ticketParts(ids: readonly string[], files: readonly string[]): string[] {
  if (ids.length === 0 || files.length === 0) return [];
  const segments = new Set(files.flatMap((file) => file.toLowerCase().split(/[/._-]/)));
  return [...new Set(ids.flatMap((id) => id.toLowerCase().split('-')))].filter((part) => /^[a-z][a-z0-9]{2,}$/.test(part) && segments.has(part));
}

/** Identifiers first, then quoted UI strings (as i18n keys when such files exist), prose only when identifiers are scarce. */
export async function rankTerms(
  sources: readonly { title: string; content: string }[],
  options: { runtime: Runtime; root: string; project: ProjectConfig; files: readonly string[]; withProse?: boolean; tuning?: SearchTuning },
): Promise<string[]> {
  const { maxTerms, proseRetryTerms } = options.tuning ?? SEARCH_TUNING_DEFAULTS;
  const clean = sources.map((source) => ({ title: cleanRequestText(source.title), content: cleanRequestText(source.content) }));
  const text = clean.map((source) => `${source.title}\n${source.content}`).join('\n');
  const all = termsFromRequirements(clean, 60).filter((term) => !isRequestWord(term));
  const parts = ticketParts(all.filter((term) => TICKET_ID.test(term)), options.files);
  const mined = all.filter((term) => !TICKET_ID.test(term)).slice(0, maxTerms);
  const identifiers = mined.filter((term) => IDENTIFIER.test(term));
  const backticked = [...text.matchAll(/`([^`\s]{3,60})`/g)].map((match) => match[1]!).filter((term) => IDENTIFIER.test(term) && !isBoilerplate(term) && !TICKET_ID.test(term));
  const strings = [...text.matchAll(QUOTED)].map((match) => match[1]!.trim()).filter((value) => /\s|\p{Lu}/u.test(value) && !/^[`]/.test(value) && !isBoilerplate(value));
  const keys = await i18nKeys(options, strings, text, maxTerms);
  const ranked = [...new Set([...backticked, ...parts, ...identifiers, ...keys])];
  if (options.withProse === true) {
    const prose = termsFromRequirements(clean, 60).filter((term) => !IDENTIFIER.test(term) && !isRequestWord(term)).slice(0, proseRetryTerms);
    return [...new Set([...prose, ...ranked])].slice(0, maxTerms);
  }
  // Catalog keys and UI strings say what screen, not which code: they do not count as identifiers here.
  if (new Set([...backticked, ...parts, ...identifiers]).size < 3) {
    const prose = mined.filter((term) => !IDENTIFIER.test(term)).flatMap((term) => term.split('-').filter((part) => part.length >= 3));
    ranked.push(...prose);
  }
  return [...new Set(ranked)].slice(0, maxTerms);
}

const ENGLISH_CATALOG = /(^|[/._-])en([._-][a-z]{2})?\.\w+$/i;
const spacing = (value: string): string => value.replace(/\s+/g, ' ').trim();
const phraseOf = (value: string): string => spacing(value).toLowerCase();

/** Keys of catalog values equal to a quoted string (any case), or to a 2–5 word phrase the request spells unquoted in the same case. */
async function i18nKeys(options: { runtime: Runtime; root: string; project: ProjectConfig; files: readonly string[] }, strings: readonly string[], text: string, maxTerms: number): Promise<string[]> {
  const globs = [...profileOf(options.project).catalogs];
  const catalogs = options.files
    .filter((file) => globs.length > 0 && matchesAnyGlob(file, globs))
    .sort((a, b) => Number(!ENGLISH_CATALOG.test(a)) - Number(!ENGLISH_CATALOG.test(b)) || a.localeCompare(b))
    .slice(0, 5);
  if (catalogs.length === 0) return [...strings];
  const wanted = new Set(strings.map(phraseOf));
  const spoken = ` ${spacing(text.replace(/[^\p{L}\p{N}\s'-]/gu, ' '))} `;
  const found: string[] = [];
  const spelledKeys: string[] = [];
  const walk = (value: unknown, prefix: string): void => {
    if (typeof value === 'string') {
      const phrase = phraseOf(value);
      const words = phrase.split(' ').length;
      const spelled = words >= 2 && words <= 5 && /^[\p{L}\p{N} '-]+$/u.test(phrase) && spoken.includes(` ${spacing(value)} `);
      if (wanted.has(phrase)) found.push(prefix);
      else if (spelled) spelledKeys.push(prefix);
    } else if (typeof value === 'object' && value !== null) {
      for (const [key, child] of Object.entries(value)) walk(child, prefix === '' ? key : `${prefix}.${key}`);
    }
  };
  for (const file of catalogs) {
    try {
      walk(readCatalog(await options.runtime.fs.readText(path.join(options.root, file)), path.posix.extname(file).slice(1).toLowerCase()), '');
    } catch {
      // An unreadable catalog contributes nothing.
    }
  }
  const keys = [...new Set([...found, ...spelledKeys])].slice(0, maxTerms);
  return found.length === 0 ? [...strings, ...keys] : keys;
}

const names = (declarations: readonly Declaration[]): string[] => [...new Set(declarations.map((declaration) => declaration.name))];

export async function buildMap(input: {
  runtime: Runtime;
  project: ProjectConfig;
  mode: 'prompt' | 'context';
  layers: readonly string[];
  layersSource: 'config' | 'default' | 'route';
  terms: readonly string[];
  paths: readonly string[];
  symbols: readonly string[];
  /** Absent: the configured adapter (05-A1). */
  index?: IndexAdapter;
  /** Absent: the defaults. */
  tuning?: ResolvedTuning;
}): Promise<MapResult> {
  const resolved = input.tuning ?? resolveTuning({});
  const tune = resolved.tuning;
  const unknown = input.layers.filter((layer) => !(LAYER_NAMES as readonly string[]).includes(layer));
  if (unknown.length > 0) {
    throw new AmbicodeError('search-layer-unknown', `Unknown search layer: ${unknown.join(', ')}.`, { details: [`Known layers: ${LAYER_NAMES.join(', ')}. Fix search.layers in .ambicode/config.yaml.`] });
  }
  const { runtime, project } = input;
  const { git, repositoryRoot, config } = await openWorkspace(runtime);
  const index = input.index ?? indexAdapterFor(indexDepsOf(runtime, git, repositoryRoot, config), project);
  let indexState: IndexStatus = await index.status(project);
  const projectRoot = normalizeRelative(project.root);
  const pathspec = projectRoot === '' ? null : literalPathspec(projectRoot);
  const limitations: string[] = [];
  const layers: MapLayer[] = [];
  const candidates = new Map<string, MapCandidate>();
  let declarations: Declaration[] = [];
  const pass1 = [...input.terms].slice(0, tune.maxTerms);
  let pass2: string[] = [];
  let shortlists = 0;
  const search = cachedSearch(git);
  const listed = input.mode === 'prompt' ? await search.listFiles(pathspec) : [];
  const sequence = sequenceFiles(listed, tune);
  let downweighted = 0;
  let harvested = 0;

  const merge = (found: readonly MapCandidate[]): void => {
    for (const candidate of found) {
      const existing = candidates.get(candidate.path);
      if (existing === undefined) candidates.set(candidate.path, { ...candidate, reasons: [...candidate.reasons] });
      else {
        existing.score = Math.max(existing.score, candidate.score);
        existing.reasons.push(...candidate.reasons.filter((reason) => !existing.reasons.includes(reason)));
      }
    }
  };
  const topFiles = (): string[] => [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, tune.topFiles).map((candidate) => candidate.path);
  // Names harvested from a file found only by its contents pull in a sibling feature; a path hit says where the request lives.
  const harvestFiles = (): string[] => {
    const ranked = [...candidates.values()].filter((candidate) => !sequence.has(candidate.path)).sort((a, b) => b.score - a.score);
    const placed = ranked.filter((candidate, index) => index === 0 || candidate.reasons.some(isPathReason));
    return placed.slice(0, tune.topFiles).map((candidate) => candidate.path);
  };
  let placedDirs: string[] = [];
  const timed = async (name: LayerName, run: () => Promise<number>): Promise<void> => {
    const started = runtime.clock.elapsed();
    const hits = await run();
    layers.push({ name, ms: Math.max(0, Math.round(runtime.clock.elapsed() - started)), hits });
  };
  for (const known of input.paths) merge([{ path: known, score: 10, reasons: ['named by the caller'] }]);

  for (const layer of input.layers as readonly LayerName[]) {
    if (layer === 'index.find' || layer === 'index.relates') {
      const queries = layer === 'index.find' ? names(declarations).slice(0, tune.pass2Names) : [...input.paths];
      const started = runtime.clock.elapsed();
      const found = new Map<string, string[]>();
      let skipped: IndexStatus | null = indexState.state === 'fresh' || indexState.state === 'stale' ? null : indexState;
      for (const query of skipped === null ? queries : []) {
        const answer = layer === 'index.find' ? await index.find(query) : await index.relates(query);
        indexState = answer.status;
        if (!answer.ok) {
          skipped = answer.status;
          break;
        }
        const hits = Array.isArray(answer.value) ? answer.value.map((row) => row.path) : answer.value.importers;
        for (const file of new Set(hits)) found.set(file, [...(found.get(file) ?? []), `${layer} ${query}`]);
      }
      if (skipped !== null) limitations.push(`${layer} skipped — ${formatIndexStatus(skipped)}`);
      else {
        // One filename's weight per distinct name or path that led here (D4).
        merge([...found].map(([file, reasons]) => ({ path: file, score: 0, reasons })));
        for (const [file, reasons] of found) candidates.get(file)!.score += SCORE_FILENAME * reasons.length;
        layers.push({ name: layer, ms: Math.max(0, Math.round(runtime.clock.elapsed() - started)), hits: found.size });
      }
    } else if (layer === 'history') {
      await timed(layer, async () => 0);
      limitations.push('history runs inside shortlist.');
    } else if (layer === 'shortlist') {
      shortlists += 1;
      const second = shortlists > 1;
      // Harvested names take the second half, so a full first pass still lets them in.
      const used = second ? [...new Set([...pass1.slice(0, tune.maxTerms - tune.pass2Names), ...names(declarations).slice(0, tune.pass2Names), ...pass1.slice(tune.maxTerms - tune.pass2Names)])].slice(0, tune.maxTerms) : pass1;
      if (second) pass2 = used;
      await timed(layer, async () => {
        const found = await locate({ git: search, project, terms: used, limit: 20 });
        if (!second) placedDirs = [...new Set(found.candidates.filter((candidate) => candidate.reasons.some(isPathReason)).map((candidate) => path.posix.dirname(candidate.path)))];
        const outside = (file: string): boolean => placedDirs.length > 0 && !candidates.has(file) && !placedDirs.some((dir) => file.startsWith(`${dir}/`));
        merge(
          second
            ? found.candidates.map((candidate) => {
                if (!outside(candidate.path)) return candidate;
                downweighted += 1;
                return { ...candidate, score: candidate.score * tune.pass2Outside };
              })
            : found.candidates,
        );
        for (const line of found.limitations) if (!limitations.includes(line)) limitations.push(line);
        return found.candidates.length;
      });
    } else if (layer === 'harvest') {
      await timed(layer, async () => {
        const files = input.mode === 'context' ? [...new Set([...input.paths, ...topFiles()])].slice(0, tune.topFiles) : harvestFiles();
        harvested = files.length;
        declarations = await harvest(runtime.fs, repositoryRoot, files, profileOf(project).exportOnly, declarationPatternsOf(project));
        return declarations.length;
      });
    } else {
      await timed(layer, async () => {
        const guard = await breadthGuard(git, project, [...new Set([...input.symbols, ...input.terms.filter((term) => IDENTIFIER.test(term))])].filter((word) => !COMMON_NAMES.has(word)));
        for (const line of guard.limitations) if (!limitations.includes(line)) limitations.push(line);
        const words = guard.kept;
        const files = words.length === 0 ? [] : (await git.grepWords(words, pathspec)).filter((file) => pathExclusionReason(file) === null);
        merge(files.map((file) => ({ path: file, score: 2, reasons: [`contains the word ${words.length === 1 ? `"${words[0]}"` : 'of the request'}`] })));
        return files.length;
      });
    }
  }

  const collisions = [...new Set(declarations.filter((declaration) => declaration.declarations > 1).map((declaration) => declaration.name))];
  const symbolRows: Record<string, MapSymbol[]> = {};
  for (const term of [...pass1, ...pass2]) {
    const lower = term.toLowerCase();
    const rows = declarations.filter((declaration) => declaration.name.toLowerCase() === lower || declaration.name.toLowerCase().includes(lower)).slice(0, 3);
    if (rows.length > 0 && symbolRows[term] === undefined) {
      symbolRows[term] = rows.map((row) => ({ name: row.name, kind: row.kind, at: `${row.path}:${row.line}`, declarations: row.declarations, collides: row.declarations > 1 }));
    }
  }
  const ordered = [...candidates.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path)).map((candidate) => {
    const spans = declarations.filter((declaration) => declaration.path === candidate.path).slice(0, tune.spansPerCandidate).map((declaration) => `${declaration.name}:${declaration.line}`);
    return { ...candidate, score: Math.round(candidate.score * 100) / 100, reasons: [...candidate.reasons.slice(0, 2), ...candidate.reasons.slice(2).filter((reason) => reason.startsWith('index.'))], ...(spans.length === 0 ? {} : { spans }) };
  });

  if (sequence.size > 0) ordered.sort((a, b) => Number(sequence.has(a.path)) - Number(sequence.has(b.path)));
  const feature = input.mode === 'prompt' ? featureOf(ordered, listed.filter((file) => !sequence.has(file)), profileOf(project).featureKinds, [...pass1, ...pass2], pass1, testPatternsOf(project), tune) : null;
  if (input.mode === 'prompt') await anchor(ordered.slice(0, tune.leads), declarations, [...new Set([...pass1, ...pass2])], git);
  const head = `layers: ${layers.map((layer) => layer.name).join(' → ') || 'none'} (${input.layersSource}); ${formatIndexStatus(indexState)}`;
  const render = (kept: readonly MapCandidate[]): string => {
    const document = {
      terms: { pass1, pass2 },
      candidates: kept.map((candidate) => [candidate.path, candidate.score, candidate.reasons, ...(candidate.spans === undefined ? [] : [candidate.spans])]),
      ...(Object.keys(symbolRows).length === 0 ? {} : { symbols: symbolRows }),
      ...(collisions.length === 0 ? {} : { collides: collisions }),
      ...(kept.length < ordered.length ? { omitted: ordered.length - kept.length } : {}),
      limitations,
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
  return {
    mode: input.mode,
    layers,
    layersSource: input.layersSource,
    terms: { pass1, pass2 },
    candidates: kept,
    ranked: ordered,
    symbols: symbolRows,
    collisions,
    feature,
    limitations,
    index: indexState,
    omitted: ordered.length - kept.length,
    text,
    bytes,
    tuningHash: resolved.hash,
    entry: { mode: input.mode, layers, layersSource: input.layersSource, terms: { pass1, pass2 }, candidates: ordered.length, limitations, index: ledgerIndex(indexState), collisions, bytes, serialized: kept.length, ...(feature === null ? {} : { feature: { root: feature.root, paths: feature.paths.length } }), candidatePaths: ordered.slice(0, CANDIDATE_PATHS).map((candidate) => candidate.path), tuning: { hash: resolved.hash, overrides: resolved.overrides }, profile: project.profile?.stamp ?? null, decisions: { sequenceFiles: sequence.size, pass2Downweighted: downweighted, harvestFiles: harvested, feature: feature === null ? null : feature.root === '' ? 'named' : 'folder', proseRetry: false } },
  };
}

const SEQUENCE_NAME = /^(?:v\d+__|\d{3,}|\d{4}-\d\d-\d\d)/i;

/** Files of directories whose names mostly start with a number or date (migrations and the like): written once, rarely the change. */
export function sequenceFiles(files: readonly string[], tune: SearchTuning = SEARCH_TUNING_DEFAULTS): Set<string> {
  const byDir = new Map<string, string[]>();
  for (const file of files) byDir.set(path.posix.dirname(file), [...(byDir.get(path.posix.dirname(file)) ?? []), file]);
  const out = new Set<string>();
  for (const group of byDir.values()) {
    if (group.length >= tune.sequenceDirMin && group.filter((file) => SEQUENCE_NAME.test(path.posix.basename(file))).length / group.length >= tune.sequenceShare) group.forEach((file) => out.add(file));
  }
  return out;
}

export const LEADS_LIMIT_BYTES = 1200;
export const FEATURE_LIMIT_BYTES = 400;
const REASON_CHARS = 90;
/** Two request terms still say what the leads were searched for; past that, a term costs a path its room. */
const MIN_TERMS_SHOWN = 2;
const stemOf = (file: string): string => path.posix.basename(file).split('.')[0]!;
const kindOf = (file: string): string => path.posix.basename(file).split('.').slice(1, -1).join('.');

/**
 * The deepest directory (two segments or more) holding the most top leads found by their path, at least two; its files whose
 * name stem is a lead's stem or the directory's own name, and that are tests or of a profile feature kind (`x.<kind>.ext`). Executable
 * siblings are left out: answers took them as changed when they were not.
 */
export function featureOf(ordered: readonly MapCandidate[], files: readonly string[], featureKinds: readonly string[] = [], terms: readonly string[] = [], requested: readonly string[] = terms, tests: readonly RegExp[] = TEST_CANDIDATES, tune: SearchTuning = SEARCH_TUNING_DEFAULTS): MapFeature | null {
  return folderFeature(ordered, files, featureKinds, tests, tune) ?? namedFeature(ordered, files, terms, requested, tune);
}

const tokensOf = (text: string): string[] => text.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const sameWord = (a: string, b: string): boolean => a === b || a === `${b}s` || b === `${a}s` || (a.endsWith('ies') && b === `${a.slice(0, -3)}y`) || (b.endsWith('ies') && a === `${b.slice(0, -3)}y`);
const layerOf = (file: string): string => file.split('/').slice(0, -1).slice(0, 2).join('/');
const singular = (word: string): string => (word.endsWith('ies') ? `${word.slice(0, -3)}y` : word.endsWith('s') ? word.slice(0, -1) : word);

/** Code split by layer: most file-name words found in two or more top folders are found in three or more. */
function layered(files: readonly string[], tune: SearchTuning): boolean {
  const where = new Map<string, Set<string>>();
  for (const file of files) {
    for (const word of new Set(tokensOf(stemOf(file)).filter((token) => token.length >= 4).map(singular))) where.set(word, (where.get(word) ?? new Set()).add(layerOf(file)));
  }
  const spread = [...where.values()].filter((layers) => layers.size >= 2);
  return spread.length > 0 && spread.filter((layers) => layers.size >= tune.layerMin).length / spread.length >= tune.layeredShare;
}
const namesFile = (file: string, name: string): boolean => [...tokensOf(stemOf(file)), ...file.split('/').slice(0, -1)].some((word) => sameWord(word, name));

/**
 * Code split by layer: a word of the terms that names files (by stem or directory) in three or more top folders and no more than
 * sixty files; the word most top leads' paths carry wins. Lists those files one folder at a time.
 */
function namedFeature(ordered: readonly MapCandidate[], files: readonly string[], terms: readonly string[], requested: readonly string[], tune: SearchTuning): MapFeature | null {
  const usable = files.filter((file) => pathExclusionReason(file) === null && !stemOf(file).startsWith('_'));
  if (!layered(usable, tune)) return null;
  const leads = ordered.slice(0, tune.leads).map((candidate) => candidate.path);
  let best: { name: string; hits: string[]; carried: number } | null = null;
  for (const name of new Set(terms.flatMap(tokensOf).filter((word) => word.length >= 4))) {
    const hits = usable.filter((file) => namesFile(file, name));
    if (hits.length === 0 || hits.length > tune.nameMaxFiles || new Set(hits.map(layerOf)).size < tune.layerMin) continue;
    const carried = leads.filter((file) => namesFile(file, name)).length;
    if (carried > 0 && (best === null || carried > best.carried || (carried === best.carried && hits.length < best.hits.length))) best = { name, hits, carried };
  }
  if (best === null) return null;
  const listed = new Set(leads);
  const word = best.name;
  const others = [...new Set(requested.flatMap(tokensOf).filter((token) => token.length >= 4 && !sameWord(token, word)))];
  const extra = (file: string): number => others.filter((other) => tokensOf(stemOf(file)).some((token) => sameWord(token, other))).length;
  const rest = best.hits.filter((hit) => !listed.has(hit)).sort((a, b) => extra(b) - extra(a) || a.localeCompare(b));
  const strong = rest.filter((file) => leadsWith(file, word) || extra(file) > 0);
  const paths = [...byLayers(strong), ...byLayers(rest.filter((file) => !strong.includes(file)))].slice(0, tune.featurePaths);
  return paths.length === 0 ? null : { root: '', paths, name: word };
}

/** The file is about the word: a directory is named by it, or its stem starts with it (after a `test` prefix). */
const leadsWith = (file: string, word: string): boolean =>
  file.split('/').slice(0, -1).some((segment) => sameWord(segment, word)) || sameWord(tokensOf(stemOf(file)).filter((token) => token !== 'test')[0] ?? '', word);

function byLayers(files: readonly string[]): string[] {
  const groups = new Map<string, string[]>();
  for (const file of files) groups.set(layerOf(file), [...(groups.get(layerOf(file)) ?? []), file]);
  const out: string[] = [];
  for (let round = 0; [...groups.values()].some((group) => group.length > round); round += 1) for (const group of groups.values()) if (group[round] !== undefined) out.push(group[round]!);
  return out;
}

function folderFeature(ordered: readonly MapCandidate[], files: readonly string[], featureKinds: readonly string[], tests: readonly RegExp[], tune: SearchTuning): MapFeature | null {
  const top = ordered.slice(0, tune.featureLeads).filter((candidate) => candidate.reasons.some(isPathReason)).map((candidate) => candidate.path);
  let best: { root: string; count: number } | null = null;
  for (const lead of top) {
    const parts = lead.split('/').slice(0, -1);
    for (let depth = parts.length; depth >= 2; depth -= 1) {
      const root = parts.slice(0, depth).join('/');
      const count = top.filter((file) => file.startsWith(`${root}/`)).length;
      if (count >= 2 && (best === null || count > best.count || (count === best.count && depth > best.root.split('/').length))) best = { root, count };
    }
  }
  if (best === null) return null;
  const { root } = best;
  const listed = new Set(ordered.slice(0, tune.leads).map((candidate) => candidate.path));
  const stems = new Set([path.posix.basename(root), ...top.filter((file) => file.startsWith(`${root}/`)).map(stemOf)]);
  const paths = files
    .filter((file) => file.startsWith(`${root}/`) && !listed.has(file) && pathExclusionReason(file) === null && stems.has(stemOf(file)) && (tests.some((pattern) => pattern.test(file)) || featureKinds.includes(kindOf(file))))
    .sort()
    .slice(0, tune.featurePaths);
  return paths.length === 0 ? null : { root, paths };
}

/**
 * The harvest keeps a declaration's first line only, so its span runs to the line before the next declaration in the file,
 * kept between 15 and 60 lines. Over this repository's src (2266 declarations, 253 files) the gap to the next declaration is
 * p25 3, p50 8, p75 15, p90 29, p95 47 lines: 15 keeps a span from shrinking to a signature, 60 clears p95. `read` clamps at the end of the file.
 */
export const SPAN_MIN_LINES = 15;
export const SPAN_MAX_LINES = 60;
export function spanEnd(declaration: Declaration, declarations: readonly Declaration[]): number {
  const next = declarations.filter((other) => other.path === declaration.path && other.line > declaration.line).reduce((least, other) => Math.min(least, other.line), Infinity);
  const length = Math.min(SPAN_MAX_LINES, Math.max(SPAN_MIN_LINES, next - declaration.line));
  return declaration.line + length - 1;
}

async function anchor(leads: MapCandidate[], declarations: readonly Declaration[], terms: readonly string[], git: { firstLines(terms: readonly string[], files: readonly string[]): Promise<Map<string, number>> }): Promise<void> {
  const lower = terms.map((term) => term.toLowerCase());
  for (const lead of leads) {
    const named = declarations.find((declaration) => declaration.path === lead.path && lower.some((term) => declaration.name.toLowerCase().includes(term)));
    if (named !== undefined) {
      lead.line = named.line;
      lead.end = spanEnd(named, declarations);
    }
  }
  const lines = await git.firstLines(terms, leads.filter((lead) => lead.line === undefined).map((lead) => lead.path));
  for (const lead of leads) if (lead.line === undefined && lines.has(lead.path)) lead.line = lines.get(lead.path)!;
}

export interface Leads { text: string; leads: string[]; feature: string[]; operands: string[]; bytes: number; hash: string }

/**
 * Cap of the operands on the `read:` line, the command prefix not counted: the plugin path and the task slug differ per
 * environment, and counting them would change which leads are read first. Operands drop whole from the last lead.
 */
export const READ_LINE_LIMIT_BYTES = 400;
const operandOf = (candidate: MapCandidate): string => (candidate.line === undefined ? candidate.path : `${candidate.path}:${candidate.line}${candidate.end === undefined ? '' : `-${candidate.end}`}`);

function readLine(command: string, operands: readonly string[]): { line: string; operands: string[] } | null {
  const line = (count: number): string => `read: ${command} ${operands.slice(0, count).join(' ')}`;
  let count = operands.length;
  while (count > 0 && Buffer.byteLength(operands.slice(0, count).join(' ')) > READ_LINE_LIMIT_BYTES) count -= 1;
  return count === 0 ? null : { line: line(count), operands: operands.slice(0, count) };
}

/**
 * The route's short form of a map: the terms, then the top ranked candidates with their first reason, one per line.
 * Taken from the ranking, not the 6 KiB serialized map. Paths keep their room first: over the budget, the term list
 * shortens, then reasons drop from the last lead up, and only then do leads drop.
 */
export function leadsOf(map: Pick<MapResult, 'terms' | 'candidates' | 'collisions'> & { ranked?: readonly MapCandidate[]; feature?: MapFeature | null; tuningHash?: string; readCommand?: string }, leadCount: number = SEARCH_TUNING_DEFAULTS.leads): Leads {
  const added = map.terms.pass2.filter((term) => !map.terms.pass1.includes(term));
  const terms = [...map.terms.pass1, ...added];
  const header = (shown: number): string => {
    const first = terms.slice(0, Math.min(shown, map.terms.pass1.length));
    const then = terms.slice(map.terms.pass1.length, Math.max(map.terms.pass1.length, shown));
    const more = terms.length - shown;
    return `Leads from the terms ${first.join(', ') || '(none)'}${then.length === 0 ? '' : `; then ${then.join(', ')}`}${more > 0 ? ` (+${more} more)` : ''}:`;
  };
  const picked = (map.ranked ?? map.candidates).slice(0, leadCount);
  const row = (candidate: MapCandidate, index: number, withReason: boolean): string => {
    const reason = withReason ? (candidate.reasons[0] ?? '') : '';
    return `${index + 1}. ${operandOf(candidate)}${reason === '' ? '' : ` — ${reason.length > REASON_CHARS ? `${reason.slice(0, REASON_CHARS - 1)}…` : reason}`}`;
  };
  const collides = map.collisions.length === 0 ? [] : [`Declared more than once: ${map.collisions.slice(0, 6).join(', ')}.`];
  let shown = terms.length;
  let reasons = picked.length;
  let kept = picked.length;
  const tuning = map.tuningHash === undefined ? [] : [`tuning: ${map.tuningHash}`];
  const text = (): string => [...tuning, header(shown), ...picked.slice(0, kept).map((candidate, index) => row(candidate, index, index < reasons)), ...collides].join('\n');
  const over = (): boolean => Buffer.byteLength(text()) > LEADS_LIMIT_BYTES;
  while (over() && shown > MIN_TERMS_SHOWN) shown -= 1;
  while (over() && reasons > 0) reasons -= 1;
  while (over() && kept > 0) kept -= 1;
  const feature = map.feature === undefined || map.feature === null ? null : featureLine(map.feature);
  const shownLeads = picked.slice(0, kept);
  const render = (command: string | undefined): { text: string; operands: string[] } => {
    const ready = command === undefined ? null : readLine(command, shownLeads.map(operandOf));
    const text = [...tuning, header(shown), ...shownLeads.map((candidate, index) => row(candidate, index, index < reasons)), ...(ready === null ? [] : [ready.line]), ...(feature === null ? [] : [feature.line]), ...collides].join('\n');
    return { text, operands: ready?.operands ?? [] };
  };
  const out = render(map.readCommand);
  // The hash names what the map said, not where the plugin is installed or which task asked: the command is hashed as a placeholder.
  const hashed = map.readCommand === undefined ? out : render('{cli} read --task {task}');
  return { text: out.text, leads: shownLeads.map((candidate) => candidate.path), feature: feature?.paths ?? [], operands: out.operands, bytes: Buffer.byteLength(out.text), hash: hash12(contentHash(hashed.text)) };
}

export const leadsText = (...args: Parameters<typeof leadsOf>): string => leadsOf(...args).text;

function featureLine(feature: MapFeature): { line: string; paths: string[] } {
  const relative = feature.root === '' ? feature.paths : feature.paths.map((file) => file.slice(feature.root.length + 1));
  const label = feature.root === '' ? `Same feature "${feature.name ?? ''}"` : `Same feature (${feature.root}/)`;
  const line = (count: number): string => `${label}: ${relative.slice(0, count).join(', ')}${count < relative.length ? ', …' : ''}`;
  let count = relative.length;
  while (count > 1 && Buffer.byteLength(line(count)) > FEATURE_LIMIT_BYTES) count -= 1;
  return { line: line(count), paths: feature.paths.slice(0, count) };
}
