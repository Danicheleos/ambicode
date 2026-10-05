// `run`'s arguments, parsed once into one validated spec; the harness argv is built from that spec alone, so what
// was checked is what is forwarded.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { BENCH_EVAL_DIR, BENCHMARKS, CASES_DIRECTORY, CURATED_EVAL_DIR, OUTPUTS, ROOT } from '../shared/bench-paths.mjs';

export const FORCED_REMOVED = '--forced was removed: forced review twins are gone, the plugin arm types its command from prompt.with.md (`run --prompt with`); run `select` without it';

// Values are singletons: a repeat is refused, not resolved by position. This order is the forwarded order.
export const RUN_VALUES = ['--set', '--plugin', '--prompt', '--model', '--max-cost-usd', '--runs', '--ablation', '--case', '--json', '--report', '--output-dir', '--concurrency', '--judge-model', '--mocks', '--threshold'];
export const RUN_FLAGS = ['--walk', '--dry-run', '--trust-plugin', '--allow-real-servers', '--keep-temp', '--verbose'];
const WRAPPER_OPTIONS = new Set(['--set', '--plugin', '--prompt', '--walk', '--dry-run']);
export const PATH_OPTIONS = new Set(['--json', '--report', '--output-dir']);
const RUN_ALIASES = { '-j': '--concurrency' };
const RUN_FIXED = {
  '--forced': FORCED_REMOVED,
  '--publish-report': '--publish-report is refused: the benchmark set is under NDA',
  '--eval-dir': '--eval-dir is fixed by --set',
  '--scaffold': '--scaffold is always passed',
  '--no-scaffold': '--no-scaffold is refused: every case needs its scaffold',
  '--no-publish': '--no-publish is always passed',
  '--allow-tools': '--allow-tools is fixed to Bash',
};
const REQUIRED = {
  // Four 2026-09-29 runs differed only by model (Opus, then Sonnet) and read as plugin changes.
  '--model': '--model is required: a run with an unpinned model cannot be compared with another',
  // Campaign R1 (2026-09-29) ran uncapped sweeps for 13.5 h, about $221, and used up a weekly plan limit.
  '--max-cost-usd': '--max-cost-usd is required: an uncapped sweep can spend a week of plan usage in a day',
};
const MULTI_TAG = (tags) =>
  `--tag values ${tags.join(', ')}: claude plugin eval runs a case carrying ANY of these tags, not all of them; pass one tag (walk and localize together: \`select --review 0\`, then \`--tag walk\`)`;

/** `run`'s arguments as `{values, flags, tags}`. `--x=v` is read as `--x v`; `--tag` is variadic (`--tag a b`) as in the harness. */
export function parseRunOptions(rest) {
  const values = {};
  const flags = new Set();
  const tags = [];
  for (let i = 0; i < rest.length; i++) {
    let name = rest[i];
    let inline;
    const eq = name.startsWith('--') ? name.indexOf('=') : -1;
    if (eq > 0) [name, inline] = [name.slice(0, eq), name.slice(eq + 1)];
    name = RUN_ALIASES[name] ?? name;
    if (name in RUN_FIXED) throw new Error(RUN_FIXED[name]);
    if (RUN_FLAGS.includes(name)) {
      if (inline !== undefined) throw new Error(`${name} takes no value`);
      if (flags.has(name)) throw new Error(`${name} given twice`);
      flags.add(name);
    } else if (name === '--tag') {
      const got = inline !== undefined ? [inline] : [];
      if (inline === undefined) while (i + 1 < rest.length && !rest[i + 1].startsWith('-')) got.push(rest[++i]);
      if (!got.length || got.some((t) => !t)) throw new Error('--tag needs a value');
      tags.push(...got);
    } else if (RUN_VALUES.includes(name)) {
      const value = inline ?? rest[++i];
      if (value === undefined || value === '' || value.startsWith('-'))
        throw new Error(`${name} needs a ${PATH_OPTIONS.has(name) ? 'path under the gitignored results directories' : 'value'}${name in REQUIRED ? `; ${REQUIRED[name]}` : ''}`);
      if (name in values) throw new Error(`${name} given twice (${name === '--case' ? 'two selectors' : `${values[name]} and ${value}`}): pass it once`);
      values[name] = value;
    } else throw new Error(name.startsWith('-') ? `unknown option ${name}: run takes ${[...RUN_VALUES, ...RUN_FLAGS, '--tag'].join(', ')}` : `unexpected argument ${name}: the plugin is chosen with --plugin`);
  }
  if (tags.length > 1) throw new Error(MULTI_TAG(tags));
  return { values, flags, tags };
}

