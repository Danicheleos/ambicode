// Runs the suite through `claude plugin eval` and leaves the result in evals/cases/results.
// Usage: run.mjs [--bare] [--case <glob>] [--tag <tag>] [--runs <n>] [--model <m>] [--effort <level>]
//                [--max-cost-usd <usd>] [--series <case1,case2,...>] [--dry-run]
// --series names every case of a series of one-case commands; each command updates results/running.json (see progressOf).
// --bare runs evals/bare/ against an empty plugin: the same requests with nothing of AMBICODE loaded.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { archiveOf, deliveryLine, harvest, reviewRunsOf } from './context.mjs';
import { CASES, caseOf } from './cases.mjs';
import { isRealCase, loadRealCases, realTruth } from './real-cases.mjs';
import { metricsOf, scoreFiles } from './metrics.mjs';
import { applyDiffGraders, isSkipped } from './diff-graders.mjs';
import { downstreamMetrics, downstreamTruth, isDownstreamCase } from './downstream-cases.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const DEFAULTS = { model: 'claude-sonnet-5-5', effort: 'low', runs: '1', maxCostUsd: '15', concurrency: '4' };
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RESULTS = path.join(REPO, 'evals', 'cases', 'results');
// Outside the plugin, because the harness walks the whole target directory; .tmp/ is gitignored.
export const NAKED = path.join(REPO, '.tmp', 'naked');

// A subagent once ran `find /` per case to locate the bench repositories: the 120 s Bash timeout backgrounded it and kept the agent alive ~30 min.
// The runner prints the facts instead; the limit stops a results folder that grew unbounded from slowing every harness walk.
export const ENTRY_LIMIT = 20000;
const EVALS = path.join(REPO, 'evals');

/** Entries under `dir` (files and folders, recursive); counting stops once it passes `limit`. */
export function countEntries(dir, limit = Infinity) {
  let count = 0;
  const pending = [dir];
  while (pending.length > 0 && count <= limit) {
    for (const entry of readdirSync(pending.pop(), { withFileTypes: true })) {
      count += 1;
      if (entry.isDirectory()) pending.push(path.join(entry.parentPath, entry.name));
    }
  }
  return count;
}

/** One line per bench repository named by the local real-cases file or by NAV_BENCH, K12_BENCH, INIT_BENCH: env var, absolute path, sha256 of its context index. */
export function benchLines(env = process.env, real = loadRealCases()) {
  const names = new Set(['NAV_BENCH', 'K12_BENCH', 'INIT_BENCH', ...Object.values(real.repos).map((repo) => repo.bench).filter(Boolean)]);
  return [...names].filter((name) => env[name]).map((name) => {
    const bench = path.resolve(env[name]);
    const index = path.join(bench, '.ambicode', 'context', 'index.md');
    return `${name} ${bench} ${existsSync(index) ? `index.md sha256 ${createHash('sha256').update(readFileSync(index)).digest('hex')}` : 'no .ambicode/context/index.md'}`;
  });
}

/** What is printed before a case runs; `error` is set when evals/ holds `limit` entries or more. */
export function preflight({ evals = EVALS, env = process.env, limit = ENTRY_LIMIT, real } = {}) {
  const entries = countEntries(evals, limit);
  if (entries >= limit) return { error: `preflight: evals/ has ${entries} entries (limit ${limit}); clear evals/cases/results before running`, lines: [] };
  return { line: `preflight: evals/ ${entries} entries`, lines: benchLines(env, real) };
}

const VALUE_FLAGS = ['--case', '--tag', '--runs', '--model', '--effort', '--max-cost-usd', '--series'];
const SWITCHES = ['--bare', '--dry-run'];
export const USAGE = `Usage: run.mjs [--bare] [--case <glob>] [--tag <tag>] [--runs <n>] [--model <m>] [--effort <level>] [--max-cost-usd <usd>] [--series <a,b,...>] [--dry-run] [--help]`;

