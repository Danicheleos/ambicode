// Regression assertions moved intact from the approved harness suite.
import { describe, it, before, after } from 'node:test';
import { runArgs, parseRunOptions } from './run-options.mjs';
import { M, syntheticBenchmarks, syntheticPlugin, snapshot, neverSpawn, jsonOf } from '../testing/bench-test-fixtures.mjs';
import assert from 'node:assert/strict';
import { CURATED_EVAL_DIR, BENCH_EVAL_DIR, runSweep, planRun } from './evals-bench.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { ROOT } from '../shared/bench-paths.mjs';

describe('evals-bench: running', () => {
  it('runs the curated suite by default, the full set with --set full, and never publishes', () => {
    const argv = runArgs([...M, '--case', 'x', '-j', '4']);
    assert.deepEqual(argv.slice(0, 2), ['plugin', 'eval']);
    assert.equal(argv[argv.indexOf('--eval-dir') + 1], CURATED_EVAL_DIR);
    assert.ok(argv.includes('--no-publish'));
    const full = runArgs([...M], { set: 'full' });
    assert.equal(full[full.indexOf('--eval-dir') + 1], BENCH_EVAL_DIR);
    assert.throws(() => runArgs([...M, '--publish-report']), /NDA/);
    assert.throws(() => runArgs([...M, '--eval-dir', 'evals']), /fixed/);
    assert.throws(() => runArgs([...M], { set: 'both' }), /curated or full/);
  });

  it('refuses a run whose model is not pinned', () => {
    assert.throws(() => runArgs(['--case', 'x']), /--model is required/);
    assert.equal(runArgs([...M])[runArgs([...M]).indexOf('--model') + 1], 'claude-sonnet-5-5');
  });

  it('refuses a run with no cost ceiling', () => {
    assert.throws(() => runArgs(['--model', 'claude-sonnet-5-5']), /--max-cost-usd is required/);
    assert.throws(() => runArgs(['--model', 'claude-sonnet-5-5', '--max-cost-usd']), /--max-cost-usd is required/);
  });

  it('evaluates a variant plugin directory in place of the repository, and refuses a directory that is no plugin', () => {
    const variant = mkdtempSync(path.join(tmpdir(), 'variant-'));
    assert.throws(() => runArgs([...M], { plugin: variant }), /is not a plugin/);
    mkdirSync(path.join(variant, '.claude-plugin'));
    writeFileSync(path.join(variant, '.claude-plugin', 'plugin.json'), '{}');
    const argv = runArgs([...M], { plugin: variant });
    assert.equal(argv[2], variant);
    assert.equal(runArgs([...M])[2], ROOT);
    rmSync(variant, { recursive: true });
  });

  it('keeps the result JSON inside the excluded directories', () => {
    const benchmarks = path.join(tmpdir(), 'b');
    const argv = runArgs([...M], { now: new Date('2026-01-02T03:04:05.678Z'), benchmarks, set: 'full' });
    assert.equal(argv[argv.indexOf('--json') + 1], path.join(benchmarks, 'results', 'eval-2026-01-02T03-04-05-678Z.json'));
    const curated = runArgs([...M], { now: new Date('2026-01-02T03:04:05.678Z'), benchmarks });
    assert.equal(curated[curated.indexOf('--json') + 1], path.join(ROOT, 'evals', 'evals-core', 'results', 'eval-2026-01-02T03-04-05-678Z.json'));
    assert.equal(runArgs([...M, '--json', path.join(benchmarks, 'r.json')], { benchmarks }).filter((a) => a === '--json').length, 1);
    assert.ok(runArgs([...M, '--json', path.join(ROOT, 'evals', 'evals-core', 'results', 'r.json')], { benchmarks }).includes('--json'), 'evals/evals-core/results/ is gitignored and allowed');
    assert.throws(() => runArgs([...M, '--json', path.join(ROOT, 'evals', 'evals-triggers', 'results', 'r.json')], { benchmarks }), /must stay under/, 'another suite\'s results dir is not the curated excluded dir');
    for (const flag of ['--json', '--report', '--output-dir']) {
      assert.throws(() => runArgs([...M, flag, path.join(tmpdir(), 'elsewhere.json')], { benchmarks }), /must stay under/);
      assert.throws(() => runArgs([...M, flag], { benchmarks }), /needs a path/);
    }
  });
});

