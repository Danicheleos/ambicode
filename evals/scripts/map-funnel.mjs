// $0 per-case funnel of the map on the map bench: for each truth folder, was a file of it in the ranked pool, printed, in the top N;
// and which extracted terms produced the printed folders that the truth does not accept (noise). map-bench.mjs stores the same stages in its result JSON.
//   node evals/scripts/map-funnel.mjs --bench <repo> [--split tune|hold|all] [--case <substring>] [--top 8]
//   node evals/scripts/map-funnel.mjs --spec evals/local/real-cases.suite.json --case <exact name> [--case ...]   (replay mode: the table of evals/local/map-replay.md on stdout)
// It calls buildMap in-process with the request the investigate route builds for a headless prompt, in the same scratch clone the bench uses.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, globSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime } from '#composition/root';
import { openWorkspace, projectForRequest } from '#modules/config/workspace';
import { buildMap, resolveLayers } from '#modules/search/map';
import { titleOf } from '#modules/requirements/capture/capture';
import { contentHash } from '#util/hash';
import { halvesOf, promptOf, scratchOf } from './map-bench.mjs';
import { truthFolders } from './folder-truth.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CASES = path.join(REPO, 'bench', 'map');
const MATERIAL = path.join(REPO, 'evals', 'local', 'suite-real-material');
const ARCHIVE = path.resolve(REPO, '..', 'eval-archive', 'evals', 'cases', 'results', 'traces', 'plugin');
/** Run 1 of each case's two 2026-11-07 stage-1 plan runs (.plugin-master/backlog-resources/plan-gate-analysis/00-data.md:15-24). */
export const STAGE1_R1 = {
  'task-k12-1016': '2026-11-07T11-36-37-890Z',
  'task-k12-1094': '2026-11-07T11-47-00-607Z',
  'task-real-fe-vs-5945-nom-admin-defaults': '2026-11-07T11-55-02-584Z',
  'task-real-fe-vs-6545-reba-submit': '2026-11-07T12-01-47-735Z',
  'task-real-fe-vs-5915-ge-adv-autolaunch': '2026-11-07T12-06-07-923Z',
};
/** Files the plan gate analysis names beyond the truth list (00-data.md:86); 1016 district.py is already in that case's truth. */
export const EXTRA_FILES = {
  'task-real-fe-vs-5945-nom-admin-defaults': ['main/features/score-types/nom/nom-wizard/nom-wizard/nom-wizard.component.ts'],
  'task-real-fe-vs-6545-reba-submit': ['main/features/score-types/rula-reba/reba/services/reba-manual-assessment-form.service.spec.ts'],
};

