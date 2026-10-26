// $0 per-case funnel of the map on the map bench: for each truth folder, was a file of it in the ranked pool, printed, in the top N;
// and which extracted terms produced the printed folders that the truth does not accept (noise). map-bench.mjs stores the same stages in its result JSON.
//   node evals/scripts/map-funnel.mjs --bench <repo> [--split tune|hold|all] [--case <substring>] [--top 8]
// It calls buildMap in-process with the request the investigate route builds for a headless prompt, in the same scratch clone the bench uses.
import { existsSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime } from '#composition/root';
import { openWorkspace, projectForRequest } from '#modules/config/workspace';
import { buildMap, resolveLayers } from '#modules/search/map';
import { halvesOf, promptOf, scratchOf } from './map-bench.mjs';
import { truthFolders } from './folder-truth.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CASES = path.join(REPO, 'bench', 'map');

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

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argOf = (name, fallback) => { const at = process.argv.indexOf(name); return at === -1 ? fallback : process.argv[at + 1]; };
  const bench = argOf('--bench', process.env.NAV_BENCH);
  if (!bench) throw new Error('--bench <repo> is required');
  const top = Number(argOf('--top', '8'));
  print(await runFunnel({ bench, split: argOf('--split', 'all'), filter: argOf('--case', null), top }), top);
}
