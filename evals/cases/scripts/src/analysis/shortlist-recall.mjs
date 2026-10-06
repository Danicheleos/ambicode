// How often the file shortlist `prepare` hands the agent contains the files a real ticket's change touched.
// Offline and free: no model runs. Reads benchmarks/ and prints numbers only: no case name, ticket text, term or path.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime } from '../../../../../src/composition/root.ts';
import { openWorkspace, projectForRequest } from '../../../../../src/modules/config/workspace.ts';
import { locate, termsFromRequirements } from '../../../../../src/modules/search/text/locate.ts';
import { PREPARE_SHORTLIST_LIMIT } from '../../../../../src/types/modules/search.ts';
import { buildMap } from '../../../../../src/modules/search/text/map.ts';
import { indexAdapterFor } from '../../../../../src/modules/search/code-index/adapter.ts';
import { indexDepsOf } from '../../../../../src/modules/search/code-index/codeindex.ts';


import { BENCHMARKS, CASES_DIRECTORY } from '../shared/bench-paths.mjs';

const MAP_LAYERS = ['shortlist', 'harvest', 'shortlist'];
/** M6 as measured before this script scored (b) and (c); (a) must reproduce it for the comparison to mean anything. */
export const M6 = { 'BE-express': 0.499, 'FE-angular': 0.123 };
const SIDES = Object.keys(M6);
const THRESHOLD = 0.05;
/** Absorbs float error in a difference of means (0.173 − 0.123 = 0.04999999999999999); far below any real gain step. */
const EPSILON = 1e-9;

/** The ticket text between the prompt's <ticket> tags, which is what a requirement fetch would return. */
export function ticketOf(promptMarkdown) {
  const match = /<ticket>\s*([\s\S]*?)\s*<\/ticket>/.exec(promptMarkdown);
  return match === null ? null : match[1];
}

/** The codeindex adapter for one side, its index under `<indexDir>/<side>`, the binary's directory first on PATH. */
async function codeindexFor(side, dir, workspace, project, { bin, indexDir }) {
  const runtime = await createRuntime({ cwd: dir, env: { ...process.env, PATH: `${path.dirname(bin)}${path.delimiter}${process.env.PATH ?? ''}` } });
  const config = { ...workspace.config, search: { ...workspace.config.search, index: 'codeindex' } };
  return indexAdapterFor({ ...indexDepsOf(runtime, workspace.git, workspace.repositoryRoot, config), indexDir: path.join(indexDir, side) }, project);
}

/**
 * Per localize case, recall@limit of (a) `locate` as `prepare` ran it, (b) the map's layers with no index and (c) the same
 * plus `index.find` over codeindex, all from the same terms (05-O2). `adapterFor` replaces the codeindex adapter in tests.
 */
export async function shortlistRecall({ repos, benchmarks = BENCHMARKS, unfiltered = false, limit = PREPARE_SHORTLIST_LIMIT, termsOf = (ticket) => termsFromRequirements([{ title: '', content: ticket }]), codeindex = null, adapterFor = null }) {
  const sides = {};
  for (const [side, dir] of Object.entries(repos)) {
    const runtime = await createRuntime({ cwd: dir });
    const workspace = await openWorkspace(runtime);
    const project = projectForRequest(workspace.config, null, []);
    let index = null;
    if (adapterFor !== null) index = await adapterFor(side, { runtime, workspace, project });
    else if (codeindex !== null) index = await codeindexFor(side, dir, workspace, project, codeindex);
    // Built once per side, in the foreground, before anything is scored.
    if (index !== null) await index.build(project, { detached: false });
    sides[side] = { runtime, workspace, project, index };
  }
  const rows = [];
  // Each project's full set: `<benchmarks>/<project>/cases/`.
  const caseDirs = Object.keys(repos).flatMap((side) => {
    const cases = path.join(benchmarks, side, CASES_DIRECTORY);
    return existsSync(cases) ? readdirSync(cases).filter((n) => !n.includes('review')).sort().map((n) => path.join(cases, n)) : [];
  });
  for (const caseDir of caseDirs) {
    const truthFile = path.join(caseDir, 'truth.json');
    if (!existsSync(truthFile)) continue;
    const { side, truth, missingFromSnapshot = [] } = JSON.parse(readFileSync(truthFile, 'utf8'));
    const entry = sides[side];
    const ticket = ticketOf(readFileSync(path.join(caseDir, 'prompt.md'), 'utf8'));
    if (entry === undefined || ticket === null) continue;
    const reachable = truth.filter((file) => !missingFromSnapshot.includes(file));
    if (reachable.length === 0) continue;
    const { runtime, workspace, project, index } = entry;
    const terms = termsOf(ticket);
    const recall = (paths) => reachable.filter((file) => paths.includes(file)).length / reachable.length;
    // `unfiltered` reproduces the shortlist before the project's include/exclude lists applied.
    const found = await locate({ git: workspace.git, project: unfiltered ? { ...project, shortlist: { include: [], exclude: [] } } : project, terms, limit });
    const paths = found.candidates.map((c) => c.path);
    const map = async (layers, adapter) => (await buildMap({ runtime, project, mode: 'prompt', layers, layersSource: 'route', terms, paths: [], symbols: [], ...(adapter === undefined ? {} : { index: adapter }) })).candidates.slice(0, limit).map((c) => c.path);
    const b = recall(await map(MAP_LAYERS, indexAdapterFor(indexDepsOf(runtime, workspace.git, workspace.repositoryRoot, { ...workspace.config, search: { ...workspace.config.search, index: 'none' } }), project)));
    const c = index === null ? null : recall(await map([...MAP_LAYERS, 'index.find'], index));
    rows.push({ side, truth: reachable.length, a: recall(paths), b, c });
  }
  return rows;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);
