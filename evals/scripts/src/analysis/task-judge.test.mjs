import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import { createAnalysis, score } from './bench-score.mjs';
import { capPatch, claudeJudge, judgePrompt, judgeTaskRuns, parseVerdict, writeJudgeFile } from './task-judge.mjs';

const section = (file, body) => `diff --git a/${file} b/${file}\n--- a/${file}\n+++ b/${file}\n@@ -1 +1 @@\n-a\n+${body}\n`;

describe('task-judge', () => {
  it('caps each file and the whole patch, and names what it cut or left out', () => {
    const patch = section('src/a.ts', 'x'.repeat(50)) + section('src/b.ts', 'y') + section('src/c.ts', 'z');
    const whole = capPatch(patch);
    assert.equal(whole.text, patch);
    assert.deepEqual([whole.truncated, whole.omitted], [[], []]);
    const cut = capPatch(patch, { fileCap: 80, totalCap: 150 });
    assert.deepEqual(cut.truncated, ['src/a.ts', 'src/b.ts']);
    assert.deepEqual(cut.omitted, ['src/c.ts']);
    assert.match(cut.text, /file cut at 80 bytes[\s\S]*Not shown \(over the size cap\): src\/c\.ts/);
    const unread = `diff --git odd header\n${'x'.repeat(100)}\n`;
    const shifted = capPatch(unread + section('src/b.ts', 'y') + section('src/c.ts', 'z'), { fileCap: 80, totalCap: 150 });
    assert.deepEqual([shifted.truncated, shifted.omitted], [['odd header', 'src/b.ts'], ['src/c.ts']], 'a section the parser cannot read keeps its own name, so later names do not shift');
  });

  it('reads a 0..1 verdict and refuses anything else', () => {
    assert.deepEqual(parseVerdict('Sure.\n{"score": 0.75, "missing": ["no test"], "reason": "close"}'), { score: 0.75, missing: ['no test'], reason: 'close' });
    for (const bad of ['no json', '{"score": 2}', '{"score": "high"}', '{broken', null, '{"score": null}', '{"score": ""}', '{"score": true}', '{"score": "0.5"}']) assert.equal(parseVerdict(bad), null, String(bad));
    assert.equal(parseVerdict('{"score": 0.8, "reason": "a {brace}"}\nNote: see {x}.').score, 0.8, 'a brace after the JSON does not lose a paid answer');
    assert.equal(parseVerdict('```json\n{"score": 0.4}\n```').score, 0.4);
    assert.match(judgePrompt({ request: 'R', oracle: 'O', run: '' }), /<request>\nR\n[\s\S]*the agent changed nothing/);
  });

  it('spawns claude with no tools, a budget and the prompt on stdin, and reports an unreadable answer as an error', () => {
    const calls = [];
    const fake = (out) => (command, args, options) => (calls.push({ command, args, options }), out);
    const ok = claudeJudge({ model: 'm', spawn: fake({ status: 0, stdout: JSON.stringify({ result: '{"score":1}', total_cost_usd: 0.02 }) }) })({ prompt: 'P', budgetUsd: 0.5 });
    assert.deepEqual(ok, { text: '{"score":1}', costUsd: 0.02, error: null });
    const { command, args, options } = calls[0];
    assert.equal(command, 'claude');
    assert.deepEqual(args.slice(args.indexOf('--tools'), args.indexOf('--tools') + 2), ['--tools', '']);
    assert.equal(args[args.indexOf('--max-budget-usd') + 1], '0.5');
    assert.equal(options.input, 'P');
    assert.match(claudeJudge({ model: 'm', spawn: fake({ status: 1, stdout: '', stderr: 'Not logged in' }) })({ prompt: 'P', budgetUsd: 1 }).error, /exit 1: Not logged in/);
  });

  describe('judging a result', () => {
    let cases;
    let tracesDir;
    before(() => {
      cases = mkdtempSync(path.join(tmpdir(), 'task-judge-'));
      tracesDir = path.join(cases, 'traces');
      const dir = path.join(cases, 'common', 'presets', 'light', 'c-task');
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'truth.json'), JSON.stringify({ kind: 'task', preset: 'light', side: 'S', root: 'src', truth: ['src/a.ts'], existing: ['src/a.ts'], created: [], deleted: [], oracle: 'oracle.patch' }));
      writeFileSync(path.join(dir, 'oracle.patch'), section('src/a.ts', 'merged'));
      mkdirSync(path.join(tracesDir, 'patches'), { recursive: true });
      for (const id of ['e-1', 'e-2', 'e-3']) writeFileSync(path.join(tracesDir, 'patches', `${id}.patch`), section('src/a.ts', id));
    });
    after(() => rmSync(cases, { recursive: true, force: true }));
    const results = { cases: [{ name: 'c-task', promptMarkdown: 'Fix it.', arms: { with: ['e-1', 'e-2', 'e-3', 'e-none'].map((id) => ({ tracePath: `/tmp/${id}/out/trace.jsonl`, costUsd: 1 })) } }] };

    it('stops at the cap and records the rest as skipped; an unharvested run is never judged; score merges the verdicts apart from agent cost', () => {
      const prompts = [];
      const judge = ({ prompt }) => (prompts.push(prompt), { text: '{"score": 0.5, "missing": [], "reason": "half"}', costUsd: 0.3, error: null });
      const verdicts = judgeTaskRuns(results, { judge, maxCostUsd: 0.5, model: 'm', analysis: createAnalysis({ cases, tracesDir }) });
      assert.deepEqual(verdicts.runs.map((r) => [r.sandbox, r.judgeScore ?? r.skipped]), [['e-1', 0.5], ['e-2', 0.5], ['e-3', 'budget'], ['e-none', 'no harvested patch']]);
      assert.equal(verdicts.costUsd, 0.6, 'the cap is checked before each call, so one call may cross it');
      assert.match(prompts[0], /Fix it\.[\s\S]*\+merged[\s\S]*\+e-1/);
      const reports = path.join(cases, 'reports');
      const file = writeJudgeFile(reports, verdicts);
      assert.throws(() => writeJudgeFile(reports, verdicts), /never replaced/);
      const scored = score(results, { cases, tracesDir, judgeFile: file }).runs;
      assert.deepEqual(scored.map((r) => [r.judgeScore, r.judgeCostUsd, r.costUsd]), [[0.5, 0.3, 1], [0.5, 0.3, 1], [undefined, undefined, 1], [undefined, undefined, 1]]);
      assert.equal(JSON.parse(readFileSync(file, 'utf8')).model, 'm');
    });
  });
});
