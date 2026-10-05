// How often the file shortlist `prepare` hands the agent contains the files a real ticket's change touched.
// Offline and free: no model runs. Reads benchmarks/ and prints counts and per-case numbers, never text.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRuntime, openWorkspace, projectForRequest } from '../../../../src/composition/root.ts';
import { locate, shortlistRules, shortlistable, termsFromRequirements, PREPARE_SHORTLIST_LIMIT } from '../../../../src/code-intelligence/locate.ts';

import { ROOT } from '../shared/bench-paths.mjs';
const CASES = path.join(ROOT, 'benchmarks', 'cases');

/** The ticket text between the prompt's <ticket> tags, which is what a requirement fetch would return. */
export function ticketOf(promptMarkdown) {
  const match = /<ticket>\s*([\s\S]*?)\s*<\/ticket>/.exec(promptMarkdown);
  return match === null ? null : match[1];
}

export async function shortlistRecall({ repos, unfiltered = false, limit = PREPARE_SHORTLIST_LIMIT, termsOf = (ticket) => termsFromRequirements([{ title: '', content: ticket }]) }) {
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
    // `unfiltered` reproduces the shortlist before the project's include/exclude lists applied.
    const found = await locate({ git: workspace.git, project: unfiltered ? { ...project, shortlist: { include: [], exclude: [] } } : project, terms, limit });
    const paths = found.candidates.map((c) => c.path);
    const hit = reachable.filter((file) => paths.includes(file)).length;
    // The files an agent navigates: what the change touched, minus what the project's shortlist rules leave out.
    const rules = shortlistRules(project);
    const navigable = reachable.filter((file) => shortlistable(file, rules));
    const navigableHit = navigable.filter((file) => paths.includes(file)).length;
    rows.push({
      name, side, truth: reachable.length, hit, recall: hit / reachable.length, candidates: paths.length, terms: found.terms.length,
      navigable: navigable.length, navigableHit, navigableRecall: navigable.length === 0 ? null : navigableHit / navigable.length,
      noise: paths.filter((file) => !shortlistable(file, rules)).length,
    });
  }
  return rows;
}

const mean = (xs) => (xs.reduce((a, b) => a + b, 0) / (xs.length || 1)).toFixed(3);

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [be, fe] = process.argv.slice(2);
  if (!be || !fe) throw new Error('usage: shortlist-recall.mjs <BE snapshot repo> <FE snapshot repo> [limit]');
  const limitAt = process.argv[4] === undefined || process.argv[4].startsWith('--') ? undefined : Number(process.argv[4]);
  const unfiltered = process.argv.includes('--unfiltered');
  const rows = await shortlistRecall({ repos: { BE: be, FE: fe }, unfiltered, ...(limitAt === undefined ? {} : { limit: limitAt }) });
  for (const r of rows) console.log(`${r.name.padEnd(12)} ${r.side} truth ${r.truth} hit ${r.hit} recall ${r.recall.toFixed(2)} candidates ${r.candidates}`);
  for (const side of ['BE', 'FE', 'all']) {
    const g = rows.filter((r) => side === 'all' || r.side === side);
    const nav = g.filter((r) => r.navigableRecall !== null);
    console.log(`${side}: n=${g.length} mean recall@${limitAt ?? PREPARE_SHORTLIST_LIMIT} ${mean(g.map((r) => r.recall))} cases with any hit ${g.filter((r) => r.hit > 0).length}/${g.length}`);
    console.log(`${side}: navigable-only recall ${mean(nav.map((r) => r.navigableRecall))} (n=${nav.length}); candidates outside the shortlist rules ${g.reduce((a, r) => a + r.noise, 0)} of ${g.reduce((a, r) => a + r.candidates, 0)}`);
  }
}
