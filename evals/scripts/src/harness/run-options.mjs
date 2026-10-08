// `run`'s arguments, parsed once into one validated spec; the harness argv is built from that spec alone, so what
// was checked is what is forwarded.
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { BENCHMARKS, CASES_DIRECTORY, CORE_PRESET, fullEvalDir, CURATED_EVAL_DIR, OUTPUTS, PRESET_NAMES, presetCasesDir, presetEvalDir, ROOT, TASK_EVAL_DIR } from '../shared/bench-paths.mjs';

export { TASK_EVAL_DIR };

export const FORCED_REMOVED = '--forced was removed: forced review twins are gone, the plugin arm types its command from prompt.with.md (`run --prompt with`); run `select` without it';

// Values are singletons: a repeat is refused, not resolved by position. This order is the forwarded order.
export const RUN_VALUES = ['--set', '--project', '--preset', '--plugin', '--prompt', '--model', '--max-cost-usd', '--runs', '--ablation', '--case', '--json', '--report', '--output-dir', '--concurrency', '--judge-model', '--mocks', '--threshold'];
export const RUN_FLAGS = ['--walk', '--dry-run', '--trust-plugin', '--allow-real-servers', '--keep-temp', '--verbose'];
const WRAPPER_OPTIONS = new Set(['--set', '--project', '--preset', '--plugin', '--prompt', '--walk', '--dry-run']);
export const PATH_OPTIONS = new Set(['--json', '--report', '--output-dir']);
const RUN_ALIASES = { '-j': '--concurrency' };
/** The operator grant for gated tools; each case's `allowed_tools` still picks its own. Bash alone withholds Write and Edit from the cases that list them. */
export const GRANTED_TOOLS = Object.freeze(['Bash', 'Write', 'Edit']);
const RUN_FIXED = {
  '--forced': FORCED_REMOVED,
  '--publish-report': '--publish-report is refused: the benchmark set is under NDA',
  '--eval-dir': '--eval-dir is fixed by --set',
  '--scaffold': '--scaffold is always passed',
  '--no-scaffold': '--no-scaffold is refused: every case needs its scaffold',
  '--no-publish': '--no-publish is always passed',
  '--allow-tools': `--allow-tools is fixed to ${GRANTED_TOOLS.join(' ')}`,
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

// The full set is one project's and a preset is one size's: `--eval-dir` is that folder, so discovery never crosses into another.
const evalDirOf = (set, project, preset) => (set === 'full' ? fullEvalDir(project) : set === 'preset' ? presetEvalDir(preset) : set === 'task' ? TASK_EVAL_DIR : CURATED_EVAL_DIR);
const casesDirOf = (set, plugin, project, preset) =>
  set === 'preset' ? presetCasesDir(preset, path.join(plugin, 'evals')) : set === 'full' ? path.join(plugin, evalDirOf(set, project, preset)) : path.join(plugin, evalDirOf(set), CASES_DIRECTORY);
/** The presets `--set preset` runs: the core one runs as the curated set, so its runs share one type and one lock. */
const SET_PRESETS = PRESET_NAMES.filter((name) => name !== CORE_PRESET);
/** The eval type a set's runs are filed under in the assets' `outputs/`. */
export const EVAL_TYPES = Object.freeze({ curated: 'core', full: 'full', task: 'task', preset: 'presets' });

/**
 * A run's own directory, `outputs/<type>/<UTC date>/<NN>_<HHMM>_<label>/`, numbered after the iterations already
 * filed that day. It holds `results/` (the harness result, the plugin-eval output), `traces/` and `reports/`.
 * `type` defaults to the set's; suites run outside the harness (archived, triggers) name their own.
 */
export function iterationDir({ set, type = EVAL_TYPES[set], now, label, outputs = OUTPUTS }) {
  const iso = now.toISOString();
  const day = path.join(outputs, type, iso.slice(0, 10));
  const taken = existsSync(day) ? readdirSync(day, { withFileTypes: true }).filter((e) => e.isDirectory()).length : 0;
  return path.join(day, `${String(taken + 1).padStart(2, '0')}_${iso.slice(11, 13)}${iso.slice(14, 16)}_${label}`);
}

/** Where a result's traces and reports live: in its iteration when it sits in an iteration's `results/`, else beside it. */
export function resultLayout(json, outputs = OUTPUTS) {
  const dir = path.dirname(path.resolve(json));
  if (path.basename(dir) !== 'results' || path.relative(outputs, dir).startsWith('..'))
    return { iteration: null, tracesDir: path.join(dir, 'traces'), reportsDir: dir };
  const iteration = path.dirname(dir);
  return { iteration, tracesDir: path.join(iteration, 'traces'), reportsDir: path.join(iteration, 'reports') };
}

const slug = (text) => String(text).toLowerCase().replace(/^claude-/, '').replace(/[^a-z0-9.+-]+/g, '-').replace(/^-+|-+$/g, '');
const labelOf = ({ tags, set, project, preset, plugin, prompt, model }) =>
  [tags.length ? tags.join('+') : set, project, preset, path.basename(plugin), prompt === 'with' ? 'with-prompt' : null, model].filter(Boolean).map(slug).join('-');

/**
 * The one validated run. `harness` holds the forwarded options as `[name, ...values]` in `RUN_VALUES` order,
 * `--json` always among them (the default result path when none was given). `set`/`plugin` in the second
 * argument are defaults for arguments that name none.
 */
export function runSpec(options, { now = new Date(), benchmarks = BENCHMARKS, outputs = OUTPUTS, set: defaultSet = 'curated', plugin: defaultPlugin = ROOT } = {}) {
  const { values, flags, tags } = Array.isArray(options) ? parseRunOptions(options) : options;
  const set = values['--set'] ?? defaultSet;
  if (!['curated', 'full', 'task', 'preset'].includes(set)) throw new Error(`--set takes curated, full, task or preset, not ${set}`);
  for (const name of Object.keys(REQUIRED)) if (!(name in values)) throw new Error(REQUIRED[name]);
  const project = values['--project'] ?? null;
  if (set === 'full' && project === null) throw new Error('--set full needs --project <benchmark project>: each project keeps its own full set');
  if (set !== 'full' && project !== null) throw new Error(`--project selects a full set; the ${set} set spans every project`);
  const preset = values['--preset'] ?? null;
  if (set === 'preset' && preset === CORE_PRESET) throw new Error(`--preset ${CORE_PRESET} is the core suite: run it as --set curated (the default)`);
  if (set === 'preset' && !SET_PRESETS.includes(preset)) throw new Error(`--set preset needs --preset ${SET_PRESETS.join('|')}${preset === null ? '' : `, not ${preset}`}`);
  if (set !== 'preset' && preset !== null) throw new Error(`--preset selects a preset set, not the ${set} set`);
  const prompt = values['--prompt'] ?? 'naked';
  if (!['naked', 'with'].includes(prompt)) throw new Error(`--prompt takes naked or with, not ${prompt}`);
  const plugin = values['--plugin'] === undefined ? defaultPlugin : path.resolve(values['--plugin']);
  if (!existsSync(path.join(plugin, '.claude-plugin', 'plugin.json'))) throw new Error(`${plugin} is not a plugin: no .claude-plugin/plugin.json`);
  const excluded = [benchmarks, outputs];
  for (const name of PATH_OPTIONS)
    if (name in values && excluded.every((dir) => path.relative(dir, path.resolve(values[name])).startsWith('..')))
      throw new Error(`${name} must stay under ${excluded.join(' or ')}: the result holds the benchmark's prompts and answers`);
  const jsonGiven = '--json' in values;
  const json = jsonGiven
    ? path.resolve(values['--json'])
    : path.join(iterationDir({ set, now, outputs, label: labelOf({ tags, set, project, preset, plugin, prompt, model: values['--model'] }) }), 'results', 'eval.json');
  const { iteration, tracesDir, reportsDir } = resultLayout(json, outputs);
  const harness = [];
  for (const name of RUN_VALUES) {
    if (WRAPPER_OPTIONS.has(name)) continue;
    if (name === '--json') harness.push([name, json]);
    else if (name in values) harness.push([name, values[name]]);
    else if (name === '--output-dir' && iteration) harness.push([name, path.join(iteration, 'results', 'plugin-eval')]);
  }
  for (const name of RUN_FLAGS) if (!WRAPPER_OPTIONS.has(name) && flags.has(name)) harness.push([name]);
  if (tags.length) harness.push(['--tag', ...tags]);
  return {
    set,
    plugin,
    prompt,
    project,
    preset,
    casesDir: casesDirOf(set, plugin, project, preset),
    evalDir: evalDirOf(set, project, preset),
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
    jsonGiven,
    iteration,
    tracesDir,
    reportsDir,
    harness,
  };
}

/** The `claude` argv of a spec; `json` replaces the result path (a run writes to its private one). */
export function harnessArgv(spec, { json = spec.json } = {}) {
  const options = spec.harness.flatMap(([name, ...rest]) => (name === '--json' ? [name, json] : [name, ...rest]));
  return ['plugin', 'eval', spec.plugin, '--eval-dir', spec.evalDir, '--scaffold', '--allow-tools', ...GRANTED_TOOLS, '--no-publish', '--keep-temp', ...options];
}

/** Compatibility adapter: the argv of raw `run` arguments, validated as `run` validates them. */
export const runArgs = (extra = [], context = {}) => harnessArgv(runSpec(parseRunOptions(extra), context));