describe('evals-bench: run arguments are parsed once', () => {
  let root;
  let benchmarks;
  let casesDir;
  let plugin;
  let n = 0;
  before(() => {
    root = mkdtempSync(path.join(tmpdir(), 'bench-args-'));
    benchmarks = syntheticBenchmarks(root, { localize: 2, review: 1 });
    ({ plugin, casesDir } = syntheticPlugin(root, benchmarks, { pick: { localize: 2, review: 1 } }));
  });
  after(() => rmSync(root, { recursive: true, force: true }));
  const fresh = () => path.join(benchmarks, 'results', `args-${++n}.json`);
  const quiet = { harvest: () => 0, log: () => {}, warn: () => {} };

  const refusedWithoutEffect = async (argv, pattern) => {
    const before = snapshot(root);
    await assert.rejects(runSweep(argv, { ...quiet, benchmarks, spawnRun: neverSpawn }), pattern);
    assert.deepEqual(snapshot(root), before, `nothing changed for ${argv.join(' ')}`);
  };

  it('refuses a repeated singleton option before spawning or changing anything', async () => {
    const base = (json) => ['--plugin', plugin, '--json', json, '--model', 'm', '--max-cost-usd', '1', '--tag', 'localize'];
    await refusedWithoutEffect([...base(fresh()), '--prompt', 'with', '--ablation', 'none', '--ablation', 'with-without'], /--ablation given twice \(none and with-without\)/);
    await refusedWithoutEffect([...base(fresh()), '--model', 'other'], /--model given twice/);
    await refusedWithoutEffect([...base(fresh()), '--json', fresh()], /--json given twice/);
    await refusedWithoutEffect([...base(fresh()), '--case', 'a*', '--case', 'b*'], /--case given twice \(two selectors\)/);
    await refusedWithoutEffect([...base(fresh()), '--walk', '--walk'], /--walk given twice/);
  });

  it('refuses missing values, unknown options and stray words', async () => {
    const head = ['--plugin', plugin, '--max-cost-usd', '1'];
    await refusedWithoutEffect([...head, '--model'], /--model needs a value/);
    await refusedWithoutEffect([...head, '--model', 'm', '--case', '--tag', 'localize'], /--case needs a value/);
    await refusedWithoutEffect([...head, '--model', 'm', '--tag'], /--tag needs a value/);
    await refusedWithoutEffect([...head, '--model', 'm', '--tag='], /--tag needs a value/);
    await refusedWithoutEffect([...head, '--model', 'm', '--walk=yes'], /--walk takes no value/);
    await refusedWithoutEffect([...head, '--model', 'm', '--debug-file', 'x'], /unknown option --debug-file/);
    await refusedWithoutEffect([...head, '--model', 'm', 'stray'], /unexpected argument stray/);
    await refusedWithoutEffect([...head, '--model', 'm', '--allow-tools', 'Write'], /fixed to Bash/);
    await refusedWithoutEffect([...head, '--model', 'm', '--tag', 'walk', '--tag=localize'], /ANY of these tags/);
  });

  it('forwards exactly the validated values, with --x=v read as --x v', async () => {
    const json = fresh();
    let forwarded;
    const spawnRun = async (argv) => {
      forwarded = argv;
      return 1;
    };
    await runSweep(['--plugin=' + plugin, '--json=' + json, '--model=m', '--max-cost-usd=1', '--tag=localize', '--prompt=with', '--ablation=none', '-j', '4', '--trust-plugin'], { ...quiet, benchmarks, spawnRun });
    assert.deepEqual(forwarded, [
      'plugin', 'eval', plugin, '--eval-dir', CURATED_EVAL_DIR, '--scaffold', '--allow-tools', 'Bash', '--no-publish', '--keep-temp',
      '--model', 'm', '--max-cost-usd', '1', '--ablation', 'none', '--json', jsonOf(forwarded), '--concurrency', '4', '--trust-plugin', '--tag', 'localize',
    ]);
    assert.equal(path.dirname(jsonOf(forwarded)), path.dirname(json), 'the private result sits beside the target, under the same exclusion');
    assert.match(path.basename(jsonOf(forwarded)), new RegExp(`^\\.${path.basename(json, '.json')}\\.run-[0-9a-f-]{36}\\.json$`));
    assert.ok(!existsSync(jsonOf(forwarded)) && !existsSync(json), 'a run that wrote nothing leaves neither file');
    const plan = planRun(['--plugin', plugin, '--json', fresh(), '--model', 'm', '--max-cost-usd', '2', '--runs', '3', '--case', 'aa-t-?', '--tag', 'localize', '--walk'], { benchmarks });
    assert.deepEqual([plan.model, plan.maxCostUsd, plan.runs, plan.caseGlob, plan.tags, plan.walk, plan.cases.length], ['m', 2, '3', 'aa-t-?', ['localize'], true, 2]);
    assert.equal(plan.argv[plan.argv.indexOf('--case') + 1], 'aa-t-?');
    assert.deepEqual(parseRunOptions(['--tag', 'localize']).tags, ['localize']);
    assert.ok(existsSync(casesDir));
  });
});
