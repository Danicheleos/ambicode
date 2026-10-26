// $0 offline bench: runs the bundled `ambicode route start investigate` ("ground" step: requirements.normalize + search.map(prompt)) on each
// map case and scores the files of the printed map with folder-truth.mjs' scoreFolders. No model is called.
//   node evals/scripts/map-bench.mjs --bench <repo> [--cases <dir>] [--case <id-or-name substring>] [--top 8]
// --bench defaults to env NAV_BENCH; --cases to bench/map (map-cases.mjs: the ticket truths corrected against the bench).
// The bench repo is only cloned (git clone --local) into a scratch directory with its .ambicode/{config.yaml,context}; the route writes its
// task ledger there, never into the bench. Results: evals/cases/results/map-bench/<stamp>.json (gitignored with results/).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scoreFolders, truthFolders } from './folder-truth.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
// Same constant as TOP_FILES in src/modules/search/map.ts: the files the harvest layer reads, i.e. what the map ranks highest.
const DEFAULT_TOP = 8;

/** Ticket text of a map prompt.md: the body after the front matter, without any "Do not change anything…" contract line. */
export function promptOf(markdown) {
  const body = markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
  return body.split(/\r?\n/).filter((line) => !line.startsWith('Do not change anything.')).join('\n').trim();
}

/** Candidate paths (ranked) from the stdout of `route start`, or null when no map was printed. The text carries no terms and no cut count: those are the ledger's (`ledgerMapOf`). */
export function mapOf(stdout) {
  const line = stdout.split('\n').find((row) => row.startsWith('{"candidates"'));
  if (line === undefined) return null;
  return { files: JSON.parse(line).candidates.map((row) => row[0]) };
}

/** The `map` entry of a task's ledger in the scratch clone: the first-pass terms and how many candidates the list held before the byte cap. */
export function ledgerMapOf(scratch, task) {
  const file = path.join(scratch, '.ambicode', 'tasks', task, 'ledger.jsonl');
  if (!existsSync(file)) return null;
  const entry = readFileSync(file, 'utf8').split('\n').filter(Boolean).map((row) => JSON.parse(row)).filter((row) => row.kind === 'map').at(-1);
  return entry === undefined ? null : { terms: entry.terms?.pass1 ?? [], candidates: entry.candidates };
}

/** Truth folders with a file in `files` (the file's folder equals or is under the truth folder), as { hit, total }. */
export function funnel(truth, files) {
  const folders = truthFolders(truth.relevant);
  const dirs = files.map((file) => path.posix.dirname(file));
  const hit = folders.filter((folder) => dirs.some((dir) => dir === folder || dir.startsWith(`${folder}/`)));
  return { hit: hit.length, total: folders.length };
}

export const mean = (values) => {
  const kept = values.filter((value) => typeof value === 'number');
  return kept.length === 0 ? null : kept.reduce((sum, value) => sum + value, 0) / kept.length;
};

const fmt = (value) => (typeof value === 'number' ? value.toFixed(3) : '  -  ');

function parseArgs(argv, env) {
  const out = { bench: env.NAV_BENCH ?? null, cases: path.join(REPO, 'bench', 'map'), filter: null, top: DEFAULT_TOP, split: 'all' };
  for (let at = 0; at < argv.length; at += 1) {
    const [flag, inline] = argv[at].split('=');
    const value = () => inline ?? argv[++at];
    if (flag === '--bench') out.bench = value();
    else if (flag === '--cases') out.cases = value();
    else if (flag === '--case') out.filter = value();
    else if (flag === '--top') out.top = Number(value());
    else if (flag === '--split') out.split = value();
    else throw new Error(`unknown argument ${argv[at]}`);
  }
  if (!['tune', 'hold', 'all'].includes(out.split)) throw new Error('--split takes tune, hold or all');
  if (out.bench === null) throw new Error('--bench <repo> or env NAV_BENCH is required');
  return out;
}

/**
 * Stratified split: cases sorted by their number of target folders (largest first, name breaks ties) alternate tune, hold, tune, ...
 * so each half holds one of the two widest cases; alternating by position put both 40+ folder cases in the hold-out half.
 * A half is only a hold-out for a writer that never sees it: base constants chosen so far were selected on the mean of all 10 cases.
 */
