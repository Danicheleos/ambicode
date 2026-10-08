import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { harvestPatches } from '../harness/evals-bench.mjs';
import { pluginPrompt, TASK_COMMAND } from '../harness/prompt-transport.mjs';
import { harnessArgv, runSpec, TASK_EVAL_DIR } from '../harness/run-options.mjs';
import { ROOT } from '../shared/bench-paths.mjs';
import { caseConfig, generate, splitChange } from './task-cases.mjs';

const git = (cwd, ...args) => {
  const r = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', ...args], { cwd, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const put = (file, text) => {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
};

describe('task cases', () => {
  let top;
  let benchmarks;
  const sources = { 'src/a.ts': 'export const a = 1;\n', 'src/a.test.ts': 'expect(a).toBe(1);\n' };
  const fixed = { 'src/a.ts': 'export const a = 2;\n', 'src/a.test.ts': 'expect(a).toBe(1);\nexpect(a).toBe(2);\n' };
  const ticket = (id, files) => {
    const side = path.join(benchmarks, 'BE-express');
    put(path.join(side, 'assets', `${id}.md`), `## build:context prompt\nFix the bug where a is wrong (${id}).\n## TRUE RELATED CODE\n- \`src/a.ts\`\n`);
    const work = path.join(top, 'work');
    if (!existsSync(work)) {
      mkdirSync(work);
      git(work, 'init', '-q');
      for (const [f, t] of Object.entries(sources)) put(path.join(work, f), t);
      git(work, 'add', '-A');
      git(work, 'commit', '-qm', 'base');
      spawnSync('git', ['clone', '-q', '--bare', work, path.join(side, '.git')]);
    }
    const base = git(work, 'rev-parse', 'HEAD');
    for (const [f, t] of Object.entries(files)) put(path.join(work, f), t);
    const patch = git(work, 'diff') + '\n';
    git(work, 'checkout', '-q', '.');
    const dir = path.join(side, 'reviews', id, 'v1');
    put(path.join(dir, 'version.json'), JSON.stringify({ base, root: 'src' }));
    put(path.join(dir, 'change.patch'), patch);
  };

  before(() => {
    top = mkdtempSync(path.join(tmpdir(), 'task-cases-'));
    benchmarks = path.join(top, 'bench');
  });
  after(() => rmSync(top, { recursive: true, force: true }));

  it('07-T1: selects tickets with a named test in stable id order, first N, counts only', () => {
    for (const id of ['T3', 'T1']) ticket(id, fixed);
    ticket('T2', { 'src/a.ts': fixed['src/a.ts'] });
    const out = path.join(top, 'out');
    const counts = generate({ benchmarks, out, limit: 1, testCommand: ['t'], check: ({ patch }) => ({ exit: patch ? 0 : 1 }) });
    assert.deepEqual(readdirSync(out), ['be-task-t1']);
    assert.equal(counts.written, 1);
    const all = generate({ benchmarks, out, limit: 10, testCommand: ['t'], check: ({ patch }) => ({ exit: patch ? 0 : 1 }) });
    assert.deepEqual(readdirSync(out).sort(), ['be-task-t1', 'be-task-t3']);
    assert.deepEqual(all, { candidates: 3, written: 2, noTest: 1, checkFailed: 0 });
    assert.deepEqual(Object.keys(all).sort(), ['candidates', 'checkFailed', 'noTest', 'written']);
  });

  it('07-T2: --sides filters the sides; a unit command goes into the case config copy the scaffold uses, whole tree', () => {
    put(path.join(benchmarks, 'BE-express', 'project', '.ambicode', 'config.yaml'), '# team\nprojects:\n  - id: app\n    commands:\n      unit: null\n    checks:\n      unit: null\n');
    const out = path.join(top, 'out-unit');
    assert.equal(generate({ benchmarks, out, sides: ['FE-angular'], testCommand: ['t'], check: () => ({ exit: 1 }) }).candidates, 0);
    const unit = { argv: ['node_modules/.bin/vitest', 'run', '{files}'], adapter: 'vitest' };
    generate({ benchmarks, out, limit: 1, sides: ['BE-express'], testCommand: ['t'], unit, check: ({ patch }) => ({ exit: patch ? 0 : 1 }) });
    const dir = path.join(out, 'be-task-t1');
    const config = readFileSync(path.join(dir, 'config.yaml'), 'utf8');
    assert.match(config, /^# team/);
    assert.match(config, /unit:\n\s+argv:\n\s+- node_modules\/\.bin\/vitest\n\s+- run\n\s+- "\{files\}"/);
    assert.match(config, /unit:\n\s+command: unit\n\s+adapter: vitest/);
    const scaffold = readFileSync(path.join(dir, 'scaffold.sh'), 'utf8');
    assert.match(scaffold, /cp "\$\(dirname "\$0"\)"\/'config\.yaml'/);
    assert.match(scaffold, /archive '[0-9a-f]{40}' \| tar/);
    assert.equal(caseConfig('projects: []\n', unit), 'projects: []\n');
  });

  it('07-T2: the hidden test is held out of the scaffold and the model-visible case files', () => {
    const dir = path.join(top, 'out', 'be-task-t1');
    assert.match(readFileSync(path.join(dir, 'scaffold.sh'), 'utf8'), /rm -rf -- 'repo\/src\/a\.test\.ts'/);
    assert.equal(readFileSync(path.join(dir, 'hidden', 'files', 'src', 'a.test.ts'), 'utf8'), fixed['src/a.test.ts']);
    assert.equal(readFileSync(path.join(dir, 'hidden', 'base', 'src', 'a.test.ts'), 'utf8'), sources['src/a.test.ts']);
  });

  it('07-T2: a case whose hidden test passes at base or fails at merged is skipped and counted', () => {
    const out = path.join(top, 'out2');
    const passesAtBase = generate({ benchmarks, out, testCommand: ['t'], check: () => ({ exit: 0 }) });
    assert.equal(passesAtBase.checkFailed, 2);
    assert.equal(readdirSync(out).length, 0);
    const failsAtMerged = generate({ benchmarks, out, testCommand: ['t'], check: () => ({ exit: 1 }) });
    assert.equal(failsAtMerged.checkFailed, 2);
  });

  it('07-T3: the prompt is the ticket text only; the merged implementation is not in it', () => {
    const dir = path.join(top, 'out', 'be-task-t1');
    for (const file of ['prompt.md', 'prompt.with.md', 'prompt.naked.md']) assert.doesNotMatch(readFileSync(path.join(dir, file), 'utf8'), /a = 2|toBe\(2\)/);
    assert.match(readFileSync(path.join(dir, 'prompt.md'), 'utf8'), /Fix the bug where a is wrong/);
  });

  it('07-T3: a patch with no test file, or one that does not apply, names no test', () => {
    assert.equal(splitChange('diff --git a/src/x.ts b/src/x.ts\n--- a/src/x.ts\n+++ b/src/x.ts\n@@ -1 +1 @@\n-a\n+b\n', () => 'a\n'), null);
  });

  it('07-T4: TASK_COMMAND is typed before the request', () => {
    assert.ok(TASK_COMMAND.includes('--answer "review-offer=skip — verification incomplete"'), 'the review after a task is extra work an eval declines');
    assert.ok(readFileSync(path.join(top, 'out', 'be-task-t1', 'prompt.with.md'), 'utf8').includes(`\n${TASK_COMMAND} Fix the bug`));
    assert.ok(pluginPrompt('hello\n', TASK_COMMAND).startsWith(`${TASK_COMMAND} hello`));
  });

  it('07-T4: --set task selects the task cases and eval directory', () => {
    const spec = runSpec(['--set', 'task', '--model', 'm', '--max-cost-usd', '1'], { plugin: ROOT });
    assert.equal(spec.casesDir, path.join(ROOT, 'evals', 'common', 'task', 'cases'));
    assert.equal(TASK_EVAL_DIR, 'evals/common/task');
    const argv = harnessArgv(spec);
    assert.equal(argv[argv.indexOf('--eval-dir') + 1], TASK_EVAL_DIR);
  });

  it('07-T4: harvest writes the sandbox repo patch, untracked files included, beside the ledgers', () => {
    const root = path.join(top, 'sandboxes');
    const repo = path.join(root, 'e-1', 'home', 'cwd', 'repo');
    put(path.join(repo, 'f.txt'), 'one\n');
    git(repo, 'init', '-q');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-qm', 'base');
    put(path.join(repo, 'f.txt'), 'two\n');
    put(path.join(repo, 'new.txt'), 'fresh\n');
    put(path.join(repo, '.ambicode', 'task', 'x', 'ledger.jsonl'), '{}\n');
    harvestPatches(path.join(top, 'traces'), { sandboxRoots: [root] });
    const patch = readFileSync(path.join(top, 'traces', 'patches', 'e-1.patch'), 'utf8');
    assert.match(patch, /\+two/);
    assert.match(patch, /new\.txt/);
    assert.doesNotMatch(patch, /ledger\.jsonl/);
    assert.equal(git(repo, 'diff', '--cached', '--name-only').trim(), '', 'the sandbox index is never touched: a review there must still see an unstaged change');
    assert.match(git(repo, 'status', '--porcelain'), /\?\? new\.txt/);
  });

  it('harvest diffs against the base commit, so a run that commits its change is not scored as empty', () => {
    const root = path.join(top, 'committed');
    const repo = path.join(root, 'e-2', 'home', 'cwd', 'repo');
    put(path.join(repo, 'f.txt'), 'one\n');
    git(repo, 'init', '-q');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-qm', 'base');
    put(path.join(repo, 'f.txt'), 'two\n');
    git(repo, 'commit', '-qam', 'agent');
    harvestPatches(path.join(top, 'traces2'), { sandboxRoots: [root] });
    assert.match(readFileSync(path.join(top, 'traces2', 'patches', 'e-2.patch'), 'utf8'), /\+two/);
  });
});

describe('task eval README', () => {
  const readme = readFileSync(path.join(ROOT, 'evals', 'common', 'task', 'README.md'), 'utf8').replace(/\s+/g, ' ');

  it('07-T7: states the detectable effect at 10 x 3 and that runs of one case are correlated', () => {
    assert.match(readme, /10 cases x 3 runs per arm detects about 20 pp/);
    assert.match(readme, /Runs of one case are correlated/);
    assert.match(readme, /effective sample is closer to 10 than to 30/);
  });

  it('07-T8: makes the run conditional on trusted launch and reports a blocked eval without forcing the offer', () => {
    assert.match(readme, /conditional on trusted launch \(P37\(b\) or P58\)/);
    assert.match(readme, /report "blocked eval"/);
    assert.match(readme, /do not force the offer through `route next`/);
  });

  it('07-T9: gives the decision rule with the 1.2x cost bar and the 30-case option', () => {
    assert.match(readme, /Gain >= 20 pp: stands/);
    assert.match(readme, /cost must also be <= 1\.2x the naked arm/);
    assert.match(readme, /Inside \+-20 pp: inconclusive/);
    assert.match(readme, /cost of 30 cases \(about \$90-270, detectable about 12 pp\)/);
    assert.match(readme, /Loss beyond 20 pp: the cut is proposed/);
  });
});