/** Before anything runs: `--help` prints the usage; an unknown flag, stray word or value flag without a value is an error. An unknown flag once fell through to a full paid run (`--help`, 52 runs, $6.85, 2026-10-23). */
export function checkArgs(argv) {
  if (argv.includes('--help') || argv.includes('-h')) return { action: 'help', usage: USAGE };
  for (let at = 0; at < argv.length; at += 1) {
    const arg = argv[at];
    if (SWITCHES.includes(arg)) continue;
    if (VALUE_FLAGS.includes(arg) && at + 1 < argv.length) { at += 1; continue; }
    return { action: 'error', message: `${VALUE_FLAGS.includes(arg) ? `${arg} needs a value` : `unknown argument ${arg}`}\n${USAGE}` };
  }
  return { action: 'run' };
}

function option(argv, name) {
  const at = argv.indexOf(name);
  return at >= 0 ? (argv[at + 1] ?? null) : null;
}

/** The harness argv and environment of one run; everything is fixed here so the run can be reproduced. */
export function plan(argv, defaults = DEFAULTS, results = RESULTS) {
  const arm = argv.includes('--bare') ? 'bare' : 'plugin';
  const model = option(argv, '--model') ?? defaults.model;
  const effort = option(argv, '--effort') ?? defaults.effort;
  const result = path.join(results, `${arm}.json`);
  const out = [
    'plugin', 'eval', arm === 'bare' ? NAKED : REPO,
    '--eval-dir', arm === 'bare' ? 'evals/bare' : 'evals/cases',
    '--scaffold', '--trust-plugin', '--no-publish',
    // Kept so the context size can be read from each trace; harvest() deletes every sandbox afterwards.
    '--keep-temp',
    // One arm per run: a plugin case's prompt types /ambicode:<skill>, which means nothing with no plugin loaded.
    '--ablation', 'none',
    '--allow-tools', 'Bash', 'Edit', 'Write',
    '--model', model,
    '--runs', option(argv, '--runs') ?? defaults.runs,
    '-j', defaults.concurrency,
    '--max-cost-usd', option(argv, '--max-cost-usd') ?? defaults.maxCostUsd,
    '--json', result,
  ];
  for (const name of ['--case', '--tag']) {
    const value = option(argv, name);
    if (value !== null) out.push(name, value);
  }
  // The harness has no exclude option: an unfiltered run lists every case tag.
  if (option(argv, '--case') === null && option(argv, '--tag') === null) {
    for (const tag of new Set(CASES.flatMap((one) => one.tags))) out.push('--tag', tag);
  }
  // The harness has no effort flag; the variable reaches the run's claude child (probed 2026-10-12: `env=[low]`).
  const env = { CLAUDE_CODE_EFFORT_LEVEL: effort };
  return { arm, argv: out, env, result };
}

/** An empty plugin holding a copy of evals/bare, with each scaffold pointed back at this repository's fixtures. */
export function buildNaked(repo = REPO, naked = NAKED) {
  rmSync(naked, { recursive: true, force: true });
  mkdirSync(path.join(naked, '.claude-plugin'), { recursive: true });
  writeFileSync(path.join(naked, '.claude-plugin', 'plugin.json'), `${JSON.stringify({ name: 'naked', version: '0.0.0', description: 'No components: the bare arm.' })}\n`);
  const target = path.join(naked, 'evals', 'bare');
  cpSync(path.join(repo, 'evals', 'bare'), target, { recursive: true });
  for (const entry of readdirSync(target, { recursive: true })) {
    if (path.basename(entry) !== 'scaffold.sh') continue;
    const file = path.join(target, entry);
    writeFileSync(file, readFileSync(file, 'utf8').replaceAll('$(cd "$(dirname "$0")/../../../.." && pwd)', repo), { mode: 0o755 });
  }
}

// Either variable overrides every subagent's model, so an inherited one hides the agent's own `model:` (seen 2026-10-20: a haiku agent ran on sonnet).
export function childEnv(base, env) {
  const out = { ...base, ...env };
  delete out.CLAUDE_CODE_SUBAGENT_MODEL;
  delete out.CLAUDE_CODE_SUBAGENT_MODEL_FORCE;
  return out;
}