const fixed = (x) => (x === null ? 'n/a' : x.toFixed(3));

/** Per side: n, recall of each arm, (c) − (b); then the M6 check and the 5-I line (05-O3…O5). */
export function summarize(rows, { limit = PREPARE_SHORTLIST_LIMIT } = {}) {
  const lines = [];
  const stats = {};
  for (const side of SIDES) {
    const group = rows.filter((row) => row.side === side);
    const a = mean(group.map((row) => row.a));
    const b = mean(group.map((row) => row.b));
    const c = group.length > 0 && group.every((row) => row.c !== null) ? mean(group.map((row) => row.c)) : null;
    stats[side] = { a, b, c, delta: c === null ? null : c - b };
    lines.push(`${side}: n=${group.length} recall@${limit} (a) ${fixed(a)} (b) ${fixed(b)} (c) ${fixed(c)} (c)-(b) ${fixed(stats[side].delta)}`);
  }
  const reproduces = SIDES.every((side) => stats[side].a.toFixed(3) === M6[side].toFixed(3));
  lines.push(`(a) reproduces M6: ${reproduces ? 'yes' : 'no'} (expected ${SIDES.map((side) => `${side} ${M6[side].toFixed(3)}`).join(', ')})`);
  lines.push(`5-I: ${decision(stats, reproduces)}`);
  return lines;
}

function decision(stats, reproduces) {
  if (!reproduces) return 'pending ((a) did not reproduce M6)';
  if (SIDES.some((side) => stats[side].delta === null)) return 'pending ((c) was not run)';
  return SIDES.some((side) => stats[side].delta >= THRESHOLD - EPSILON) ? 'report' : 'none';
}

export function parseArgv(argv) {
  const positionals = [];
  const options = { unfiltered: false, benchmarks: BENCHMARKS, codeindex: null, indexDir: null };
  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i + 1];
    if (argv[i] === '--unfiltered') options.unfiltered = true;
    else if (argv[i] === '--benchmarks' || argv[i] === '--index-dir' || argv[i] === '--codeindex') {
      if (value === undefined) throw new Error(`${argv[i]} needs a value`);
      if (argv[i] !== '--codeindex' && !path.isAbsolute(value)) throw new Error(`${argv[i]} takes an absolute path, not ${value}`);
      options[argv[i] === '--benchmarks' ? 'benchmarks' : argv[i] === '--index-dir' ? 'indexDir' : 'codeindex'] = value;
      i += 1;
    } else positionals.push(argv[i]);
  }
  const [be, fe, limitAt] = positionals;
  if (!be || !fe) throw new Error('usage: shortlist-recall.mjs <BE-express repo> <FE-angular repo> [limit] [--unfiltered] [--benchmarks <absolute dir>] [--codeindex <bin> --index-dir <absolute dir>]');
  if ((options.codeindex === null) !== (options.indexDir === null)) throw new Error('--codeindex and --index-dir go together');
  return { repos: { 'BE-express': be, 'FE-angular': fe }, ...(limitAt === undefined ? {} : { limit: Number(limitAt) }), unfiltered: options.unfiltered, benchmarks: options.benchmarks, codeindex: options.codeindex === null ? null : { bin: path.resolve(options.codeindex), indexDir: options.indexDir } };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgv(process.argv.slice(2));
  const rows = await shortlistRecall(options);
  for (const line of summarize(rows, options)) console.log(line);
}
