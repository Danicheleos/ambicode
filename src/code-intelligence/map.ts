import path from 'node:path';
import { openRepository, type Runtime } from '../composition/root.ts';
import { SEARCH_LAYER_DEFAULTS } from '../config/defaults.ts';
import { ecosystemFacts } from '../config/ecosystems.ts';
import type { ProjectConfig, SearchConfig } from '../contracts/config.ts';
import { literalPathspec } from '../git/git.ts';
import { AmbicodeError } from '../util/errors.ts';
import { matchesAnyGlob } from '../util/glob.ts';
import { normalizeRelative } from '../util/paths.ts';
import { COMMON_NAMES } from './dependents.ts';
import { isTestPath, pathExclusionReason } from '../snapshot/exclusions.ts';
import { harvest, type Declaration } from './harvest.ts';
import { isPathReason, locate, termsFromRequirements } from './locate.ts';

export const LAYER_NAMES = ['grep', 'shortlist', 'harvest', 'history', 'index.find', 'index.relates'] as const;
export type LayerName = (typeof LAYER_NAMES)[number];

export interface MapLayer { name: LayerName; ms: number; hits: number }
/** `line`: where the model starts reading, a declaration named like a term or the first line holding one (prompt mode). */
export interface MapCandidate { path: string; score: number; reasons: string[]; spans?: string[]; line?: number }
export interface MapSymbol { name: string; kind: string; at: string; declarations: number; collides: boolean }
/** The directory most top leads share, and its files named like those leads or like the directory itself. */
export interface MapFeature { root: string; paths: string[] }

export interface MapResult {
  mode: 'prompt' | 'context';
  layers: MapLayer[];
  layersSource: 'config' | 'default' | 'route';
  terms: { pass1: string[]; pass2: string[] };
  candidates: MapCandidate[];
  symbols: Record<string, MapSymbol[]>;
  collisions: string[];
  feature: MapFeature | null;
  limitations: string[];
  index: 'none';
  omitted: number;
  /** The first line is the layer list; the rest is compact JSON. At most 6,144 bytes. */
  text: string;
  bytes: number;
  /** The `map` ledger entry's fields. */
  entry: Record<string, unknown>;
}

export const MAP_LIMIT_BYTES = 6144;
const TOP_FILES = 8;
const MAX_TERMS = 12;
const PROSE_RETRY_TERMS = 8;
const PASS2_NAMES = 6;
const PASS2_OUTSIDE = 0.5;
const SPANS_PER_CANDIDATE = 3;

export function resolveLayers(search: SearchConfig, mode: 'prompt' | 'context'): { layers: string[]; source: 'config' | 'default' } {
  const configured = search.layers?.[mode];
  return configured === undefined ? { layers: [...SEARCH_LAYER_DEFAULTS[mode]], source: 'default' } : { layers: configured, source: 'config' };
}

const IDENTIFIER = /[_./-]|\p{Ll}\p{Lu}/u;
const QUOTED = /["“`]([^"”`\n]{3,60})["”`]/g;
const CANDIDATE_PATHS = 20;