const REAL = {
  spawn: (cmd, args, env) => spawnSync(cmd, args, { stdio: 'inherit', env: childEnv(process.env, env) }).status,
  harvest,
  truthOf: (name) => (isDownstreamCase(name) ? downstreamTruth(name) : null),
  tracesRoot: path.join(RESULTS, 'traces'),
};

/**
 * Graders the harness skipped for the cost ceiling count as neither passed nor failed: the run's score is recomputed without them, the
 * run is marked `partialGrading` with their names, and a run with nothing left to score has no score (absent, not 0).
 */
function markPartialGrading(evalCase, log) {
  const runs = Object.values(evalCase.arms ?? {}).flatMap((list) => list ?? []);
  let changed = false;
  runs.forEach((one, index) => {
    const skipped = (one.graders ?? []).filter(isSkipped);
    if (skipped.length === 0) return;
    changed = true;
    const scored = one.graders.filter((grader) => grader.scored !== false && !isSkipped(grader));
    const total = scored.reduce((sum, grader) => sum + grader.weight, 0);
    one.score = total === 0 ? null : scored.filter((grader) => grader.passed).reduce((sum, grader) => sum + grader.weight, 0) / total;
    one.passed = total === 0 ? null : scored.every((grader) => grader.passed);
    one.partialGrading = true;
    one.skippedGraders = skipped.map((grader) => grader.name);
    log(`warning: ${evalCase.name}-${index + 1}: partial grading, not scored: ${one.skippedGraders.join(', ')} (cost ceiling)`);
  });
  if (!changed) return;
  const graded = runs.filter((one) => typeof one.score === 'number');
  evalCase.aggregates = { ...evalCase.aggregates, score: graded.length === 0 ? null : graded.reduce((sum, one) => sum + one.score, 0) / graded.length, passRate: graded.length === 0 ? null : graded.filter((one) => one.passed).length / graded.length };
}

/** One `claude plugin eval` call: harvest, metrics; leaves run.result holding this call's result. */
export function runCase(run, deps = REAL) {
  const status = deps.spawn('claude', run.argv, run.env);
  // Exit 1 is a case below the harness threshold (1.0) and 2 a partial result (cost ceiling): both are results
  // (`partial` is the harness's own flag in the JSON). Anything else is a harness failure with no result.
  if (![0, 1, 2].includes(status)) return { status: status ?? 1, result: null };
  const result = JSON.parse(readFileSync(run.result, 'utf8'));
  // A filter matching nothing used to be written as a finished result (cases [], cost 0, partial false; 2026-10-29).
  if ((result.cases ?? []).length === 0) {
    (deps.log ?? console.log)(`--case/--tag matched no case: ${option(run.argv, '--case') ?? option(run.argv, '--tag')}`);
    return { status: 1, result };
  }
  const stamp = String(result.startedAt ?? Date.now()).replace(/[:.]/g, '-');
  // Per suite run: clearing one shared folder lost the traces of every earlier run (2026-10-12).
  const tracesDir = path.join(deps.tracesRoot, run.arm, stamp);
  deps.harvest(result, tracesDir, { archiveDir: archiveOf(tracesDir), reviewRunsDir: reviewRunsOf(run.arm, stamp) });
  for (const evalCase of result.cases ?? []) {
    Object.values(evalCase.arms ?? {}).forEach((runs) => (runs ?? []).forEach((one, index) => {
      if (one.delivery) (deps.log ?? console.log)(`${evalCase.name}-${index + 1}: ${deliveryLine(one.delivery)}`);
    }));
    const downstream = isDownstreamCase(evalCase.name);
    const spec = downstream ? undefined : (caseOf(evalCase.name)?.metrics ?? (isRealCase(evalCase.name) ? (deps.realTruthOf ?? realTruth)(evalCase.name) ?? undefined : undefined));
    if (!downstream && spec === undefined) continue;
    for (const runs of Object.values(evalCase.arms ?? {})) for (const one of runs ?? []) {
      if (downstream) one.metrics = downstreamMetrics(deps.truthOf?.(evalCase.name) ?? null, one.trace ? readFileSync(one.trace, 'utf8') : undefined);
      else if (spec.source === 'changed') one.metrics = scoreFiles(spec, one.changed ?? null);
      else if (one.trace) one.metrics = metricsOf(spec, readFileSync(one.trace, 'utf8'));
      if (!downstream && spec?.diffGraders?.length) applyDiffGraders(one, spec.diffGraders, one.diff ? readFileSync(one.diff, 'utf8') : null);
    }
    if (!downstream && spec?.diffGraders?.length) {
      // The harness's per-case aggregates were taken before the diff graders existed.
      const all = Object.values(evalCase.arms ?? {}).flatMap((runs) => runs ?? []);
      evalCase.aggregates = { ...evalCase.aggregates, score: all.reduce((sum, one) => sum + one.score, 0) / all.length, passRate: all.filter((one) => one.passed).length / all.length };
    }
  }
  for (const evalCase of result.cases) markPartialGrading(evalCase, deps.log ?? console.log);
  writeFileSync(run.result, `${JSON.stringify(result, null, 2)}\n`);
  // The viewer reads one copy per run (<results>/<stamp>/); the harness's own copy there lacks our fields, so the viewer
  // computed its own metrics (2026-10-19: graders 0.244, viewer recall 0.111). The bare arm's harness copy lands in the
  // naked plugin, which buildNaked wipes, so that arm gets its copy under <results>/bare/.
  const own = path.join(path.dirname(run.result), ...(run.arm === 'bare' ? ['bare'] : []), stamp, 'aggregate-result.json');
  mkdirSync(path.dirname(own), { recursive: true });
  writeFileSync(own, `${JSON.stringify(result, null, 2)}\n`);
  return { status, result };
}

