import assert from 'node:assert/strict';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { parse as parseYaml } from 'yaml';
import { CASES_LOCK, GENERATION_MARKER, INVESTIGATE_COMMAND, NAKED_COPY, NAKED_PLUGIN, PROMPT, SWAP_MARKER, WITH_PROMPT, restorePrompts, runArgs, swapInPluginPrompts, writePluginPrompt } from '../harness/evals-bench.mjs';
import { baselineCases, buildNaked, parseArgs, rebaseScaffold } from './naked-arm.mjs';
import { baseScaffoldScript } from '../cases/base-scaffold.mjs';
import { ROOT } from '../shared/bench-paths.mjs';
import { spawnSync } from 'node:child_process';

const NAKED_PROMPT = '---\nname: be-1\ntags: ["bench", "localize"]\n---\n\nIn the repository at `repo/`, find the files.\n\nAnswer the question.\n';

describe('naked-arm', () => {
  let root;
  let casesDir;
  before(() => {
    root = mkdtempSync(path.join(tmpdir(), 'naked-arm-'));
    casesDir = path.join(root, 'cases');
    for (const id of ['be-1', 'be-1-review-9-abc']) {
      mkdirSync(path.join(casesDir, id), { recursive: true });
      writeFileSync(path.join(casesDir, id, PROMPT), id === 'be-1' ? NAKED_PROMPT : id);
    }
    writePluginPrompt(path.join(casesDir, 'be-1'), INVESTIGATE_COMMAND);
    // A per-arm selector a future harness might read; the control copy must not carry it.
    writeFileSync(path.join(casesDir, 'be-1', 'case.yaml'), 'schema_version: "1.1"\nname: be-1\nprompts:\n  with: prompt.with.md\nexecution:\n  prompt_with: prompt.with.md\n  max_turns: 40\n');
    writeFileSync(path.join(casesDir, 'be-1-review-9-abc', 'case.yaml'), 'schema_version: "1.1"\nname: be-1-review-9-abc\ncontext:\n  scaffold_script: scaffold.sh\n');
    writeFileSync(path.join(casesDir, 'selection.json'), '{}');
    mkdirSync(path.join(root, 'benchmarks'));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('copies every case, and refuses a leftover forced twin from an older generator', () => {
    assert.deepEqual(baselineCases(casesDir), ['be-1', 'be-1-review-9-abc']);
    buildNaked({ out: path.join(root, 'lock-out'), casesDir, benchmarks: path.join(root, 'benchmarks') });
    assert.ok(existsSync(path.join(casesDir, CASES_LOCK)), 'the copy held the cases lock');
    assert.deepEqual(baselineCases(casesDir), ['be-1', 'be-1-review-9-abc'], 'the lock directory is not a case');
    assert.deepEqual(readdirSync(path.join(root, 'lock-out', 'evals', 'common', 'core', 'cases')).sort(), ['be-1', 'be-1-review-9-abc'], 'nor is it copied into the control');
    mkdirSync(path.join(casesDir, 'be-1-review-9-abc-forced'));
    try {
      assert.throws(() => baselineCases(casesDir), /forced twin/);
    } finally {
      rmSync(path.join(casesDir, 'be-1-review-9-abc-forced'), { recursive: true });
    }
  });

  it('builds a plugin with nothing in it that the run accepts, with real case copies and no symlink', () => {
    const out = path.join(root, 'out');
    buildNaked({ out, casesDir, benchmarks: path.join(root, 'benchmarks') });
    assert.deepEqual(JSON.parse(readFileSync(path.join(out, '.claude-plugin', 'plugin.json'), 'utf8')).name, NAKED_PLUGIN);
    assert.ok(!existsSync(path.join(out, 'evals-assets', 'benchmarks')));
    assert.ok(!lstatSync(path.join(out, 'evals', 'common', 'core', 'cases', 'be-1')).isSymbolicLink(), 'the harness refuses symlinks under --eval-dir');
    assert.ok(runArgs(['--model', 'm', '--max-cost-usd', '1'], { plugin: out }).includes(out));
  });

  it('serves the generator\'s naked prompt bytes and carries no plugin prompt or selector', () => {
    const out = path.join(root, 'out-clean');
    buildNaked({ out, casesDir, benchmarks: path.join(root, 'benchmarks') });
    const copy = path.join(out, 'evals', 'common', 'core', 'cases', 'be-1');
    assert.equal(readFileSync(path.join(copy, PROMPT), 'utf8'), NAKED_PROMPT);
    assert.ok(!existsSync(path.join(copy, WITH_PROMPT)) && !existsSync(path.join(copy, NAKED_COPY)));
    const caseYaml = parseYaml(readFileSync(path.join(copy, 'case.yaml'), 'utf8'));
    assert.deepEqual(caseYaml, { schema_version: '1.1', name: 'be-1', execution: { max_turns: 40 } });
    assert.equal(
      readFileSync(path.join(out, 'evals', 'common', 'core', 'cases', 'be-1-review-9-abc', 'case.yaml'), 'utf8'),
      readFileSync(path.join(casesDir, 'be-1-review-9-abc', 'case.yaml'), 'utf8'),
      'a case.yaml with no selector is copied byte for byte',
    );
  });

  it('refuses to build while a swap is outstanding, and builds clean once it is restored', () => {
    const out = path.join(root, 'out-swap');
    swapInPluginPrompts(casesDir, ['be-1']);
    try {
      assert.throws(() => buildNaked({ out, casesDir, benchmarks: path.join(root, 'benchmarks') }), /restore-prompts/);
      assert.ok(!existsSync(out), 'nothing is built');
    } finally {
      restorePrompts(casesDir);
    }
    buildNaked({ out, casesDir, benchmarks: path.join(root, 'benchmarks') });
    assert.equal(readFileSync(path.join(out, 'evals', 'common', 'core', 'cases', 'be-1', PROMPT), 'utf8'), NAKED_PROMPT);
  });

  it('refuses an interrupted generation, and a plugin prompt left in prompt.md without its marker', () => {
    const out = path.join(root, 'out-refused');
    writeFileSync(path.join(casesDir, GENERATION_MARKER), '');
    assert.throws(() => buildNaked({ out, casesDir }), /--regenerate/);
    rmSync(path.join(casesDir, GENERATION_MARKER));
    writeFileSync(path.join(casesDir, 'be-1', PROMPT), readFileSync(path.join(casesDir, 'be-1', WITH_PROMPT)));
    try {
      assert.ok(!existsSync(path.join(casesDir, SWAP_MARKER)));
      assert.throws(() => buildNaked({ out, casesDir }), /not the generated naked prompt/);
    } finally {
      writeFileSync(path.join(casesDir, 'be-1', PROMPT), NAKED_PROMPT);
    }
  });

  it('points scaffolds at an external benchmark root given by absolute path, and refuses a relative one', () => {
    const external = mkdtempSync(path.join(tmpdir(), 'primary-benchmarks-'));
    try {
      const options = parseArgs(['--benchmarks', external, '--out', path.join(root, 'out-external')]);
      assert.equal(options.benchmarks, external);
      buildNaked({ ...options, casesDir });
      assert.ok(!existsSync(path.join(root, 'out-external', 'evals-assets', 'benchmarks')));
      assert.throws(() => parseArgs(['--benchmarks', 'benchmarks']), /absolute path/);
      assert.throws(() => parseArgs(['--benchmarks']), /unknown argument/);
    } finally {
      rmSync(external, { recursive: true, force: true });
    }
  });
});

describe('naked-arm: preset cases', () => {
  it('rewrites a base-commit scaffold\'s quoted climb to the absolute project, and copies a preset into its own eval dir', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'naked-preset-'));
    try {
      const script = baseScaffoldScript({ sideRel: '../../../../../../assets/benchmarks/BE-express', base: 'a'.repeat(40), root: 'src', wholeTree: true });
      const external = path.join(root, "it's here", 'benchmarks');
      const rebased = rebaseScaffold(script, external);
      assert.match(rebased, /^SIDE='.*benchmarks\/BE-express'$/m);
      assert.ok(!rebased.includes('dirname "$0")"/'), 'no relative climb is left');
      assert.equal(spawnSync('sh', ['-c', `${rebased.split('\n').find((l) => l.startsWith('SIDE='))}; printf %s "$SIDE"`], { encoding: 'utf8' }).stdout, path.join(external, 'BE-express'));
      const options = parseArgs(['--preset', 'light', '--out', path.join(root, 'out')]);
      assert.deepEqual([path.relative(ROOT, options.casesDir), options.evalCases], ['evals/common/presets/light', 'evals/common/presets/light']);
      assert.throws(() => parseArgs(['--preset', 'huge']), /--preset takes/);
      const core = parseArgs(['--preset', 'average']);
      assert.deepEqual([path.relative(ROOT, core.casesDir), core.evalCases], [path.join('evals', 'common', 'core', 'cases'), 'evals/common/core/cases'], 'the average preset is the core suite');
      const casesDir = path.join(root, 'light');
      mkdirSync(path.join(casesDir, 'be-1-task'), { recursive: true });
      writeFileSync(path.join(casesDir, 'be-1-task', PROMPT), NAKED_PROMPT);
      writeFileSync(path.join(casesDir, 'be-1-task', 'scaffold.sh'), script);
      buildNaked({ out: path.join(root, 'out'), casesDir, benchmarks: external, evalCases: 'evals/common/presets/light' });
      assert.equal(readFileSync(path.join(root, 'out', 'evals/common/presets/light/be-1-task/scaffold.sh'), 'utf8'), rebased);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
