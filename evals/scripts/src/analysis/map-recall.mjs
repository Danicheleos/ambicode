// How many of a localize case's true files the investigate route's map hands the model. Offline and free.
// Scaffolds each case into a temporary directory and prints counts only; `--show <dir>` saves the maps there.
// `--cases <dir>` reads cases from another directory; `--save <file>` records the counts and true paths; `--expect <file>` exits 1 when a case lost a true file or a text grew past its cap.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime } from '../../../../src/composition/root.ts';
import { openWorkspace, projectForRequest } from '../../../../src/modules/config/workspace.ts';
import { FEATURE_LIMIT_BYTES, LEADS_LIMIT_BYTES, buildMap, leadsText, rankTerms, resolveLayers } from '../../../../src/modules/search/text/map.ts';
import { splitLaunch } from '../../../../src/hook/events/prompt-launch.ts';
import { CURATED_CASES } from '../shared/bench-paths.mjs';

/** The request text the route sees: the prompt after `/ambicode:investigate` and its leading options, as the hook does. */
export function requestOf(promptMarkdown) {
  const rest = promptMarkdown.replace(/^---\n[\s\S]*?\n---\n/, '').trim().replace(/^\/ambicode:\w+\b/, '').trim();
  return splitLaunch(rest).text;
}

/** Paths a leads text lists: numbered leads (a `:line` anchor dropped), then the files of a `Same feature (<root>/):` or `Same feature "<name>":` line. */
export function mapPaths(text) {
  const leads = [...text.matchAll(/^\d+\. (\S+)/gm)].map((match) => match[1].replace(/:\d+$/, ''));
  const line = /^Same feature (?:\((.*?)\/\)|"[^"]*"): (.*)$/m.exec(text);
  const feature = line === null ? [] : line[2].split(', ').filter((file) => file !== '…').map((file) => (line[1] === undefined ? file : `${line[1]}/${file}`));
  return { leads, feature };
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
      const files = await workspace.git.listFiles(null);
      const text = requestOf(readFileSync(path.join(dir, 'prompt.with.md'), 'utf8'));
      const rank = (withProse) => rankTerms([{ title: '', content: text }], { runtime, root: workspace.repositoryRoot, project, files, withProse });
      const { layers, source } = resolveLayers(workspace.config.search, 'prompt');
      const build = (terms) => buildMap({ runtime, project, mode: 'prompt', layers, layersSource: source, terms, paths: [], symbols: [] });
      // The same prose retry the route's search.map handler makes when the first map is empty.
      const terms = await rank(false);
      let map = await build(terms);
      if (map.candidates.length === 0) {
        const wider = await rank(true);
        if (wider.join('\n') !== terms.join('\n')) map = await build(wider);
      }
      const leads = leadsText(map);
      if (show !== null) { mkdirSync(show, { recursive: true }); writeFileSync(path.join(show, `${name}.md`), `${leads}\n`); }
      const listed = mapPaths(leads);
      const full = (file) => (truth.includes(file) ? file : path.posix.join(root, file));
      const inTruth = (file) => truth.includes(full(file));
      const featureText = leads.split('\n').find((line) => line.startsWith('Same feature ')) ?? '';
      // Three stages: the ranking (its first 20, as the ledger keeps them), the 6 KiB serialized map, and the leads text the model gets.
      const ranked = (map.entry.candidatePaths ?? []).filter(inTruth).length;
      const serialized = map.candidates.slice(0, 20).map((c) => c.path).filter(inTruth).length;
      rows.push({
        name, truth: truth.length, ranked, serialized, leads: listed.leads.length, trueLeads: listed.leads.filter(inTruth).length,
        feature: listed.feature.length, trueFeature: listed.feature.filter(inTruth).length, bytes: Buffer.byteLength(leads),
        leadBytes: Buffer.byteLength(leads) - (featureText === '' ? 0 : Buffer.byteLength(featureText) + 1), featureBytes: Buffer.byteLength(featureText),
        truePaths: [...new Set([...listed.leads, ...listed.feature].filter(inTruth).map(full))].sort(),
      });
    } finally {
      rmSync(work, { recursive: true, force: true, maxRetries: 5 });
    }
  }
  return rows;
}

/** Problems against a saved run: true files the map no longer lists, and texts over their byte caps. Cases by number. */
export function regressions(rows, expected) {
  const problems = [];
  rows.forEach((row, index) => {
    const id = String(index + 1).padStart(2, '0');
    const lost = (expected[row.name]?.truePaths ?? []).filter((file) => !row.truePaths.includes(file)).length;
    if (lost > 0) problems.push(`${id}: lost ${lost} true file(s)`);
    if (row.leadBytes > LEADS_LIMIT_BYTES) problems.push(`${id}: leads ${row.leadBytes} B over ${LEADS_LIMIT_BYTES}`);
    if (row.featureBytes > FEATURE_LIMIT_BYTES) problems.push(`${id}: feature line ${row.featureBytes} B over ${FEATURE_LIMIT_BYTES}`);
  });
  return problems;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const option = (name) => { const at = process.argv.indexOf(name); return at < 0 ? null : path.resolve(process.argv[at + 1]); };
  const rows = await mapRecall({ show: option('--show'), ...(option('--cases') === null ? {} : { cases: option('--cases') }) });
  rows.forEach((r, index) => console.log(`${String(index + 1).padStart(2, '0')} truth ${r.truth} ranked20 ${r.ranked} serialized20 ${r.serialized} leads ${r.trueLeads}/${r.leads} feature ${r.trueFeature}/${r.feature} bytes ${r.bytes}`));
  const sum = (key) => rows.reduce((a, r) => a + r[key], 0);
  console.log(`all: true in map ${sum('trueLeads') + sum('trueFeature')}/${sum('truth')} (leads ${sum('trueLeads')}, feature ${sum('trueFeature')}); listed ${sum('leads') + sum('feature')}; ranked top 20 ${sum('ranked')}, serialized top 20 ${sum('serialized')}`);
  const macro = (pick) => (rows.reduce((a, r) => a + pick(r) / r.truth, 0) / rows.length).toFixed(3);
  console.log(`macro recall: ranked20 ${macro((r) => r.ranked)} delivered ${macro((r) => r.truePaths.length)}; cases with no true file delivered ${rows.filter((r) => r.truePaths.length === 0).length}/${rows.length}`);
  const save = option('--save');
  if (save !== null) writeFileSync(save, `${JSON.stringify(Object.fromEntries(rows.map(({ name, ...row }) => [name, row])), null, 1)}\n`);
  const expect = option('--expect');
  if (expect !== null) {
    const problems = regressions(rows, JSON.parse(readFileSync(expect, 'utf8')));
    for (const line of problems) console.log(`regression ${line}`);
    if (problems.length > 0) process.exitCode = 1;
  }
}
