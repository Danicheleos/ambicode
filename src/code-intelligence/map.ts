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
import { harvest, type Declaration } from './harvest.ts';
import { locate, termsFromRequirements } from './locate.ts';

export const LAYER_NAMES = ['grep', 'shortlist', 'harvest', 'history', 'index.find', 'index.relates'] as const;
export type LayerName = (typeof LAYER_NAMES)[number];

export interface MapLayer { name: LayerName; ms: number; hits: number }
export interface MapCandidate { path: string; score: number; reasons: string[]; spans?: string[] }
export interface MapSymbol { name: string; kind: string; at: string; declarations: number; collides: boolean }

export interface MapResult {
  mode: 'prompt' | 'context';
  layers: MapLayer[];
  layersSource: 'config' | 'default' | 'route';
  terms: { pass1: string[]; pass2: string[] };
  candidates: MapCandidate[];
  symbols: Record<string, MapSymbol[]>;
  collisions: string[];
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
const isRequestWord = (term: string): boolean => REQUEST_WORDS.has(term.toLowerCase());

/** Identifiers first, then quoted UI strings (as i18n keys when such files exist), prose only when identifiers are scarce. */
export async function rankTerms(
  sources: readonly { title: string; content: string }[],
  options: { runtime: Runtime; root: string; project: ProjectConfig; files: readonly string[]; withProse?: boolean },
): Promise<string[]> {
  const clean = sources.map((source) => ({ title: cleanRequestText(source.title), content: cleanRequestText(source.content) }));
  const text = clean.map((source) => `${source.title}\n${source.content}`).join('\n');
  const mined = termsFromRequirements(clean, 60).filter((term) => !isRequestWord(term)).slice(0, MAX_TERMS);
  const identifiers = mined.filter((term) => IDENTIFIER.test(term));
  const backticked = [...text.matchAll(/`([^`\s]{3,60})`/g)].map((match) => match[1]!).filter((term) => IDENTIFIER.test(term) && !isBoilerplate(term));
  const strings = [...text.matchAll(QUOTED)].map((match) => match[1]!.trim()).filter((value) => /\s|\p{Lu}/u.test(value) && !/^[`]/.test(value) && !isBoilerplate(value));
  const keys = await i18nKeys(options, strings);
  const ranked = [...new Set([...backticked, ...identifiers, ...keys])];
  if (options.withProse === true) {
    const prose = termsFromRequirements(clean, 60).filter((term) => !IDENTIFIER.test(term) && !isRequestWord(term)).slice(0, PROSE_RETRY_TERMS);
    return [...new Set([...prose, ...ranked])].slice(0, MAX_TERMS);
  }
  if (ranked.length < 3) {
    const prose = mined.filter((term) => !IDENTIFIER.test(term)).flatMap((term) => term.split('-').filter((part) => part.length >= 3));
    ranked.push(...prose);
  }
  return [...new Set(ranked)].slice(0, MAX_TERMS);
}

async function i18nKeys(options: { runtime: Runtime; root: string; project: ProjectConfig; files: readonly string[] }, strings: readonly string[]): Promise<string[]> {
  const globs = [...ecosystemFacts(options.project.ecosystem).i18nGlobs];
  if (strings.length === 0) return [];
  const catalogs = options.files.filter((file) => globs.length > 0 && matchesAnyGlob(file, globs)).slice(0, 5);
  if (catalogs.length === 0) return [...strings];
  const wanted = new Map(strings.map((value) => [value.toLowerCase(), value]));
  const found: string[] = [];
  const walk = (value: unknown, prefix: string): void => {
    if (typeof value === 'string') {
      if (wanted.has(value.toLowerCase()) && found.length < MAX_TERMS) found.push(prefix);
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
  return found.length === 0 ? [...strings] : found;
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
        merge(found.candidates);
        for (const line of found.limitations) if (!limitations.includes(line)) limitations.push(line);
        return found.candidates.length;
      });
    } else if (layer === 'harvest') {
      await timed(layer, async () => {
        const files = input.mode === 'context' ? [...new Set([...input.paths, ...topFiles()])].slice(0, TOP_FILES) : topFiles();
        declarations = await harvest(runtime.fs, repositoryRoot, files, project.ecosystem);
        return declarations.length;
      });
    } else {
      await timed(layer, async () => {
        const words = [...new Set([...input.symbols, ...input.terms.filter((term) => IDENTIFIER.test(term))])].filter((word) => !COMMON_NAMES.has(word));
        const files = words.length === 0 ? [] : await git.grepWords(words, pathspec);
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
    limitations,
    index: 'none',
    omitted: ordered.length - kept.length,
    text,
    bytes,
    entry: { mode: input.mode, layers, layersSource: input.layersSource, terms: { pass1, pass2 }, candidates: ordered.length, limitations, index: 'none', collisions, bytes, candidatePaths: ordered.slice(0, CANDIDATE_PATHS).map((candidate) => candidate.path) },
  };
}

export const LEADS_LIMIT_BYTES = 1200;
const LEADS = 8;
const REASON_CHARS = 90;

/** The route's short form of a map: the terms, then the top candidates with their first reason, one per line. */
export function leadsText(map: Pick<MapResult, 'terms' | 'candidates' | 'collisions'>): string {
  const added = map.terms.pass2.filter((term) => !map.terms.pass1.includes(term));
  const head = `Leads from the terms ${map.terms.pass1.join(', ') || '(none)'}${added.length === 0 ? '' : `; then ${added.join(', ')}`}:`;
  const rows = map.candidates.slice(0, LEADS).map((candidate, index) => {
    const reason = candidate.reasons[0] ?? '';
    return `${index + 1}. ${candidate.path}${reason === '' ? '' : ` — ${reason.length > REASON_CHARS ? `${reason.slice(0, REASON_CHARS - 1)}…` : reason}`}`;
  });
  const collides = map.collisions.length === 0 ? [] : [`Declared more than once: ${map.collisions.slice(0, 6).join(', ')}.`];
  const text = (): string => [head, ...rows, ...collides].join('\n');
  while (Buffer.byteLength(text()) > LEADS_LIMIT_BYTES && rows.length > 0) rows.pop();
  return text();
}
