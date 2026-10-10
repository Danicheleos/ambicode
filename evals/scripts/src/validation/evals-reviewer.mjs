// Review-case helpers for the plugin subagent reviewer (agents/reviewer.md). The subagent only runs inside a live
// Claude Code session, so the harness replays a findings fixture through `review record` instead of spawning one.
import { spawnSync } from 'node:child_process';
import { mkdtemp, readdir, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT } from '../shared/bench-paths.mjs';

const EVALS = path.join(ROOT, 'evals', 'common', 'archived', 'typescript');
const AMBICODE = path.join(ROOT, 'scripts', 'ambicode.mjs');
const FINDINGS_FIXTURE = 'findings.json';

const isBenchReview = (scaffoldSource) => scaffoldSource.includes('ambicode-evals-assets/benchmarks/');
/** A benchmark review case: `be-vs-12-review-03` (curated) or `be-vs-12-review` (preset). */
export const isBenchReviewCase = (scaffold) => isBenchReview(scaffold.source) && /-review(-|$)/.test(scaffold.name);

export async function loadScaffolds(evalsDirectory = EVALS) {
  const scaffolds = [];
  for (const entry of await readdir(evalsDirectory, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name === 'results' || entry.name.startsWith('.')) continue;
    const directory = path.join(evalsDirectory, entry.name);
    const source = await readFile(path.join(directory, 'scaffold.sh'), 'utf8');
    const fixture = /materialize\.mjs" ([a-z0-9-]+)/.exec(source)?.[1];
    // Curated benchmark cases scaffold from a checked-out project, not a fixture.
    if (!fixture && !isBenchReview(source)) throw new Error(`${entry.name}/scaffold.sh materializes no fixture`);
    scaffolds.push({ name: entry.name, directory, source, fixture });
  }
  return scaffolds;
}

export async function reviewCases(evalsDirectory, only) {
  const cases = [];
  for (const scaffold of await loadScaffolds(evalsDirectory)) {
    const fired = await readFile(path.join(scaffold.directory, 'graders', 'plugin-fired.md'), 'utf8').catch(() => '');
    if (!fired.includes('"ambicode:review"') && !isBenchReviewCase(scaffold)) continue;
    if (only.length > 0 && !only.includes(scaffold.name)) continue;
    const prompt = await readFile(path.join(scaffold.directory, 'prompt.md'), 'utf8');
    const body = /^---\n[\s\S]*?\n---\n([\s\S]*)$/.exec(prompt)?.[1]?.trim();
    if (!body) throw new Error(`${scaffold.name}/prompt.md has no body`);
    cases.push({ ...scaffold, prompt: body });
  }
  const unknown = only.filter((name) => !cases.some((c) => c.name === name));
  if (unknown.length > 0) throw new Error(`not a review case: ${unknown.join(', ')}`);
  if (cases.length === 0) throw new Error(`no review case under ${evalsDirectory}`);
  return cases;
}

/** mulberry32: a seeded shuffle, so a sheet and its key can be rebuilt exactly. */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The sheet names neither the arm nor the run; rows are shuffled across cases. */
export function blindSheet(runs, seed) {
  const rows = runs.flatMap((run) =>
    (run.findings ?? []).map((finding, index) => ({ run, finding, index })),
  );
  const next = random(seed);
  for (let i = rows.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  const id = (i) => `F${String(i + 1).padStart(3, '0')}`;
  return {
    sheet: [
      ['id', 'case', 'path', 'line', 'claim', 'label', 'notes'],
      ...rows.map(({ run, finding }, i) => [id(i), run.case, finding.path, finding.line, finding.claim, '', '']),
    ],
    key: [
      ['id', 'case', 'arm', 'run', 'finding'],
      ...rows.map(({ run, index }, i) => [id(i), run.case, run.arm, run.run, index]),
    ],
  };
}

const cli = (repo, args, input = '') => {
  const child = spawnSync(process.execPath, [AMBICODE, ...args, '--json'], { cwd: repo, input, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let output = null;
  try { output = JSON.parse(child.stdout); } catch { /* reported below with the process's own diagnostic */ }
  if (output === null) throw new Error(`ambicode ${args.join(' ')} failed (exit ${child.status}): ${(child.stderr || child.stdout).trim().slice(0, 500)}`);
  return output;
};

/**
 * Scaffolds the case, opens a review for `task`, and records `<case>/findings.json` (`{ findings, coverageNotes }`)
 * as the reviewer's answer. Returns the recorded review result.
 */
export async function replayFindings(evalCase, { task = 'eval-review' } = {}) {
  const fixture = await readFile(path.join(evalCase.directory, FINDINGS_FIXTURE), 'utf8').catch(() => {
    throw new Error(`${evalCase.name} has no ${FINDINGS_FIXTURE}; the reviewer subagent only runs in a live Claude Code session`);
  });
  const directory = await mkdtemp(path.join(tmpdir(), `ambicode-reviewer-${evalCase.name}-`));
  try {
    const scaffold = spawnSync('sh', [path.join(evalCase.directory, 'scaffold.sh')], { cwd: directory, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
    if (scaffold.status !== 0) throw new Error(`${evalCase.name}: scaffold failed: ${(scaffold.stderr || scaffold.stdout).trim().slice(0, 300)}`);
    const repo = path.join(directory, 'repo');
    cli(repo, ['review', '--task', task]);
    return cli(repo, ['review', 'record', '--task', task], fixture).result;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

export async function main() {
  throw new Error('the live review eval needs a Claude Code session that can launch the ambicode reviewer subagent (agents/reviewer.md); offline, `replayFindings` feeds a findings fixture to `review record`');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