const casesDirOf = (set, plugin, benchmarks) => (set === 'full' ? path.join(benchmarks, CASES_DIRECTORY) : path.join(plugin, CURATED_EVAL_DIR, CASES_DIRECTORY));

/**
 * The one validated run. `harness` holds the forwarded options as `[name, ...values]` in `RUN_VALUES` order,
 * `--json` always among them (the default result path when none was given). `set`/`plugin` in the second
 * argument are defaults for arguments that name none.
 */
export function runSpec(options, { now = new Date(), benchmarks = BENCHMARKS, set: defaultSet = 'curated', plugin: defaultPlugin = ROOT } = {}) {
  const { values, flags, tags } = Array.isArray(options) ? parseRunOptions(options) : options;
  const set = values['--set'] ?? defaultSet;
  if (!['curated', 'full'].includes(set)) throw new Error(`--set takes curated or full, not ${set}`);
  for (const name of Object.keys(REQUIRED)) if (!(name in values)) throw new Error(REQUIRED[name]);
  const prompt = values['--prompt'] ?? 'naked';
  if (!['naked', 'with'].includes(prompt)) throw new Error(`--prompt takes naked or with, not ${prompt}`);
  const plugin = values['--plugin'] === undefined ? defaultPlugin : path.resolve(values['--plugin']);
  if (!existsSync(path.join(plugin, '.claude-plugin', 'plugin.json'))) throw new Error(`${plugin} is not a plugin: no .claude-plugin/plugin.json`);
  const excluded = [benchmarks, path.join(OUTPUTS, 'core')];
  for (const name of PATH_OPTIONS)
    if (name in values && excluded.every((dir) => path.relative(dir, path.resolve(values[name])).startsWith('..')))
      throw new Error(`${name} must stay under ${excluded.join(' or ')}: the result holds the benchmark's prompts and answers`);
  const resultsDir = set === 'full' ? path.join(benchmarks, 'results') : path.join(OUTPUTS, 'core');
  const json = values['--json'] === undefined ? path.join(resultsDir, `eval-${now.toISOString().replace(/[:.]/g, '-')}.json`) : path.resolve(values['--json']);
  const harness = [];
  for (const name of RUN_VALUES) {
    if (WRAPPER_OPTIONS.has(name)) continue;
    if (name === '--json') harness.push([name, json]);
    else if (name in values) harness.push([name, values[name]]);
  }
  for (const name of RUN_FLAGS) if (!WRAPPER_OPTIONS.has(name) && flags.has(name)) harness.push([name]);
  if (tags.length) harness.push(['--tag', ...tags]);
  return {
    set,
    plugin,
    prompt,
    casesDir: casesDirOf(set, plugin, benchmarks),
    model: values['--model'],
    maxCostUsd: Number(values['--max-cost-usd']),
    runs: values['--runs'] ?? null,
    ablation: values['--ablation'] ?? null,
    caseGlob: values['--case'] ?? null,
    tags,
    walk: flags.has('--walk'),
    dryRun: flags.has('--dry-run'),
    trustPlugin: flags.has('--trust-plugin'),
    json,
    jsonGiven: '--json' in values,
    tracesDir: path.join(path.dirname(json), 'traces'),
    harness,
  };
}

/** The `claude` argv of a spec; `json` replaces the result path (a run writes to its private one). */
export function harnessArgv(spec, { json = spec.json } = {}) {
  const options = spec.harness.flatMap(([name, ...rest]) => (name === '--json' ? [name, json] : [name, ...rest]));
  return ['plugin', 'eval', spec.plugin, '--eval-dir', spec.set === 'full' ? BENCH_EVAL_DIR : CURATED_EVAL_DIR, '--scaffold', '--allow-tools', 'Bash', '--no-publish', '--keep-temp', ...options];
}

/** Compatibility adapter: the argv of raw `run` arguments, validated as `run` validates them. */
export const runArgs = (extra = [], context = {}) => harnessArgv(runSpec(parseRunOptions(extra), context));