/**
 * The progress file of a series of commands, read by plugin-master's Evals view: <results>/running.json, no schemaVersion key
 * (the view lists every results/*.json that has one as a finished run). A command with no --series is a one-case series.
 */
export const seriesOf = (argv) => {
  const list = (option(argv, '--series') ?? option(argv, '--case') ?? '').split(',').map((name) => name.trim()).filter(Boolean);
  return list.length === 0 ? null : list;
};

const score = (runs) => {
  const scores = runs.map((one) => one.score).filter((value) => typeof value === 'number');
  return scores.length === 0 ? null : Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(3));
};
const cost = (runs) => Number(runs.reduce((sum, one) => sum + (one.costUsd ?? 0) + (one.judgeCostUsd ?? 0), 0).toFixed(4));

/** Runs of the case named `name` in a harness result (every run when the name is a glob matching none exactly). */
const runsOfCase = (result, name) => {
  const all = result.cases ?? [];
  const own = all.filter((one) => one.name === name);
  return (own.length > 0 ? own : all).flatMap((one) => Object.values(one.arms ?? {}).flat());
};

/** Folds the earlier cases of a series into this command's result, keeping their order; the same case rerun replaces its entry. Totals are recomputed from the merged cases. */
export function mergeSeries(previous, result) {
  const fresh = new Set((result.cases ?? []).map((one) => one.name));
  const cases = [...(previous.cases ?? []).filter((one) => !fresh.has(one.name)), ...(result.cases ?? [])];
  // A case with a null score was not graded (every grader skipped): averaging it as 0 reported an absent score as a fail.
  const graded = cases.filter((one) => typeof one.aggregates?.score === 'number');
  const mean = (key) => (graded.length === 0 ? 0 : Number((graded.reduce((sum, one) => sum + (one.aggregates?.[key] ?? 0), 0) / graded.length).toFixed(3)));
  return {
    ...result,
    startedAt: previous.startedAt ?? result.startedAt,
    durationSeconds: (previous.durationSeconds ?? 0) + (result.durationSeconds ?? 0),
    costUsd: Number(((previous.costUsd ?? 0) + (result.costUsd ?? 0)).toFixed(6)),
    partial: Boolean(previous.partial || result.partial),
    cases,
    aggregates: { ...result.aggregates, casesTotal: cases.length, casesScored: graded.length, notScored: cases.filter((one) => !graded.includes(one)).map((one) => one.name), casesPassed: cases.filter((one) => one.aggregates?.passRate === 1).length, overallScore: mean('score'), overallPassRate: mean('passRate') },
  };
}

