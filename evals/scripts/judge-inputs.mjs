// Lists, per run of one eval stamp, what a blind judge needs: ticket file, diff, base commit, bench checkout, policy dir.
//   node evals/scripts/judge-inputs.mjs <stamp>... [--arm plugin|bare]    (arm defaults to where the stamp's aggregate-result.json is)
// Reads results/[bare/]<stamp>/aggregate-result.json, traces/<arm>/<stamp>/<case>-<n>.diff, the case's scaffold.sh (`git archive <sha>`)
// and evals/local/real-cases.suite.json (ticket, frozen policies under suite-real-material/<case>/.ambicode/policies).
// The judge-facing lines carry no arm, stamp or case name: the diff is copied to an arm-neutral temp path (the original path names the arm).
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { archiveOf } from './context.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const readJson = (file) => JSON.parse(readFileSync(file, 'utf8'));

/** The case a chain or plan stage case was cut from: the suite-real name without its `-chain` / `-plan` suffix. */
export const baseName = (name) => name.replace(/-(chain-plan|chain|plan)$/, '');

/** `<run>.ambicode/.ambicode/tasks/<slug>/plan.md` of a plugin run, as run.mjs harvests it, or null. */
function planOf(archiveRun) {
  const tasks = path.join(archiveRun, '.ambicode', 'tasks');
  for (const slug of existsSync(tasks) ? readdirSync(tasks) : []) if (existsSync(path.join(tasks, slug, 'plan.md'))) return path.join(tasks, slug, 'plan.md');
  return null;
}

export function judgeInputs({ stamp, arm, root = ROOT, archive, tmp = tmpdir() }) {
  if (arm !== undefined && arm !== 'plugin' && arm !== 'bare') throw new Error(`--arm must be plugin or bare, got ${arm}`);
  const results = path.join(root, 'evals', 'cases', 'results');
  const dirOf = (a) => path.join(a === 'bare' ? path.join(results, 'bare') : results, stamp);
  const found = arm ?? ['plugin', 'bare'].find((a) => existsSync(path.join(dirOf(a), 'aggregate-result.json')));
  if (!found || !existsSync(path.join(dirOf(found), 'aggregate-result.json'))) throw new Error(`no ${found ?? ''} aggregate-result.json for stamp ${stamp} under ${results}`.replace('no  ', 'no '));
  const aggregate = readJson(path.join(dirOf(found), 'aggregate-result.json'));
  const local = path.join(root, 'evals', 'local');
  const suite = readJson(path.join(local, 'real-cases.suite.json')).cases;
  const traces = path.join(results, 'traces', found, stamp);
  const archived = archive ?? archiveOf(traces, process.env, root);
  const neutral = mkdtempSync(path.join(tmp, 'ji-'));
  const rows = [];
  for (const one of aggregate.cases) {
    const real = suite.find((c) => c.name === baseName(one.name));
    // A chain case's plugin dir may hold only its `-plan` stage (the plugin chain case is launched from it); both arms share the base.
    const scaffold = [one.dir, `${one.dir}-plan`, one.dir.replace('/cases/', '/bare/')].map((d) => path.join(root, d, 'scaffold.sh')).find(existsSync);
    const sha = scaffold ? /git -C '([^']+)' archive --format=tar ([0-9a-f]{40})/.exec(readFileSync(scaffold, 'utf8')) : null;
    for (const [i, run] of Object.values(one.arms).flat().entries()) {
      const diff = path.join(traces, `${one.name}-${i + 1}.diff`);
      const judgeDiff = path.join(neutral, `r${rows.length + 1}.diff`);
      const hasDiff = existsSync(diff);
      if (hasDiff) copyFileSync(diff, judgeDiff);
      rows.push({
        arm: found, stamp, case: one.name, run: i + 1, stage: one.name.endsWith('-plan') ? 'plan' : 'code',
        ticket: real ? path.join(local, real.promptFile) : null,
        diff, judgeDiff: hasDiff ? judgeDiff : null,
        base: sha?.[2] ?? real?.parent ?? null, baseFallback: !sha && Boolean(real?.parent), checkout: sha?.[1] ?? null,
        policies: real ? path.join(local, 'suite-real-material', real.name, '.ambicode', 'policies') : null,
        plan: found === 'plugin' && one.name.endsWith('-chain') ? planOf(path.join(archived, `${one.name}-${i + 1}.ambicode`)) : null,
        costUsd: run.costUsd, durationSeconds: run.durationSeconds,
      });
    }
  }
  return rows;
}

const flag = (p) => (p === null ? 'MISSING' : `${p}${existsSync(p) ? '' : '  MISSING'}`);

/** The lines to paste into the judge brief: no arm, stamp, case name, cost or original diff path. */
export function formatJudge(r) {
  return [
    `  ticket:   ${flag(r.ticket)}`, `  diff:     ${flag(r.judgeDiff)}`,
    `  base:     ${r.base ?? 'MISSING'}${r.baseFallback ? ' (fallback: suite parent, verify)' : ''}  (git -C ${r.checkout ?? '?'} show <base>:<path>)`,
    `  policies: ${flag(r.policies)}`,
  ].join('\n');
}

/** What only the master sees: identity of the run, original diff, cost, duration and, for a chain code stage, the incoming plan. */
export function formatMaster(r) {
  return [
    `  master-only: ${r.case} run ${r.run}, stamp ${r.stamp}, arm ${r.arm}, stage ${r.stage}`,
    `  master-only: original diff ${r.diff}`,
    `  master-only: cost $${r.costUsd}, duration ${r.durationSeconds}s`,
    ...(r.plan === null ? [] : [`  master-only: plan: ${r.plan}`]),
  ].join('\n');
}

export const formatRun = (r) => `${formatMaster(r)}\n${formatJudge(r)}`;

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const arm = args.includes('--arm') ? args[args.indexOf('--arm') + 1] : undefined;
  const stamps = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--arm');
  if (stamps.length === 0) { console.error('usage: judge-inputs.mjs <stamp>... [--arm plugin|bare]'); process.exit(2); }
  try {
    for (const stamp of stamps) console.log(judgeInputs({ stamp, arm }).map(formatRun).join('\n'));
  } catch (error) {
    console.error(`judge-inputs: ${error.message}\nusage: judge-inputs.mjs <stamp>... [--arm plugin|bare]`);
    process.exit(2);
  }
}
