// $0 offline bench of the policy stages, on the real code: `policyStage` on a scratch repository holding the bench repo's config and packs.
// Nothing is written into the bench repository; no model is called.
//   node evals/scripts/policy-bench.mjs --plan     the plan route's delivery before the draft on real plans (policy-plan-bench.mjs, bench/policy-plan/)
//   node evals/scripts/policy-bench.mjs --stages   rules and bytes each activity delivers for the change sets of evals/local/bench/policy/changesets.json
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
/** The checkout the bench replays; no default, so the script never reads a developer's path. */
export function benchRepo(env = process.env) {
  if (!env.NAV_BENCH) throw new Error('NAV_BENCH is required: the path of the repository the bench replays');
  return env.NAV_BENCH;
}
export const ACTIVITIES = ['review', 'task', 'plan'];

/**
 * Copies a project's .ambicode config and policies into `scratch`, dropping the rule `kinds` lines and the config `kinds` map that a
 * checkout initialised before kinds were removed still carries (both are schema errors now). The source stays untouched.
 */
export function copyProject(source, scratch) {
  mkdirSync(path.join(scratch, '.ambicode'), { recursive: true });
  cpSync(path.join(source, '.ambicode', 'policies'), path.join(scratch, '.ambicode', 'policies'), { recursive: true });
  const walk = (dir) => readdirSync(dir).forEach((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return walk(file);
    if (name.endsWith('.yaml')) writeFileSync(file, readFileSync(file, 'utf8').split('\n').filter((line) => !/^\s+kinds: \[.*\]$/.test(line)).join('\n'));
  });
  walk(path.join(scratch, '.ambicode', 'policies'));
  const config = parseYaml(readFileSync(path.join(source, '.ambicode', 'config.yaml'), 'utf8'));
  for (const project of config.projects) delete project.kinds;
  writeFileSync(path.join(scratch, '.ambicode', 'config.yaml'), stringifyYaml(config));
}

const mean = (values) => values.reduce((total, value) => total + value, 0) / values.length;

/** One row per activity: mean and max of rules and bytes over the sets. */
export function summarize(rows) {
  return ACTIVITIES.map((activity) => {
    const own = rows.filter((row) => row.activity === activity);
    return { activity, sets: own.length, rules: mean(own.map((row) => row.rules)), rulesMax: Math.max(...own.map((row) => row.rules)), bytes: mean(own.map((row) => row.bytes)), bytesMax: Math.max(...own.map((row) => row.bytes)) };
  });
}

async function stages() {
  const file = path.join(REPO, 'evals', 'local', 'bench', 'policy', 'changesets.json');
  if (!existsSync(file)) {
    process.stdout.write(`skipped: no ${file} (change sets of a real repository, kept out of git)\n`);
    return;
  }
  const source = benchRepo();
  const sets = JSON.parse(readFileSync(file, 'utf8')).filter((set) => set.repo === path.basename(source));
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'policy-bench-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: scratch });
    copyProject(source, scratch);
    const { createRuntime } = await import('../../src/composition/root.ts');
    const { openWorkspace } = await import('../../src/modules/config/workspace.ts');
    const { policyStage } = await import('../../src/modules/policy/stage.ts');
    const runtime = await createRuntime({ cwd: scratch });
    const project = (await openWorkspace(runtime)).config.projects[0];
    const rows = [];
    for (const set of sets) for (const activity of ACTIVITIES) {
      const stage = await policyStage({ runtime, project, activity, paths: set.paths, stage: 'before-work' });
      rows.push({ set: set.id, activity, rules: stage.entry.ids.length, bytes: stage.bytes });
    }
    const out = ['| activity | sets | rules mean / max | bytes mean / max |', '|---|---|---|---|', ...summarize(rows).map((row) => `| ${row.activity} | ${row.sets} | ${row.rules.toFixed(1)} / ${row.rulesMax} | ${Math.round(row.bytes)} / ${row.bytesMax} |`)];
    process.stdout.write(`${out.join('\n')}\n`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function main(argv) {
  if (argv.includes('--plan')) return (await import('./policy-plan-bench.mjs')).main(argv);
  if (argv.includes('--stages')) return stages();
  throw new Error('policy-bench.mjs takes --plan or --stages');
}

if (process.argv[1] !== undefined && process.argv[1].endsWith('policy-bench.mjs')) await main(process.argv.slice(2));
