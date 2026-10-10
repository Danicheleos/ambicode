// How many of a localize case's true files the investigate route's map hands the model. Offline and free.
// Scaffolds each case into a temporary directory and prints counts only; `--show <dir>` saves the maps there.
// `--cases <dir>` reads cases from another directory; `--save <file>` records the counts and true paths; `--expect <file>` exits 1 when a case lost a true file or the map grew past its byte cap.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime } from '../../../../src/composition/root.ts';
import { openWorkspace, projectForRequest } from '../../../../src/modules/config/workspace.ts';
import { MAP_LIMIT_BYTES, buildMap, resolveLayers } from '../../../../src/modules/search/map.ts';
import { splitLaunch } from '../../../../src/hook/events/prompt-launch.ts';
import { CURATED_CASES } from '../shared/bench-paths.mjs';

/** The request text the route sees: the prompt after `/ambicode:investigate` and its leading options, as the hook does. */
export function requestOf(promptMarkdown) {
  const rest = promptMarkdown.replace(/^---\n[\s\S]*?\n---\n/, '').trim().replace(/^\/ambicode:\w+\b/, '').trim();
  return splitLaunch(rest).text;
}

/** Candidate paths in a delivered map text: its first line names the layers, the second is the JSON document. */
export function mapPaths(text) {
  for (const line of text.split('\n')) {
    if (!line.startsWith('{"terms"')) continue;
    try { return { leads: JSON.parse(line).candidates.map((row) => row[0]) }; } catch { /* a truncated line lists nothing */ }
  }
  return { leads: [] };
}

export async function mapRecall({ cases = CURATED_CASES, show = null } = {}) {
  const rows = [];
  for (const name of readdirSync(cases).filter((n) => !n.includes('review')).sort()) {
    const dir = path.join(cases, name);
    if (!existsSync(path.join(dir, 'prompt.with.md')) || !existsSync(path.join(dir, 'truth.json'))) continue;
    const { kind, truth, root = '' } = JSON.parse(readFileSync(path.join(dir, 'truth.json'), 'utf8'));
    // The core suite's plan and task cases share the ticket and truth, but not the investigate route this measures.
    if (kind !== undefined && kind !== 'localize') continue;
    const work = mkdtempSync(path.join(tmpdir(), 'map-recall-'));
    try {
      execFileSync('sh', [path.join(dir, 'scaffold.sh')], { cwd: work, stdio: 'ignore' });
      const repo = path.join(work, 'repo');
      const runtime = await createRuntime({ cwd: repo });
      const workspace = await openWorkspace(runtime);
      const project = projectForRequest(workspace.config, null, []);
      const request = requestOf(readFileSync(path.join(dir, 'prompt.with.md'), 'utf8'));
      const { layers, source } = resolveLayers(workspace.config.search, 'prompt');
      const map = await buildMap(runtime, { project, mode: 'prompt', layers, layersSource: source, request });
      if (show !== null) { mkdirSync(show, { recursive: true }); writeFileSync(path.join(show, `${name}.md`), `${map.text}\n`); }
      const full = (file) => (truth.includes(file) ? file : path.posix.join(root, file));
      const inTruth = (file) => truth.includes(full(file));
      // `listed` is what the 6 KiB text kept; `entry.candidates` counts the ranking before the cut.
      const listed = map.candidates.map((c) => c.path);
      rows.push({
        name, truth: truth.length, ranked: map.entry.candidates, listed: listed.length, trueListed: listed.filter(inTruth).length,
        top20: listed.slice(0, 20).filter(inTruth).length, bytes: map.bytes, truePaths: [...new Set(listed.filter(inTruth).map(full))].sort(),
      });
    } finally {
      rmSync(work, { recursive: true, force: true, maxRetries: 5 });
    }
  }
  return rows;
}

/** Problems against a saved run: true files the map no longer lists, and a text over the byte cap. Cases by number. */
export function regressions(rows, expected) {
  const problems = [];
  rows.forEach((row, index) => {
    const id = String(index + 1).padStart(2, '0');
    const lost = (expected[row.name]?.truePaths ?? []).filter((file) => !row.truePaths.includes(file)).length;
    if (lost > 0) problems.push(`${id}: lost ${lost} true file(s)`);
    if (row.bytes > MAP_LIMIT_BYTES) problems.push(`${id}: map ${row.bytes} B over ${MAP_LIMIT_BYTES}`);
  });
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const option = (name) => { const at = process.argv.indexOf(name); return at < 0 ? null : path.resolve(process.argv[at + 1]); };
  const rows = await mapRecall({ show: option('--show'), ...(option('--cases') === null ? {} : { cases: option('--cases') }) });
  rows.forEach((r, index) => console.log(`${String(index + 1).padStart(2, '0')} truth ${r.truth} ranked ${r.ranked} listed ${r.listed} true ${r.trueListed} top20 ${r.top20} bytes ${r.bytes}`));
  const sum = (key) => rows.reduce((a, r) => a + r[key], 0);
  console.log(`all: true in map ${sum('trueListed')}/${sum('truth')}; listed ${sum('listed')}; true in top 20 ${sum('top20')}`);
  const macro = rows.reduce((a, r) => a + r.truePaths.length / r.truth, 0) / rows.length;
  console.log(`macro recall ${macro.toFixed(3)}; cases with no true file listed ${rows.filter((r) => r.truePaths.length === 0).length}/${rows.length}`);
  const save = option('--save');
  if (save !== null) writeFileSync(save, `${JSON.stringify(Object.fromEntries(rows.map(({ name, ...row }) => [name, row])), null, 1)}\n`);
  const expect = option('--expect');
  if (expect !== null) {
    const problems = regressions(rows, JSON.parse(readFileSync(expect, 'utf8')));
    for (const line of problems) console.log(`regression ${line}`);
    if (problems.length > 0) process.exitCode = 1;
  }
}