export function halvesOf(cases, entries) {
  const sized = entries.map((entry) => ({ entry, size: truthFolders(JSON.parse(readFileSync(path.join(cases, entry, 'truth.json'), 'utf8')).relevant).length }));
  sized.sort((a, b) => b.size - a.size || a.entry.localeCompare(b.entry));
  return new Map(sized.map(({ entry }, at) => [entry, at % 2 === 0 ? 'tune' : 'hold']));
}

export function scratchOf(bench) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'map-bench-'));
  execFileSync('git', ['clone', '-q', '--local', '--no-hardlinks', bench, dir], { stdio: 'pipe' });
  for (const entry of ['config.yaml', 'context']) {
    const from = path.join(bench, '.ambicode', entry);
    if (existsSync(from)) cpSync(from, path.join(dir, '.ambicode', entry), { recursive: true });
  }
  return dir;
}

export function runBench({ bench, cases, filter, top, split = 'all' }) {
  const cli = path.join(REPO, 'scripts', 'ambicode.mjs');
  if (!existsSync(cli)) throw new Error('scripts/ambicode.mjs is missing: npm run build first');
  const scratch = scratchOf(bench);
  try {
    const rows = [];
    const entries = readdirSync(cases).sort().filter((entry) => existsSync(path.join(cases, entry, 'truth.json')));
    const halves = halvesOf(cases, entries);
    for (const entry of entries) {
      const dir = path.join(cases, entry);
      const half = halves.get(entry);
      if ((filter !== null && !entry.includes(filter)) || (split !== 'all' && split !== half)) continue;
      const truth = JSON.parse(readFileSync(path.join(dir, 'truth.json'), 'utf8'));
      const prompt = promptOf(readFileSync(path.join(dir, 'prompt.md'), 'utf8'));
      const task = `mb-${entry.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`;
      const stdout = execFileSync('node', [cli, 'route', 'start', 'investigate', '--task', task, '--headless', prompt], { cwd: scratch, encoding: 'utf8', maxBuffer: 1 << 26 });
      // A long step is written to a file and the output only points at it ("Read it whole: N bytes: <path>").
      const pointer = /Read it whole: \d+ bytes: (\S+)/.exec(stdout);
      // The step is trimmed to its channel limit at delivery, so the ranking is read from the map payload the handler saved whole.
      const saved = path.join(scratch, '.ambicode', 'tasks', task, 'steps');
      const whole = existsSync(saved) ? readdirSync(saved).find((name) => name.endsWith('-map.md')) : undefined;
      const map = mapOf(whole !== undefined ? readFileSync(path.join(saved, whole), 'utf8') : pointer === null ? stdout : readFileSync(pointer[1], 'utf8'));
      const files = map?.files ?? [];
      const ledgered = ledgerMapOf(scratch, task);
      const all = scoreFolders(truth, map === null ? null : files);
      const head = scoreFolders(truth, map === null ? null : files.slice(0, top));
      rows.push({
        case: truth.name, half, files: files.length, cut: Math.max(0, (ledgered?.candidates ?? files.length) - files.length),
        recall: all.recall, precision: all.precision, f1: all.f1,
        topRecall: head.recall, topPrecision: head.precision, topF1: head.f1,
        funnelAll: funnel(truth, files), funnelTop: funnel(truth, files.slice(0, top)),
        missed: all.missed, terms: ledgered?.terms ?? [],
      });
    }
    return { rows, index: indexMetaOf(scratch) };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** The meta row of the search index the route built in the scratch clone (head, build time, folder count), or null when none was built. */
export function indexMetaOf(dir) {
  const file = path.join(dir, '.ambicode', 'context', 'search', 'folders.jsonl');
  if (!existsSync(file)) return null;
  const meta = JSON.parse(readFileSync(file, 'utf8').split('\n')[0]);
  return { head: meta.head, buildMs: meta.buildMs, folders: meta.folders, files: meta.files };
}

export function table(rows, top) {
  const lines = [`case                    files cut |  R     P     F1   | top${top}: R     P     F1   | folders hit: all  top${top}`];
  for (const row of rows) {
    lines.push(`${row.case.padEnd(23)} ${String(row.files).padStart(5)} ${String(row.cut).padStart(3)} | ${fmt(row.recall)} ${fmt(row.precision)} ${fmt(row.f1)} |      ${fmt(row.topRecall)} ${fmt(row.topPrecision)} ${fmt(row.topF1)} |   ${`${row.funnelAll.hit}/${row.funnelAll.total}`.padStart(5)} ${`${row.funnelTop.hit}/${row.funnelTop.total}`.padStart(5)}`);
  }
  const m = (key) => fmt(mean(rows.map((row) => row[key])));
  lines.push(`${'mean'.padEnd(23)} ${fmt(mean(rows.map((r) => r.files))).slice(0, 5).padStart(5)}     | ${m('recall')} ${m('precision')} ${m('f1')} |      ${m('topRecall')} ${m('topPrecision')} ${m('topF1')} |`);
  const halves = ['tune', 'hold'].map((half) => ({ half, rows: rows.filter((row) => row.half === half) })).filter((entry) => entry.rows.length > 0);
  if (halves.length > 1 || (halves.length === 1 && halves[0].rows.length !== rows.length)) {
    for (const { half, rows: part } of halves) {
      const g = (key) => fmt(mean(part.map((row) => row[key])));
      lines.push(`${`mean ${half} (${part.length})`.padEnd(23)}       | ${g('recall')} ${g('precision')} ${g('f1')} |      ${g('topRecall')} ${g('topPrecision')} ${g('topF1')} |`);
    }
  }
  return lines.join('\n');
}

/** What produced a result: the code (HEAD plus a dirty flag, read-only git). */
export function provenance() {
  const git = (...args) => execFileSync('git', args, { cwd: REPO, encoding: 'utf8' }).trim();
  return { gitSha: git('rev-parse', 'HEAD'), dirty: git('status', '--porcelain', '--', 'src', 'evals', 'agents', 'routes', 'skills').length > 0 };
}

/** The route's printed map and the in-process funnel run the same request; a different file count means the stage counts describe another list than the scores. */
export function assertPrintedAgrees(rows, funnelRows) {
  for (const row of rows) {
    const found = funnelRows.find((entry) => entry.case === row.case);
    if (found === undefined) throw new Error(`${row.case}: no funnel row`);
    if (found.printed !== row.files) throw new Error(`${row.case}: funnel printed ${found.printed} files, the bench row has ${row.files}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2), process.env);
  const { rows, index } = runBench(options);
  // The funnel runs the same request in-process (no route), so its stage counts sit beside the scores and every quoted number can be recomputed from the file.
  const { runFunnel, stageCounts, retrievalCounts } = await import('./map-funnel.mjs');
  const funnelRows = await runFunnel({ bench: options.bench, split: options.split, filter: options.filter, top: options.top, cases: options.cases });
  const stages = { all: stageCounts(funnelRows), tune: stageCounts(funnelRows.filter((row) => row.half === 'tune')), hold: stageCounts(funnelRows.filter((row) => row.half === 'hold')) };
  const retrieval = { all: retrievalCounts(funnelRows), tune: retrievalCounts(funnelRows.filter((row) => row.half === 'tune')), hold: retrievalCounts(funnelRows.filter((row) => row.half === 'hold')) };
  assertPrintedAgrees(rows, funnelRows);
  for (const row of rows) row.funnel = funnelRows.find((entry) => entry.case === row.case) ?? null;
  console.log(table(rows, options.top));
  console.log(`split ${options.split}; target folders absent/cut/printed/top: ${['all', 'tune', 'hold'].map((key) => `${key} ${Object.values(stages[key]).join('/')}`).join(', ')}`);
  console.log(`first pool hit from the retrieve layer / via a label / label only: ${['all', 'tune', 'hold'].map((key) => `${key} ${retrieval[key].retrieved}/${retrieval[key].label}/${retrieval[key].labelOnly}`).join(', ')}; search index ${index === null ? 'not built' : `${index.folders} folders in ${index.buildMs} ms at ${index.head}`}`);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(REPO, 'evals', 'cases', 'results', 'map-bench', `${stamp}.json`);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ stamp, ...provenance(), split: options.split, top: options.top, stages, retrieval, index, mean: { recall: mean(rows.map((r) => r.recall)), precision: mean(rows.map((r) => r.precision)), f1: mean(rows.map((r) => r.f1)), topF1: mean(rows.map((r) => r.topF1)) }, rows }, null, 2)}\n`);
  console.log(`wrote ${path.relative(REPO, file)}`);
}

// Not a top-level await: map-funnel.mjs imports this module, and a pending evaluation here would deadlock that import.
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((error) => { console.error(error); process.exitCode = 1; });
