// How many of a localize case's true files the investigate route's map hands the model. Offline and free.
// Scaffolds each case into a temporary directory and prints counts only; `--show <dir>` saves the maps there.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime, openWorkspace, projectForRequest } from '../../../../src/composition/root.ts';
import { buildMap, leadsText, rankTerms, resolveLayers } from '../../../../src/code-intelligence/map.ts';
import { tokenize } from '../../../../src/hook/events/prompt-launch.ts';
import { parseArgs } from '../../../../src/cli/args.ts';
import { ROUTE_START_OPTIONS } from '../../../../src/cli/commands/route.ts';
import { CURATED_CASES } from '../shared/bench-paths.mjs';

/** The request text the route sees: the prompt after `/ambicode:investigate`, split and rejoined as the hook does. */
export function requestOf(promptMarkdown) {
  const rest = promptMarkdown.replace(/^---\n[\s\S]*?\n---\n/, '').trim().replace(/^\/ambicode:\w+\b/, '').trim();
  try {
    return parseArgs('route start', tokenize(rest), ROUTE_START_OPTIONS).positionals.join(' ');
  } catch {
    return rest;
  }
}

/** Paths a leads text lists: numbered leads, then the files of a `Same feature (<root>/):` line. */
export function mapPaths(text) {
  const leads = [...text.matchAll(/^\d+\. (\S+)/gm)].map((match) => match[1]);
  const line = /^Same feature \((.*?)\/\): (.*)$/m.exec(text);
  const feature = line === null ? [] : line[2].split(', ').filter((file) => file !== '…').map((file) => `${line[1]}/${file}`);
  return { leads, feature };
}

export async function mapRecall({ cases = CURATED_CASES, show = null } = {}) {
  const rows = [];
  for (const name of readdirSync(cases).filter((n) => !n.includes('review')).sort()) {
    const dir = path.join(cases, name);
    if (!existsSync(path.join(dir, 'prompt.with.md')) || !existsSync(path.join(dir, 'truth.json'))) continue;
    const { truth, root = '' } = JSON.parse(readFileSync(path.join(dir, 'truth.json'), 'utf8'));
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
      const full = (file) => path.posix.join(root, file);
      const inTruth = (file) => truth.includes(full(file)) || truth.includes(file);
      rows.push({
        name, truth: truth.length, leads: listed.leads.length, trueLeads: listed.leads.filter(inTruth).length,
        feature: listed.feature.length, trueFeature: listed.feature.filter(inTruth).length, bytes: Buffer.byteLength(leads),
      });
    } finally {
      rmSync(work, { recursive: true, force: true, maxRetries: 5 });
    }
  }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--show');
  const rows = await mapRecall({ show: at < 0 ? null : path.resolve(process.argv[at + 1]) });
  for (const r of rows) console.log(`${r.name.padEnd(12)} truth ${r.truth} leads ${r.trueLeads}/${r.leads} feature ${r.trueFeature}/${r.feature} bytes ${r.bytes}`);
  const sum = (key) => rows.reduce((a, r) => a + r[key], 0);
  console.log(`all: true in map ${sum('trueLeads') + sum('trueFeature')}/${sum('truth')} (leads ${sum('trueLeads')}, feature ${sum('trueFeature')}); listed ${sum('leads') + sum('feature')}`);
}