/** Words every question about a repository carries; as search terms they match paths like `repository.ts` or `files/`. */
const REQUEST_WORDS = new Set(['repo', 'repository', 'file', 'files', 'change', 'changes', 'implement', 'implemented', 'below', 'above', 'touch', 'section', 'answer', 'question', 'anything']);

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
const isRequestWord = (term: string): boolean => REQUEST_WORDS.has(term.toLowerCase()) || ABBREVIATION.test(term);
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
  options: { runtime: Runtime; root: string; project: ProjectConfig; files: readonly string[]; withProse?: boolean },
): Promise<string[]> {
  const clean = sources.map((source) => ({ title: cleanRequestText(source.title), content: cleanRequestText(source.content) }));
  const text = clean.map((source) => `${source.title}\n${source.content}`).join('\n');
  const all = termsFromRequirements(clean, 60).filter((term) => !isRequestWord(term));
  const parts = ticketParts(all.filter((term) => TICKET_ID.test(term)), options.files);
  const mined = all.filter((term) => !TICKET_ID.test(term)).slice(0, MAX_TERMS);
  const identifiers = mined.filter((term) => IDENTIFIER.test(term));
  const backticked = [...text.matchAll(/`([^`\s]{3,60})`/g)].map((match) => match[1]!).filter((term) => IDENTIFIER.test(term) && !isBoilerplate(term) && !TICKET_ID.test(term));
  const strings = [...text.matchAll(QUOTED)].map((match) => match[1]!.trim()).filter((value) => /\s|\p{Lu}/u.test(value) && !/^[`]/.test(value) && !isBoilerplate(value));
  const keys = await i18nKeys(options, strings, text);
  const ranked = [...new Set([...backticked, ...parts, ...identifiers, ...keys])];
  if (options.withProse === true) {
    const prose = termsFromRequirements(clean, 60).filter((term) => !IDENTIFIER.test(term) && !isRequestWord(term)).slice(0, PROSE_RETRY_TERMS);
    return [...new Set([...prose, ...ranked])].slice(0, MAX_TERMS);
  }
  // Catalog keys and UI strings say what screen, not which code: they do not count as identifiers here.
  if (new Set([...backticked, ...parts, ...identifiers]).size < 3) {
    const prose = mined.filter((term) => !IDENTIFIER.test(term)).flatMap((term) => term.split('-').filter((part) => part.length >= 3));
    ranked.push(...prose);
  }
  return [...new Set(ranked)].slice(0, MAX_TERMS);
}

const ENGLISH_CATALOG = /(^|[/._-])en([._-][a-z]{2})?\.json$/i;
const spacing = (value: string): string => value.replace(/\s+/g, ' ').trim();
const phraseOf = (value: string): string => spacing(value).toLowerCase();