/** Runs `exec` (one command's harness call) around updates of the progress file; a failure to write it only warns, once. */
export function withProgress(run, argv, exec, { file = path.join(path.dirname(run.result), 'running.json'), now = () => new Date() } = {}) {
  const list = seriesOf(argv);
  const name = option(argv, '--case');
  let warned = false;
  const guard = (step) => {
    try {
      return step();
    } catch (error) {
      if (!warned) console.warn(`progress file not written: ${error.message}`);
      warned = true;
      return undefined;
    }
  };
  const id = list === null ? null : createHash('sha1').update(`${run.arm}\n${list.join(',')}`).digest('hex').slice(0, 8);
  const load = () => {
    let state = null;
    try {
      state = JSON.parse(readFileSync(file, 'utf8'));
    } catch {}
    if (state?.series === id && state.finishedAt === null) return state;
    const stamp = now().toISOString();
    return { kind: 'eval-series', series: id, arm: run.arm, startedAt: stamp, updatedAt: stamp, finishedAt: null, runsPerCase: Number(option(argv, '--runs') ?? DEFAULTS.runs), total: 0, done: 0, current: null, costUsd: 0, cases: list.map((one) => ({ name: one, state: 'queued', score: null, costUsd: null })) };
  };
  const save = (state) => {
    state.total = state.cases.length;
    state.done = state.cases.filter((one) => one.state === 'done' || one.state === 'failed').length;
    state.costUsd = Number(state.cases.reduce((sum, one) => sum + (one.costUsd ?? 0), 0).toFixed(4));
    state.updatedAt = now().toISOString();
    state.finishedAt = state.done === state.total ? state.updatedAt : null;
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(state, null, 2)}\n`);
    renameSync(tmp, file);
  };
  const entry = (state) => {
    let found = state.cases.find((one) => one.name === name);
    if (found === undefined) state.cases.push((found = { name, state: 'queued', score: null, costUsd: null }));
    return found;
  };
  // The harness overwrites run.result on every command, so the series so far is read before it runs.
  const earlier = list === null ? null : guard(() => {
    try {
      const state = JSON.parse(readFileSync(file, 'utf8'));
      if (state.series !== id || state.finishedAt !== null) return null;
      return JSON.parse(readFileSync(run.result, 'utf8'));
    } catch (error) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }) ?? null;
  if (list !== null && name !== null) guard(() => {
    const state = load();
    entry(state).state = 'running';
    state.current = name;
    save(state);
  });
  let outcome;
  try {
    outcome = exec();
  } catch (error) {
    outcome = { status: 1, result: null, error };
  }
  if (list !== null && name !== null) guard(() => {
    const state = load();
    const one = entry(state);
    const runs = outcome.result === null ? [] : runsOfCase(outcome.result, name);
    one.state = (outcome.result?.cases ?? []).length === 0 ? 'failed' : 'done';
    one.score = score(runs);
    one.costUsd = outcome.result === null ? null : cost(runs);
    state.current = null;
    save(state);
  });
  if (earlier !== null && outcome.result !== null) guard(() => {
    outcome.result = mergeSeries(earlier, outcome.result);
    writeFileSync(run.result, `${JSON.stringify(outcome.result, null, 2)}\n`);
  });
  if (outcome.error) throw outcome.error;
  return outcome;
}

function main(argv) {
  const checked = checkArgs(argv);
  if (checked.action === 'help') { console.log(checked.usage); return 0; }
  if (checked.action === 'error') { console.error(checked.message); return 2; }
  const run = plan(argv);
  if (argv.includes('--dry-run')) {
    console.log(`${Object.entries(run.env).map(([k, v]) => `${k}=${v}`).join(' ')} claude ${run.argv.join(' ')}`);
    return 0;
  }
  const checkedEvals = preflight();
  if (checkedEvals.error) { console.error(checkedEvals.error); return 2; }
  console.log([checkedEvals.line, ...checkedEvals.lines].join('\n'));
  mkdirSync(RESULTS, { recursive: true });
  if (run.arm === 'bare') buildNaked();
  return withProgress(run, argv, () => runCase(run)).status;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