const under = (dir, folder) => dir === folder || dir.startsWith(`${folder}/`);
/** The quoted term of a reason, or its kind when there is none. */
const termOf = (reason) => /"([^"]+)"/.exec(reason)?.[1] ?? reason;
const dirOf = (file) => path.posix.dirname(file);
/** Whether the first pool hit of a target came from the retrieve layer (a `retrieved:` or `neighbour of` reason) and whether a catalog label carried it. */
export const reachedBy = (reasons) => ({
  retrieved: reasons.some((reason) => reason.startsWith('retrieved:') || reason.startsWith('neighbour of')),
  label: reasons.some((reason) => reason.startsWith('retrieved:') && /\blabel "/.test(reason)),
  labelOnly: reasons.some((reason) => reason.startsWith('retrieved:') && /\blabel "/.test(reason) && !/\b(?:path|name|file) "/.test(reason)),
});

/** The request the route builds for a headless prompt: the envelope source `request` as `${title}\n${content}` (src/skills/common.ts:168, mapTextOf for prose; the handler is inline, so not importable). */
export const benchRequest = (text) => `${titleOf(text, 'request')}\n${text}`;

/** One row per case: the extracted terms, each truth folder's stage (absent, cut, printed, top) and the terms behind the printed noise and the truth-folder hits. */
export async function runFunnel({ bench, split = 'all', filter = null, top = 8, cases = CASES }) {
  const scratch = scratchOf(bench);
  try {
    const runtime = await createRuntime({ cwd: scratch });
    const workspace = await openWorkspace(runtime);
    const project = projectForRequest(workspace.config, null, []);
    const { layers, source } = resolveLayers('prompt');
    const entries = readdirSync(cases).sort().filter((entry) => existsSync(path.join(cases, entry, 'truth.json')));
    const halves = halvesOf(cases, entries);
    const rows = [];
    for (const entry of entries) {
      const half = halves.get(entry);
      if ((filter !== null && !entry.includes(filter)) || (split !== 'all' && split !== half)) continue;
      const truth = JSON.parse(readFileSync(path.join(cases, entry, 'truth.json'), 'utf8'));
      const request = benchRequest(promptOf(readFileSync(path.join(cases, entry, 'prompt.md'), 'utf8')));
      const map = await buildMap(runtime, { project, mode: 'prompt', layers, layersSource: source, terms: [], request, paths: [], symbols: [] });
      const targets = truthFolders(truth.relevant);
      const accepted = truthFolders([...truth.relevant, ...(truth.allowed ?? [])]);
      const printed = map.candidates.map((candidate) => candidate.path);
      const stage = (folder) => {
        const inPool = map.pool.findIndex((candidate) => under(dirOf(candidate.path), folder));
        if (inPool === -1) return { stage: 'absent' };
        const inPrinted = printed.findIndex((file) => under(dirOf(file), folder));
        if (inPrinted === -1) return { stage: 'cut', rank: inPool + 1 };
        return { stage: inPrinted < top ? 'top' : 'printed', rank: inPrinted + 1 };
      };
      const tally = (counts) => [...counts].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([term, count]) => `${term}:${count}`);
      const noise = new Map();
      for (const candidate of map.candidates) {
        const folder = dirOf(candidate.path);
        if (accepted.some((ok) => under(folder, ok) || under(ok, folder))) continue;
        for (const reason of new Set(candidate.reasons.map(termOf))) noise.set(reason, (noise.get(reason) ?? 0) + 1);
      }
      const hits = new Map();
      for (const candidate of map.pool) if (targets.some((folder) => under(dirOf(candidate.path), folder))) for (const reason of new Set(candidate.reasons.map(termOf))) hits.set(reason, (hits.get(reason) ?? 0) + 1);
      rows.push({
        case: truth.name, half, pool: map.pool.length, printed: printed.length, cutNote: map.limitations.filter((note) => /cut to fit/.test(note)).join(''),
        terms: map.terms, limitations: map.limitations,
        targets: targets.map((folder) => ({ folder, ...stage(folder), ...reachedBy(map.pool.find((candidate) => under(dirOf(candidate.path), folder))?.reasons ?? []), via: (map.pool.find((candidate) => under(dirOf(candidate.path), folder))?.reasons ?? []).map(termOf).slice(0, 3) })),
        noise: tally(noise), hits: tally(hits),
      });
    }
    return rows;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/** { absent, cut, printed, top } over the target folders of the given funnel rows. */
export function stageCounts(rows) {
  const counts = { absent: 0, cut: 0, printed: 0, top: 0 };
  for (const row of rows) for (const target of row.targets) counts[target.stage] += 1;
  return counts;
}

/** Targets whose first pool hit the retrieve layer produced, and those of them a catalog label reached; not a stage, so absent/cut/printed/top still partition the targets. */
export function retrievalCounts(rows) {
  const counts = { retrieved: 0, label: 0, labelOnly: 0 };
  for (const row of rows) for (const target of row.targets) for (const key of Object.keys(counts)) if (target[key]) counts[key] += 1;
  return counts;
}

function print(rows, top) {
  for (const row of rows) {
    console.log(`\n## ${row.case} [${row.half}] pool ${row.pool}, printed ${row.printed}, ${row.cutNote || 'not cut'}`);
    console.log(`terms pass1: ${row.terms.pass1.join(' | ')}`);
    console.log(`terms pass2 extra: ${row.terms.pass2.filter((term) => !row.terms.pass1.includes(term)).join(' | ') || '-'}`);
    for (const target of row.targets) console.log(`  truth ${target.folder}: ${target.stage === 'absent' ? 'absent' : target.stage === 'cut' ? `cut(pool#${target.rank})` : `${target.stage === 'top' ? `top${top}` : 'printed'}(#${target.rank})`}${target.retrieved ? (target.label ? ' [retrieved, label]' : ' [retrieved]') : ''}${target.via.length === 0 ? '' : `  via ${target.via.join(',')}`}`);
    console.log(`  terms in printed noise: ${row.noise.join(' ') || '-'}`);
    console.log(`  terms on truth-folder files (whole pool): ${row.hits.join(' ') || '-'}`);
  }
}

/** LIST_FLOOR of src/modules/search/map.ts:38 (not exported): rows under this share of the top row's score are not listed. */
const LIST_FLOOR = 0.12;
const round2 = (value) => Math.round(value * 100) / 100;

/**
 * Where one file fell in a buildMap result, as every stage it fails in map order: folded (a companion merged into `into`, then that row's own stages),
 * absent (not in the pool), spread, floor, cut (byte cut). `stage` is the first, or printed. `rank` and `score` are the file's pool position, or the row's it folded into;
 * `row` is the printed row number of the file or of that row.
 * A spread loss never reaches the later stages, so `counterfactual` names the ones computed as if the spread had kept it: floor from its score against the top
 * row, cut by pool rank against the delivered row count (an estimate: rows differ in bytes, the kept list is a byte prefix, so it is not exact).
 */
export function fileStage(file, map) {
  const poolOf = (name) => map.pool.findIndex((candidate) => candidate.path === name);
  const rowOf = (name) => { const at = map.candidates.findIndex((candidate) => candidate.path === name); return at === -1 ? null : at + 1; };
  const at = (name) => { const index = poolOf(name); return index === -1 ? { rank: null, score: null } : { rank: index + 1, score: map.pool[index].score }; };
  if (Object.hasOwn(map.debug.folded, file)) {
    const into = map.debug.folded[file];
    const target = into === null ? null : fileStage(into, map);
    return { stage: 'folded', stages: ['folded', ...(target?.stages ?? [])], row: into === null ? null : rowOf(into), ...(into === null ? { rank: null, score: null } : at(into)), into, counterfactual: target?.counterfactual ?? [], ...(target?.floor === undefined ? {} : { floor: target.floor }) };
  }
  if (poolOf(file) === -1) return { stage: 'absent', stages: ['absent'], row: null, rank: null, score: null, into: null, counterfactual: [] };
  const own = at(file);
  const row = rowOf(file);
  const stages = [];
  const counterfactual = [];
  let floor;
  if (map.debug.spreadDropped.includes(file)) {
    stages.push('spread');
    floor = LIST_FLOOR * round2(map.pool[0].score);
    if (round2(own.score) < floor) { stages.push('floor'); counterfactual.push('floor'); } else if (own.rank > map.candidates.length) { stages.push('cut'); counterfactual.push('cut'); }
  } else if (map.debug.floorDropped.includes(file)) stages.push('floor');
  else if (row === null) stages.push('cut');
  return { stage: stages[0] ?? 'printed', stages, row, ...own, into: null, counterfactual, ...(floor === undefined ? {} : { floor }) };
}

/** The printed rows whose pool rank is above the file's own: what the byte cut kept instead. */
export const rowsAbove = (file, map) => {
  const own = map.pool.findIndex((candidate) => candidate.path === file);
  return own === -1 ? [] : map.candidates.map((candidate, at) => ({ row: at + 1, path: candidate.path, score: candidate.score, rank: map.pool.findIndex((row) => row.path === candidate.path) + 1 })).filter((row) => row.rank <= own);
};

const ledgerOf = (taskDir) => readFileSync(path.join(taskDir, 'ledger.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));

/** The `map` entry of an archived task's ledger: what the run's own map reported (candidates before the byte cut, bytes, first-pass terms). */
export function ledgerMap(taskDir) {
  const entry = ledgerOf(taskDir).findLast((row) => row.kind === 'map');
  return entry === undefined ? null : { candidates: entry.candidates, bytes: entry.bytes, terms: entry.terms?.pass1 ?? [] };
}

/**
 * The plan route's request string (src/skills/common.ts:157,164-168) rebuilt from an archived task: the sources of the ledger's last envelope in its order
 * (envelope.ts:120-127), each from its capture file with the ledger's content hash checked, `${title}\n${content}`, plus the noted investigation text, joined by a newline.
 * `root` is the archived repository root the investigation path is relative to. The envelope's own hash is not of this string, so only the sources are proven.
 */
export function archivedRequest(taskDir, root = taskDir) {
  const entries = ledgerOf(taskDir);
  const envelope = entries.findLast((row) => row.kind === 'envelope');
  if (envelope === undefined) throw new Error(`no envelope in ${taskDir}/ledger.jsonl`);
  const captures = readdirSync(path.join(taskDir, 'requirements')).filter((name) => name.endsWith('.json')).map((name) => JSON.parse(readFileSync(path.join(taskDir, 'requirements', name), 'utf8')));
  const sources = envelope.sources.map((slim) => {
    const capture = captures.find((candidate) => candidate.key === slim.key);
    if (capture === undefined) throw new Error(`${slim.key}: no capture in requirements/`);
    if (contentHash(capture.content) !== capture.rawHash || capture.rawHash !== slim.rawHash) throw new Error(`${slim.key}: capture hash differs from the ledger`);
    return { key: slim.key, title: titleOf(capture.content, capture.key), content: capture.content };
  });
  const saved = entries.findLast((row) => row.kind === 'note' && row.note === 'investigation')?.path;
  if (typeof saved === 'string') {
    const file = path.resolve(root, saved);
    if (!existsSync(file)) throw new Error(`investigation ${saved} is not in the archive`);
    sources.push({ key: 'investigation', title: '', content: readFileSync(file, 'utf8') });
  }
  const request = sources.map((source) => `${source.title}\n${source.content}`).join('\n');
  return { request, hash: contentHash(request), sources: sources.map((source) => ({ key: source.key, chars: source.content.length })) };
}

/** A clone of the case's bench at the case's parent commit with the frozen .ambicode material; the checkout happens in the clone only. */
export function caseScratch(bench, parent, material) {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'map-replay-'));
  execFileSync('git', ['clone', '-q', '--local', '--no-hardlinks', bench, dir], { stdio: 'pipe' });
  execFileSync('git', ['checkout', '-q', '--detach', parent], { cwd: dir, stdio: 'pipe' });
  cpSync(path.join(material, '.ambicode'), path.join(dir, '.ambicode'), { recursive: true });
  return dir;
}

/** The map of one suite case as the plan route's first stage built it, and each truth file's and extra file's stage. */
export async function runReplay({ spec, name, env = process.env, material = MATERIAL, archive = ARCHIVE, stamps = STAGE1_R1 }) {
  const suite = JSON.parse(readFileSync(spec, 'utf8'));
  const entry = suite.cases.find((candidate) => candidate.name === name);
  if (entry === undefined) throw new Error(`${name} is not a case of ${spec}`);
  const variable = suite.repos[entry.repo].bench;
  if (!env[variable]) throw new Error(`env ${variable} is required for ${name}`);
  if (!Object.hasOwn(stamps, name)) throw new Error(`no archived stage-1 run is known for ${name}`);
  const stamp = stamps[name];
  const [taskDir] = globSync([archive.split(path.sep).join('/'), stamp, `${name}-chain-plan-1.ambicode`, '.ambicode', 'tasks', '*'].join('/'));
  if (taskDir === undefined) throw new Error(`no task directory in the archived run ${stamp} of ${name}`);
  const archived = archivedRequest(taskDir, path.resolve(taskDir, '..', '..', '..'));
  const request = archived.request;
  const scratch = caseScratch(env[variable], entry.parent, path.join(material, name));
  try {
    const runtime = await createRuntime({ cwd: scratch });
    const workspace = await openWorkspace(runtime);
    const project = projectForRequest(workspace.config, null, []);
    const { layers, source } = resolveLayers('prompt');
    const map = await buildMap(runtime, { project, mode: 'prompt', layers, layersSource: source, terms: [], request, paths: [], symbols: [] });
    const files = [...entry.relevant.map((file) => ({ file, kind: 'truth' })), ...(Object.hasOwn(EXTRA_FILES, name) ? EXTRA_FILES[name] : []).map((file) => ({ file, kind: 'extra' }))]
      .map((item) => ({ ...item, ...fileStage(item.file, map), above: [] }));
    for (const item of files) if (item.stage === 'cut') item.above = rowsAbove(item.file, map);
    return { name, stamp, requestChars: request.length, requestHash: archived.hash, requestSources: archived.sources, terms: map.terms.pass1, ledger: ledgerMap(taskDir), delivered: map.candidates.length, candidates: map.entry.candidates, pool: map.pool.length, bytes: map.bytes, row1: map.candidates[0]?.path ?? null, files };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

const shorten = (file) => file.split('/').slice(-2).join('/');

/** The replay table of evals/local/map-replay.md for the results of `runReplay`; a `*` after a stage marks one computed as if the spread had kept the file. */
export function replayMarkdown(results) {
  const out = ['# map replay (plan 2, p1)', '', 'Generated: `node evals/scripts/map-funnel.mjs --spec evals/local/real-cases.suite.json --case <name> ...`. Request rebuilt from run 1 of each case\'s archived stage-1 plan run, sources in ledger order.', 'File cells show the last two path segments. Stage `x*`: not observed, computed as if the spread had kept the file (floor: score under 12% of the top row; cut: pool rank past the delivered rows, an estimate). A bare `spread` file would have fit by that estimate.'];
  for (const result of results) {
    const { ledger } = result;
    const same = ledger !== null && ledger.candidates === result.candidates && ledger.bytes === result.bytes && JSON.stringify(ledger.terms) === JSON.stringify(result.terms);
    out.push('', `## ${result.name}`, `ledger: candidates ${result.candidates}/${ledger?.candidates ?? '-'}, bytes ${result.bytes}/${ledger?.bytes ?? '-'}, terms pass1 equal: ${ledger !== null && JSON.stringify(ledger.terms) === JSON.stringify(result.terms) ? 'yes' : 'no'} => ${same ? 'MATCH' : 'MISMATCH'} (replay/archived run ${result.stamp})`);
    out.push(`delivered ${result.delivered} rows, pool ${result.pool}, row 1 ${shorten(result.row1 ?? '-')}; request ${result.requestChars} chars, ${result.requestHash}, ${result.requestSources?.map((source) => source.key).join('+') ?? '-'}`, '', 'case | file | truth/extra | pool rank | stage | row | score', '--- | --- | --- | --- | --- | --- | ---');
    const label = result.name.replace('task-real-fe-vs-', '').replace('task-', '');
    for (const item of result.files) {
      const stages = item.stages.length === 0 ? 'printed' : item.stages.map((stage) => `${stage}${item.counterfactual.includes(stage) ? '*' : ''}`).join('+');
      const into = item.stage === 'folded' ? ` into ${item.into === null ? '(no source: dropped)' : shorten(item.into)}` : '';
      out.push(`${label} | ${shorten(item.file)} | ${item.kind} | ${item.rank ?? '-'} | ${stages}${into} | ${item.row ?? '-'} | ${item.score === null ? '-' : item.score.toFixed(2)}`);
    }
    for (const item of result.files) if (item.above.length > 0) out.push('', `printed above ${shorten(item.file)}: ${item.above.map((row) => `${row.row} ${shorten(row.path)} ${row.score.toFixed(2)}`).join('; ')}`);
  }
  return `${out.join('\n')}\n`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argOf = (name, fallback) => { const at = process.argv.indexOf(name); return at === -1 ? fallback : process.argv[at + 1]; };
  const specFile = argOf('--spec', null);
  if (specFile !== null) {
    const names = process.argv.flatMap((arg, at) => (arg === '--case' ? [process.argv[at + 1]] : []));
    if (names.length === 0) throw new Error('--spec needs --case <exact case name> (repeatable)');
    const results = [];
    for (const name of names) results.push(await runReplay({ spec: path.resolve(specFile), name }));
    process.stdout.write(replayMarkdown(results));
    process.exit(0);
  }
  const bench = argOf('--bench', process.env.NAV_BENCH);
  if (!bench) throw new Error('--bench <repo> is required');
  const top = Number(argOf('--top', '8'));
  print(await runFunnel({ bench, split: argOf('--split', 'all'), filter: argOf('--case', null), top }), top);
}
