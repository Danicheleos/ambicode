import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { ARCHIVED_EVAL_DIR, PREFLIGHT, PREFLIGHT_MAX_COST_USD, RECORDINGS, judge, preflightArgs } from './evals-preflight.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const EVALS = path.join(ROOT, ARCHIVED_EVAL_DIR);

function result({ failing = {}, drop = [], partial = false, error = null, cases = PREFLIGHT.map((p) => p.case) } = {}) {
  return {
    partial,
    partialReason: partial ? 'cost_ceiling' : null,
    costUsd: 0.5,
    cases: cases.map((name) => {
      const entry = PREFLIGHT.find((p) => p.case === name);
      const names = [...(entry?.require ?? ['plugin-fired']), ...Object.keys(entry?.expectedToFail ?? {})];
      return {
        name,
        arms: {
          with: [
            {
              error,
              graders: names
                .filter((grader) => !drop.includes(`${name}/${grader}`))
                .map((grader) => ({
                  name: grader,
                  passed: !(`${name}/${grader}` in failing),
                  explanation: failing[`${name}/${grader}`] ?? 'matched',
                })),
            },
          ],
        },
      };
    }),
  };
}

describe('evals-preflight: the decision', () => {
  it('passes when every gated indicator passed, and shows the ungated one without counting it', () => {
    const { ok, lines } = judge(result({ failing: { 'p2-task-regression-fix/reviewer-completed': 'no match' } }));
    assert.equal(ok, true, lines.join('\n'));
    assert.ok(lines.includes('PASS  regression-ts reviewer-completed'));
    assert.ok(lines.includes('PASS  p2-task-regression-fix unit-check-ran'));
    assert.match(lines.join('\n'), /^NOTE {2}p2-task-regression-fix reviewer-completed: failed, not gated: .*replay-miss/m);
  });

  it('fails on each gated indicator that did not pass, with the grader\'s explanation', () => {
    for (const entry of PREFLIGHT) {
      for (const name of entry.require) {
        const { ok, lines } = judge(result({ failing: { [`${entry.case}/${name}`]: 'no Skill call' } }));
        assert.equal(ok, false, `${entry.case}/${name}`);
        assert.ok(lines.includes(`FAIL  ${entry.case} ${name}: no Skill call`), lines.join('\n'));
      }
    }
  });

  it('fails when a gated grader is absent, so a rename cannot make the gate vacuous', () => {
    const { ok, lines } = judge(result({ drop: ['regression-ts/unit-check-ran'] }));
    assert.equal(ok, false);
    assert.ok(lines.includes('FAIL  regression-ts unit-check-ran: no such grader in the result'));
  });

  it('fails on a partial run, an errored run, a missing case and an extra one', () => {
    assert.equal(judge(result({ partial: true })).ok, false);
    assert.match(judge(result({ error: 'timed out' })).lines.join('\n'), /FAIL {2}regression-ts: the run errored: timed out/);
    assert.match(judge(result({ cases: ['regression-ts'] })).lines.join('\n'), /FAIL {2}p2-task-regression-fix: 0 result\(s\), expected 1/);
    const extra = judge(result({ cases: [...PREFLIGHT.map((p) => p.case), 'clean-ts'] }));
    assert.equal(extra.ok, false);
    assert.match(extra.lines.join('\n'), /FAIL {2}clean-ts: carries the preflight tag but is not a preflight case/);
  });

  it('fails a with arm that has no run at all', () => {
    const empty = result();
    empty.cases[0].arms.with = [];
    assert.equal(judge(empty).ok, false);
  });
});

describe('evals-preflight: the cases it runs', () => {
  it('names only graders the cases carry, as with-only indicators', async () => {
    for (const entry of PREFLIGHT) {
      const graders = await readdir(path.join(EVALS, entry.case, 'graders'));
      for (const name of [...entry.require, ...Object.keys(entry.expectedToFail ?? {})]) {
        assert.ok(graders.includes(`${name}.md`), `${entry.case} has no ${name}.md`);
        const source = await readFile(path.join(EVALS, entry.case, 'graders', `${name}.md`), 'utf8');
        const frontmatter = parseYaml(/^---\n([\s\S]*?)\n---/.exec(source)?.[1] ?? '');
        assert.equal(frontmatter.arm, 'with-only', `${entry.case}/${name}`);
      }
    }
  });

  it('is selected by a tag exactly these cases carry', async () => {
    const tagged = [];
    for (const entry of await readdir(EVALS, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === 'results') continue;
      const prompt = await readFile(path.join(EVALS, entry.name, 'prompt.md'), 'utf8');
      const frontmatter = parseYaml(/^---\n([\s\S]*?)\n---/.exec(prompt)?.[1] ?? '');
      if ((frontmatter.tags ?? []).includes('preflight')) tagged.push(entry.name);
    }
    assert.deepEqual(tagged.sort(), PREFLIGHT.map((p) => p.case).sort());
  });

  it('runs each once, with the with arm only, bounded, and decided by this script rather than the score', () => {
    const argv = preflightArgs('/tmp/out.json', ['--trust-plugin']);
    const after = (flag) => argv[argv.indexOf(flag) + 1];
    assert.deepEqual(argv.slice(0, 2), ['plugin', 'eval']);
    // Without it the harness reads the manifest's eval directory, which carries no
    // `preflight` case.
    assert.equal(after('--eval-dir'), ARCHIVED_EVAL_DIR);
    assert.equal(after('--tag'), 'preflight');
    assert.equal(after('--runs'), '1');
    assert.equal(after('--ablation'), 'none');
    assert.equal(after('--max-cost-usd'), String(PREFLIGHT_MAX_COST_USD));
    assert.equal(after('--threshold'), '0');
    assert.equal(after('--json'), '/tmp/out.json');
    assert.ok(!argv.includes('--case'), '--case is not repeatable: the last one wins');
    assert.equal(argv.at(-1), '--trust-plugin');
    assert.ok(path.isAbsolute(RECORDINGS));
  });

  it('keeps the recordings where the sandboxed agent can read them, outside the eval directory', async () => {
    const fromEvals = path.relative(EVALS, RECORDINGS);
    const fromRoot = path.relative(ROOT, RECORDINGS);
    assert.ok(fromEvals.startsWith('..'), fromEvals);
    assert.ok(!fromRoot.startsWith('..') && !path.isAbsolute(fromRoot), fromRoot);
    const recordings = JSON.parse(await readFile(RECORDINGS, 'utf8')).recordings;
    assert.ok(recordings.some((recording) => recording.case === 'regression-ts'), 'the preflight case has no recording');
  });
});
