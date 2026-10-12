// Runs the suite through `claude plugin eval` and records the result in the history.
// Usage: run.mjs [--bare] [--case <glob>] [--tag <tag>] [--runs <n>] [--model <m>] [--effort <level>]
//                [--max-cost-usd <usd>] [--dry-run]
// --bare runs evals/bare/ against an empty plugin: the same requests with nothing of AMBICODE loaded.
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { harvest } from './context.mjs';
import { longestReport } from './chain.mjs';
import { caseOf } from './cases.mjs';
import { metricsOf } from './metrics.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const DEFAULTS = { model: 'claude-sonnet-5-5', effort: 'low', runs: '1', maxCostUsd: '15', concurrency: '4' };
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
export const RESULTS = path.join(REPO, 'evals', 'cases', 'results');
// Outside the plugin, because the harness walks the whole target directory; .tmp/ is gitignored.
export const NAKED = path.join(REPO, '.tmp', 'naked');
// In git beside history.md, which links them: the results folder is gitignored and hidden in most views.
export const CHAINS = path.join(REPO, 'evals', 'chains');

function option(argv, name) {
  const at = argv.indexOf(name);
  return at >= 0 ? (argv[at + 1] ?? null) : null;
}

/** The harness argv and environment of one run; everything is fixed here so a history row says how to reproduce it. */
export function plan(argv, defaults = DEFAULTS) {
  const arm = argv.includes('--bare') ? 'bare' : 'plugin';
  const model = option(argv, '--model') ?? defaults.model;
  const effort = option(argv, '--effort') ?? defaults.effort;
  const result = path.join(RESULTS, `${arm}.json`);
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
  // The harness has no effort flag; the variable reaches the run's claude child (probed 2026-10-12: `env=[low]`).
  const env = { CLAUDE_CODE_EFFORT_LEVEL: effort };
  const track = [path.join(REPO, 'evals', 'scripts', 'track.mjs'), result, '--arm', arm, '--model', model, '--effort', effort];
  return { arm, argv: out, env, track, result };
}

/** An empty plugin holding a copy of evals/bare, with each scaffold pointed back at this repository's fixtures. */
export function buildNaked(repo = REPO, naked = NAKED) {
  rmSync(naked, { recursive: true, force: true });
  mkdirSync(path.join(naked, '.claude-plugin'), { recursive: true });
  writeFileSync(path.join(naked, '.claude-plugin', 'plugin.json'), `${JSON.stringify({ name: 'naked', version: '0.0.0', description: 'No components: the bare arm.' })}\n`);
  const target = path.join(naked, 'evals', 'bare');
  cpSync(path.join(repo, 'evals', 'bare'), target, { recursive: true });
  for (const name of readdirSync(target)) {
    const file = path.join(target, name, 'scaffold.sh');
    try {
      writeFileSync(file, readFileSync(file, 'utf8').replaceAll('$(cd "$(dirname "$0")/../../.." && pwd)', repo), { mode: 0o755 });
    } catch (error) {
      if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error;
    }
  }
}

function main(argv) {
  const run = plan(argv);
  if (argv.includes('--dry-run')) {
    console.log(`${Object.entries(run.env).map(([k, v]) => `${k}=${v}`).join(' ')} claude ${run.argv.join(' ')}\nnode ${run.track.join(' ')}`);
    return 0;
  }
  mkdirSync(RESULTS, { recursive: true });
  if (run.arm === 'bare') buildNaked();
  const status = spawnSync('claude', run.argv, { stdio: 'inherit', env: { ...process.env, ...run.env } }).status;
  // Exit 1 is a case below the harness threshold (1.0) and 2 a partial result (cost ceiling): both are results and are
  // tracked (`partial` is the harness's own flag in the JSON). Anything else is a harness failure with nothing to track.
  if (![0, 1, 2].includes(status)) return status ?? 1;
  const result = JSON.parse(readFileSync(run.result, 'utf8'));
  harvest(result, path.join(RESULTS, 'traces', run.arm));
  for (const evalCase of result.cases ?? []) {
    const spec = caseOf(evalCase.name)?.metrics;
    if (spec === undefined) continue;
    for (const runs of Object.values(evalCase.arms ?? {})) for (const one of runs ?? []) if (one.trace) one.metrics = metricsOf(spec, readFileSync(one.trace, 'utf8'));
  }
  writeFileSync(run.result, `${JSON.stringify(result, null, 2)}\n`);
  const longest = longestReport(result, run.arm);
  if (longest !== null) {
    mkdirSync(CHAINS, { recursive: true });
    const file = path.join(CHAINS, `${run.arm}-longest.md`);
    writeFileSync(file, longest);
    console.log(`${longest.split('\n').slice(0, 3).join('\n')}\nchain: ${path.relative(REPO, file)}`);
  }
  const tracked = spawnSync(process.execPath, run.track, { stdio: 'inherit', cwd: REPO }).status;
  return tracked === 0 ? status : (tracked ?? 1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exitCode = main(process.argv.slice(2));
