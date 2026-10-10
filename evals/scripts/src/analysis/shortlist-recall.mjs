// How often the map's candidate list contains the files a real ticket's change touched.
// Offline and free: no model runs. Reads the full sets and prints numbers only: no case name, ticket text, term or path.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime } from '../../../../src/composition/root.ts';
import { openWorkspace, projectForRequest } from '../../../../src/modules/config/workspace.ts';
import { buildMap, termsFromRequirements } from '../../../../src/modules/search/map.ts';
import { CASES_ROOT, FULL_CASES_DIRECTORY, projectCasesDir } from '../shared/bench-paths.mjs';

const MAP_LAYERS = ['shortlist', 'harvest', 'shortlist'];
export const DEFAULT_LIMIT = 15;
const SIDES = ['BE-express', 'FE-angular'];

/** The ticket text between the prompt's <ticket> tags, which is what a requirement fetch would return. */
export function ticketOf(promptMarkdown) {
  const match = /<ticket>\s*([\s\S]*?)\s*<\/ticket>/.exec(promptMarkdown);
  return match === null ? null : match[1];
}

/** Per localize case, recall@limit of the map's candidates built from the ticket's terms; no model, no ledger. */
export async function shortlistRecall({ repos, cases: casesRoot = CASES_ROOT, limit = DEFAULT_LIMIT, termsOf = (ticket) => termsFromRequirements([{ title: '', content: ticket }]) }) {
  const sides = {};
  for (const [side, dir] of Object.entries(repos)) {
    const runtime = await createRuntime({ cwd: dir });
    const workspace = await openWorkspace(runtime);
    sides[side] = { runtime, project: projectForRequest(workspace.config, null, []) };
  }
  const rows = [];
  // Each project's full set: `evals/<project>/full/`.
  const caseDirs = Object.keys(repos).flatMap((side) => {
    const cases = projectCasesDir(FULL_CASES_DIRECTORY, side, casesRoot);
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
    const map = await buildMap(entry.runtime, { project: entry.project, mode: 'prompt', layers: MAP_LAYERS, layersSource: 'route', terms: termsOf(ticket) });
    const paths = map.candidates.slice(0, limit).map((c) => c.path);
    rows.push({ side, truth: reachable.length, recall: reachable.filter((file) => paths.includes(file)).length / reachable.length });
  }
  return rows;
}

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / (xs.length || 1);

/** Per side: n and mean recall. Numbers only, no case name, ticket text, term or path. */
export function summarize(rows, { limit = DEFAULT_LIMIT } = {}) {
  return SIDES.map((side) => {
    const group = rows.filter((row) => row.side === side);
    return `${side}: n=${group.length} recall@${limit} ${mean(group.map((row) => row.recall)).toFixed(3)}`;
  });
}

export function parseArgv(argv) {
  const positionals = [];
  let cases = CASES_ROOT;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--cases') {
      const value = argv[i + 1];
      if (value === undefined) throw new Error('--cases needs a value');
      if (!path.isAbsolute(value)) throw new Error(`--cases takes an absolute path, not ${value}`);
      cases = value;
      i += 1;
    } else positionals.push(argv[i]);
  }
  const [be, fe, limitAt] = positionals;
  if (!be || !fe) throw new Error('usage: shortlist-recall.mjs <BE-express repo> <FE-angular repo> [limit] [--cases <absolute dir>]');
  return { repos: { 'BE-express': be, 'FE-angular': fe }, ...(limitAt === undefined ? {} : { limit: Number(limitAt) }), cases };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const options = parseArgv(process.argv.slice(2));
  const rows = await shortlistRecall(options);
  for (const line of summarize(rows, options)) console.log(line);
}
