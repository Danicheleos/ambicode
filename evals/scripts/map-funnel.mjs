// $0 per-case funnel of the map on the map bench: for each truth folder, was a file of it in the ranked pool, printed, in the top N;
// and which extracted terms produced the printed folders that the truth does not accept (noise). map-bench.mjs stores the same stages in its result JSON.
//   node evals/scripts/map-funnel.mjs --bench <repo> [--split tune|hold|all] [--case <substring>] [--top 8]
//   node evals/scripts/map-funnel.mjs --spec evals/local/real-cases.suite.json --case <exact name> [--extra <file>]...   (replay mode, below)
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
      const request = promptOf(readFileSync(path.join(cases, entry, 'prompt.md'), 'utf8'));
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

/**
 * Where one file fell in a buildMap result: folded (a companion merged into `into`), absent (not in the pool), spread, floor, cut (byte cut) or printed.
 * `rank` and `score` are the file's own pool position, or the row's it folded into; `row` is the printed row number of the file or of that row.
 */
export function fileStage(file, map) {
  const poolOf = (name) => map.pool.findIndex((candidate) => candidate.path === name);
  const rowOf = (name) => { const at = map.candidates.findIndex((candidate) => candidate.path === name); return at === -1 ? null : at + 1; };
  const at = (name) => { const index = poolOf(name); return index === -1 ? { rank: null, score: null } : { rank: index + 1, score: map.pool[index].score }; };
  const into = map.debug.folded[file];
  if (into !== undefined) return { stage: 'folded', into, row: into === null ? null : rowOf(into), ...(into === null ? { rank: null, score: null } : at(into)) };
  if (poolOf(file) === -1) return { stage: 'absent', row: null, rank: null, score: null, into: null };
  const stage = map.debug.spreadDropped.includes(file) ? 'spread' : map.debug.floorDropped.includes(file) ? 'floor' : rowOf(file) === null ? 'cut' : 'printed';
  return { stage, row: rowOf(file), ...at(file), into: null };
}

/** The printed rows whose pool rank is above the file's own: what the byte cut kept instead. */
export const rowsAbove = (file, map) => {
  const own = map.pool.findIndex((candidate) => candidate.path === file);
  return own === -1 ? [] : map.candidates.map((candidate, at) => ({ row: at + 1, path: candidate.path, score: candidate.score, rank: map.pool.findIndex((row) => row.path === candidate.path) + 1 })).filter((row) => row.rank <= own);
};

/** The plan route's request string (src/skills/common.ts:167) for the captured sources of an archived run: `${title}\n${content}` joined by a newline. */
export function requestOf(requirementsDir) {
  const sources = readdirSync(requirementsDir).sort().filter((name) => name.endsWith('.json')).map((name) => JSON.parse(readFileSync(path.join(requirementsDir, name), 'utf8')));
  return sources.map((source) => `${titleOf(source.content, source.key)}\n${source.content}`).join('\n');
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
export async function runReplay({ spec, name, env = process.env, extras = [], material = MATERIAL, archive = ARCHIVE, stamps = STAGE1_R1 }) {
  const suite = JSON.parse(readFileSync(spec, 'utf8'));
  const entry = suite.cases.find((candidate) => candidate.name === name);
  if (entry === undefined) throw new Error(`${name} is not a case of ${spec}`);
  const variable = suite.repos[entry.repo].bench;
  if (!env[variable]) throw new Error(`env ${variable} is required for ${name}`);
  const stamp = stamps[name];
  if (stamp === undefined) throw new Error(`no archived stage-1 run is known for ${name}`);
  const [runDir] = globSync(path.join(archive, stamp, `${name}-chain-plan-1.ambicode`, '.ambicode', 'tasks', '*', 'requirements'));
  if (runDir === undefined) throw new Error(`no requirements/ in the archived run ${stamp} of ${name}`);
  const request = requestOf(runDir);
  const scratch = caseScratch(env[variable], entry.parent, path.join(material, name));
  try {
    const runtime = await createRuntime({ cwd: scratch });
    const workspace = await openWorkspace(runtime);
    const project = projectForRequest(workspace.config, null, []);
    const { layers, source } = resolveLayers('prompt');
    const map = await buildMap(runtime, { project, mode: 'prompt', layers, layersSource: source, terms: [], request, paths: [], symbols: [] });
    const files = [...entry.relevant.map((file) => ({ file, kind: 'truth' })), ...[...(EXTRA_FILES[name] ?? []), ...extras].map((file) => ({ file, kind: 'extra' }))]
      .map((item) => ({ ...item, ...fileStage(item.file, map), above: [] }));
    for (const item of files) if (item.stage === 'cut') item.above = rowsAbove(item.file, map);
    return { name, stamp, requestChars: request.length, delivered: map.candidates.length, candidates: map.entry.candidates, pool: map.pool.length, bytes: map.bytes, row1: map.candidates[0]?.path ?? null, files };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function printReplay(result) {
  console.log(`\n## ${result.name}: delivered/candidates ${result.delivered}/${result.candidates}, pool ${result.pool}, ${result.bytes} B, row 1 ${result.row1}; request from ${result.stamp} (run 1), ${result.requestChars} chars`);
  console.log('file | truth/extra | pool rank | stage | row | score');
  for (const item of result.files) {
    console.log(`${item.file} | ${item.kind} | ${item.rank ?? '-'} | ${item.stage}${item.stage === 'folded' ? ` into ${item.into ?? '(no source in folder: dropped)'}` : ''} | ${item.row ?? '-'} | ${item.score ?? '-'}`);
    if (item.above.length > 0) console.log(`  printed above it: ${item.above.map((row) => `${row.row}:${row.path}(${row.score})`).join(' ')}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argOf = (name, fallback) => { const at = process.argv.indexOf(name); return at === -1 ? fallback : process.argv[at + 1]; };
  const specFile = argOf('--spec', null);
  if (specFile !== null) {
    const name = argOf('--case', null);
    if (name === null) throw new Error('--spec needs --case <exact case name>');
    const extras = process.argv.flatMap((arg, at) => (arg === '--extra' ? [process.argv[at + 1]] : []));
    printReplay(await runReplay({ spec: path.resolve(specFile), name, extras }));
    process.exit(0);
  }
  const bench = argOf('--bench', process.env.NAV_BENCH);
  if (!bench) throw new Error('--bench <repo> is required');
  const top = Number(argOf('--top', '8'));
  print(await runFunnel({ bench, split: argOf('--split', 'all'), filter: argOf('--case', null), top }), top);
}
