// How often the file shortlist `prepare` hands the agent contains the files a real ticket's change touched.
// Offline and free: no model runs. Reads benchmarks/ and prints counts and per-case numbers, never text.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime, openWorkspace, projectForRequest } from '../../../src/composition/root.ts';
import { locate, termsFromRequirements, PREPARE_SHORTLIST_LIMIT } from '../../../src/code-intelligence/locate.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const CASES = path.join(ROOT, 'benchmarks', 'cases');

/** The ticket text between the prompt's <ticket> tags, which is what a requirement fetch would return. */
export function ticketOf(promptMarkdown) {
  const match = /<ticket>\s*([\s\S]*?)\s*<\/ticket>/.exec(promptMarkdown);
  return match === null ? null : match[1];
}

export async function shortlistRecall({ repos, limit = PREPARE_SHORTLIST_LIMIT, termsOf = (ticket) => termsFromRequirements([{ title: '', content: ticket }]) }) {
  const workspaces = {};
  for (const [side, dir] of Object.entries(repos)) workspaces[side] = await openWorkspace(await createRuntime({ cwd: dir }));
  const rows = [];
  for (const name of readdirSync(CASES).filter((n) => !n.includes('review')).sort()) {
    const truthFile = path.join(CASES, name, 'truth.json');
    if (!existsSync(truthFile)) continue;
    const { side, truth, missingFromSnapshot = [] } = JSON.parse(readFileSync(truthFile, 'utf8'));
    const workspace = workspaces[side];
    const ticket = ticketOf(readFileSync(path.join(CASES, name, 'prompt.md'), 'utf8'));
    if (workspace === undefined || ticket === null) continue;
    const reachable = truth.filter((file) => !missingFromSnapshot.includes(file));
    if (reachable.length === 0) continue;
    const terms = termsOf(ticket);
    const project = projectForRequest(workspace.config, null, []);
    const found = await locate({ git: workspace.git, project, terms, limit });
    const paths = found.candidates.map((c) => c.path);
    const hit = reachable.filter((file) => paths.includes(file)).length;
    rows.push({ name, side, truth: reachable.length, hit, recall: hit / reachable.length, candidates: paths.length, terms: found.terms.length });
  }
  return rows;
}

const mean = (xs) => (xs.reduce((a, b) => a + b, 0) / (xs.length || 1)).toFixed(3);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [be, fe] = process.argv.slice(2);
  if (!be || !fe) throw new Error('usage: shortlist-recall.mjs <BE snapshot repo> <FE snapshot repo> [limit]');
  const limitAt = process.argv[4] === undefined ? undefined : Number(process.argv[4]);
  const rows = await shortlistRecall({ repos: { BE: be, FE: fe }, ...(limitAt === undefined ? {} : { limit: limitAt }) });
  for (const r of rows) console.log(`${r.name.padEnd(12)} ${r.side} truth ${r.truth} hit ${r.hit} recall ${r.recall.toFixed(2)} candidates ${r.candidates}`);
  for (const side of ['BE', 'FE', 'all']) {
    const g = rows.filter((r) => side === 'all' || r.side === side);
    console.log(`${side}: n=${g.length} mean recall@${limitAt ?? PREPARE_SHORTLIST_LIMIT} ${mean(g.map((r) => r.recall))} cases with any hit ${g.filter((r) => r.hit > 0).length}/${g.length}`);
  }
}