/** Keys of catalog values equal to a quoted string (any case), or to a 2–5 word phrase the request spells unquoted in the same case. */
async function i18nKeys(options: { runtime: Runtime; root: string; project: ProjectConfig; files: readonly string[] }, strings: readonly string[], text: string): Promise<string[]> {
  const globs = [...ecosystemFacts(options.project.ecosystem).i18nGlobs];
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
      walk(JSON.parse(await options.runtime.fs.readText(path.join(options.root, file))), '');
    } catch {
      // An unreadable catalog contributes nothing.
    }
  }
  const keys = [...new Set([...found, ...spelledKeys])].slice(0, MAX_TERMS);
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
}): Promise<MapResult> {
  const unknown = input.layers.filter((layer) => !(LAYER_NAMES as readonly string[]).includes(layer));
  if (unknown.length > 0) {
    throw new AmbicodeError('search-layer-unknown', `Unknown search layer: ${unknown.join(', ')}.`, { details: [`Known layers: ${LAYER_NAMES.join(', ')}. Fix search.layers in .ambicode/config.yaml.`] });
  }
  const { runtime, project } = input;
  const { git, repositoryRoot } = await openRepository(runtime);
  const projectRoot = normalizeRelative(project.root);
  const pathspec = projectRoot === '' ? null : literalPathspec(projectRoot);
  const limitations: string[] = [];
  const layers: MapLayer[] = [];
  const candidates = new Map<string, MapCandidate>();
  let declarations: Declaration[] = [];
  const pass1 = [...input.terms].slice(0, MAX_TERMS);
  let pass2: string[] = [];
  let shortlists = 0;

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
  const topFiles = (): string[] => [...candidates.values()].sort((a, b) => b.score - a.score).slice(0, TOP_FILES).map((candidate) => candidate.path);
  // Names harvested from a file found only by its contents pull in a sibling feature; a path hit says where the request lives.
  const harvestFiles = (): string[] => {
    const ranked = [...candidates.values()].sort((a, b) => b.score - a.score);
    const placed = ranked.filter((candidate, index) => index === 0 || candidate.reasons.some(isPathReason));
    return placed.slice(0, TOP_FILES).map((candidate) => candidate.path);
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
      limitations.push(`index none: ${layer} skipped.`);
    } else if (layer === 'history') {
      await timed(layer, async () => 0);
      limitations.push('history runs inside shortlist.');
    } else if (layer === 'shortlist') {
      shortlists += 1;
      const second = shortlists > 1;
      // Harvested names take the second half, so a full first pass still lets them in.
      const used = second ? [...new Set([...pass1.slice(0, MAX_TERMS - PASS2_NAMES), ...names(declarations).slice(0, PASS2_NAMES), ...pass1.slice(MAX_TERMS - PASS2_NAMES)])].slice(0, MAX_TERMS) : pass1;
      if (second) pass2 = used;
      await timed(layer, async () => {
        const found = await locate({ git, project, terms: used, limit: 20 });
        if (!second) placedDirs = [...new Set(found.candidates.filter((candidate) => candidate.reasons.some(isPathReason)).map((candidate) => path.posix.dirname(candidate.path)))];
        const outside = (file: string): boolean => placedDirs.length > 0 && !candidates.has(file) && !placedDirs.some((dir) => file.startsWith(`${dir}/`));
        merge(second ? found.candidates.map((candidate) => (outside(candidate.path) ? { ...candidate, score: candidate.score * PASS2_OUTSIDE } : candidate)) : found.candidates);
        for (const line of found.limitations) if (!limitations.includes(line)) limitations.push(line);
        return found.candidates.length;
      });
    } else if (layer === 'harvest') {
      await timed(layer, async () => {
        const files = input.mode === 'context' ? [...new Set([...input.paths, ...topFiles()])].slice(0, TOP_FILES) : harvestFiles();
        declarations = await harvest(runtime.fs, repositoryRoot, files, project.ecosystem);
        return declarations.length;
      });
    } else {
      await timed(layer, async () => {
        const words = [...new Set([...input.symbols, ...input.terms.filter((term) => IDENTIFIER.test(term))])].filter((word) => !COMMON_NAMES.has(word));
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
    const spans = declarations.filter((declaration) => declaration.path === candidate.path).slice(0, SPANS_PER_CANDIDATE).map((declaration) => `${declaration.name}:${declaration.line}`);
    return { ...candidate, score: Math.round(candidate.score * 100) / 100, reasons: candidate.reasons.slice(0, 2), ...(spans.length === 0 ? {} : { spans }) };
  });

  const feature = input.mode === 'prompt' ? featureOf(ordered, await git.listFiles(pathspec), ecosystemFacts(project.ecosystem).sharedKinds) : null;
  if (input.mode === 'prompt') await anchor(ordered.slice(0, LEADS), declarations, [...new Set([...pass1, ...pass2])], git);
  const head = `layers: ${layers.map((layer) => layer.name).join(' → ') || 'none'} (${input.layersSource}); index: none`;
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
    symbols: symbolRows,
    collisions,
    feature,
    limitations,
    index: 'none',
    omitted: ordered.length - kept.length,
    text,
    bytes,
    entry: { mode: input.mode, layers, layersSource: input.layersSource, terms: { pass1, pass2 }, candidates: ordered.length, limitations, index: 'none', collisions, bytes, ...(feature === null ? {} : { feature: { root: feature.root, paths: feature.paths.length } }), candidatePaths: ordered.slice(0, CANDIDATE_PATHS).map((candidate) => candidate.path) },
  };
}

export const LEADS_LIMIT_BYTES = 1200;
export const FEATURE_LIMIT_BYTES = 400;
const LEADS = 8;
const REASON_CHARS = 90;
const FEATURE_LEADS = 4;
const FEATURE_PATHS = 12;
const stemOf = (file: string): string => path.posix.basename(file).split('.')[0]!;
const kindOf = (file: string): string => path.posix.basename(file).split('.').slice(1, -1).join('.');

