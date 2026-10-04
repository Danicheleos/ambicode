import assert from 'node:assert/strict';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { NAKED_PLUGIN, runArgs } from './evals-bench.mjs';
import { baselineCases, buildNaked } from './naked-arm.mjs';

describe('naked-arm', () => {
  let root;
  let casesDir;
  before(() => {
    root = mkdtempSync(path.join(tmpdir(), 'naked-arm-'));
    casesDir = path.join(root, 'cases');
    for (const id of ['be-1', 'be-1-review-9-abc', 'be-1-review-9-abc-forced']) {
      mkdirSync(path.join(casesDir, id), { recursive: true });
      writeFileSync(path.join(casesDir, id, 'prompt.md'), id);
    }
    writeFileSync(path.join(casesDir, 'selection.json'), '{}');
    mkdirSync(path.join(root, 'benchmarks'));
  });
  after(() => rmSync(root, { recursive: true, force: true }));

  it('leaves out the forced twins, whose no-plugin arm is the neutral twin', () => {
    assert.deepEqual(baselineCases(casesDir), ['be-1', 'be-1-review-9-abc']);
  });

  it('builds a plugin with nothing in it that the run accepts, with real case copies and one benchmarks symlink', () => {
    const out = path.join(root, 'out');
    buildNaked({ out, casesDir, benchmarks: path.join(root, 'benchmarks') });
    assert.deepEqual(JSON.parse(readFileSync(path.join(out, '.claude-plugin', 'plugin.json'), 'utf8')).name, NAKED_PLUGIN);
    assert.ok(lstatSync(path.join(out, 'benchmarks')).isSymbolicLink());
    assert.ok(!lstatSync(path.join(out, 'evals', 'evals-core', 'cases', 'be-1')).isSymbolicLink(), 'the harness refuses symlinks under --eval-dir');
    assert.throws(() => lstatSync(path.join(out, 'evals', 'evals-core', 'cases', 'be-1-review-9-abc-forced')));
    assert.ok(runArgs(['--model', 'm', '--max-cost-usd', '1'], { plugin: out }).includes(out));
  });
});