/**
 * The deepest directory (two segments or more) holding the most top leads found by their path, at least two; its files whose
 * name stem is a lead's stem or the directory's own name, and that are tests or of a shared kind (mocks, types…). Executable
 * siblings are left out: answers took them as changed when they were not.
 */
export function featureOf(ordered: readonly MapCandidate[], files: readonly string[], sharedKinds: readonly string[] = []): MapFeature | null {
  const top = ordered.slice(0, FEATURE_LEADS).filter((candidate) => candidate.reasons.some(isPathReason)).map((candidate) => candidate.path);
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
  const listed = new Set(ordered.slice(0, LEADS).map((candidate) => candidate.path));
  const stems = new Set([path.posix.basename(root), ...top.filter((file) => file.startsWith(`${root}/`)).map(stemOf)]);
  const paths = files
    .filter((file) => file.startsWith(`${root}/`) && !listed.has(file) && pathExclusionReason(file) === null && stems.has(stemOf(file)) && (isTestPath(file) || sharedKinds.includes(kindOf(file))))
    .sort()
    .slice(0, FEATURE_PATHS);
  return paths.length === 0 ? null : { root, paths };
}

async function anchor(leads: MapCandidate[], declarations: readonly Declaration[], terms: readonly string[], git: { firstLines(terms: readonly string[], files: readonly string[]): Promise<Map<string, number>> }): Promise<void> {
  const lower = terms.map((term) => term.toLowerCase());
  for (const lead of leads) {
    const named = declarations.find((declaration) => declaration.path === lead.path && lower.some((term) => declaration.name.toLowerCase().includes(term)));
    if (named !== undefined) lead.line = named.line;
  }
  const lines = await git.firstLines(terms, leads.filter((lead) => lead.line === undefined).map((lead) => lead.path));
  for (const lead of leads) if (lead.line === undefined && lines.has(lead.path)) lead.line = lines.get(lead.path)!;
}

/** The route's short form of a map: the terms, then the top candidates with their first reason, one per line. */
export function leadsText(map: Pick<MapResult, 'terms' | 'candidates' | 'collisions'> & { feature?: MapFeature | null }): string {
  const added = map.terms.pass2.filter((term) => !map.terms.pass1.includes(term));
  const head = `Leads from the terms ${map.terms.pass1.join(', ') || '(none)'}${added.length === 0 ? '' : `; then ${added.join(', ')}`}:`;
  const rows = map.candidates.slice(0, LEADS).map((candidate, index) => {
    const reason = candidate.reasons[0] ?? '';
    return `${index + 1}. ${candidate.path}${candidate.line === undefined ? '' : `:${candidate.line}`}${reason === '' ? '' : ` — ${reason.length > REASON_CHARS ? `${reason.slice(0, REASON_CHARS - 1)}…` : reason}`}`;
  });
  const collides = map.collisions.length === 0 ? [] : [`Declared more than once: ${map.collisions.slice(0, 6).join(', ')}.`];
  const text = (): string => [head, ...rows, ...collides].join('\n');
  while (Buffer.byteLength(text()) > LEADS_LIMIT_BYTES && rows.length > 0) rows.pop();
  const feature = map.feature === undefined || map.feature === null ? [] : [featureLine(map.feature)];
  return [head, ...rows, ...feature, ...collides].join('\n');
}

function featureLine(feature: MapFeature): string {
  const relative = feature.paths.map((file) => file.slice(feature.root.length + 1));
  const line = (count: number): string => `Same feature (${feature.root}/): ${relative.slice(0, count).join(', ')}${count < relative.length ? ', …' : ''}`;
  let count = relative.length;
  while (count > 1 && Buffer.byteLength(line(count)) > FEATURE_LIMIT_BYTES) count -= 1;
  return line(count);
}
