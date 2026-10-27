import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { archiveOf, contextOf, deliveryLine, deliveryOf, finalMessageOf, harvest, mapStepsOf, reviewRunsOf, sandboxOf } from './context.mjs';

const call = (id, input, created, read, parent = null, content = undefined) =>
  JSON.stringify({ type: 'assistant', parent_tool_use_id: parent, message: { id, content, usage: { input_tokens: input, cache_creation_input_tokens: created, cache_read_input_tokens: read, output_tokens: 9 } } });
const TRACE = [
  JSON.stringify({ type: 'system', subtype: 'init' }),
  call('m1', 5, 19000, 0, null, [{ type: 'tool_use', id: 'tu1' }, { type: 'tool_use', id: 'tu2' }]),
  call('m1', 5, 19000, 0, null, [{ type: 'tool_use', id: 'tu1' }, { type: 'tool_use', id: 'tu2' }]), // the same call streamed twice
  call('s1', 3, 40000, 0, 'toolu_1', [{ type: 'tool_use', id: 'sub1' }]), // a subagent call: not the main session's context
  call('m2', 2, 500, 21000, null, [{ type: 'text', text: 'x' }, { type: 'tool_use', id: 'tu3' }]),
  call('m3', 1, 100, 20000),
  'not json',
  JSON.stringify({ type: 'result', usage: {} }),
].join('\n');

describe('evals context size', () => {
  it('peak and final are the main session context per call (input + cache), each call counted once, subagents left out', () => {
    assert.deepEqual(contextOf(TRACE), { peak: 21502, final: 20101, calls: 3, tools: 3, session: null, api: null, costUsd: null });
  });

  it('session and model time come from the result event; a trace without them reports null, not zero', () => {
    const timed = `${TRACE}\n${JSON.stringify({ type: 'result', duration_ms: 16311, duration_api_ms: 6575, total_cost_usd: 0.1234 })}`;
    assert.deepEqual(contextOf(timed), { peak: 21502, final: 20101, calls: 3, tools: 3, session: 16.3, api: 6.6, costUsd: 0.1234 });
  });

  it('a trace with no main-session call has no context, not a zero one', () => {
    assert.equal(contextOf(call('s1', 1, 1, 1, 'toolu_1')), null);
  });

  it('only a harness sandbox (<tmp>/e-XXXX/out/trace.jsonl) is ever named for deletion', () => {
    assert.equal(sandboxOf('/private/tmp/e-Ab12/out/trace.jsonl'), '/private/tmp/e-Ab12');
    assert.equal(sandboxOf('/private/tmp/work/out/trace.jsonl'), null);
    assert.equal(sandboxOf('/private/tmp/e-Ab12/trace.jsonl'), null);
  });

  it('harvest adds context, keeps a copy of the trace, deletes the sealed sandbox, and skips a run whose trace is gone', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'evals-harvest-'));
    const sandbox = path.join(tmp, 'e-Kept1');
    mkdirSync(path.join(sandbox, 'out'), { recursive: true });
    mkdirSync(path.join(sandbox, 'sealed', 'home', 'cwd', 'repo', '.ambicode', 'tasks', 't'), { recursive: true });
    writeFileSync(path.join(sandbox, 'sealed', 'home', 'cwd', 'repo', '.ambicode', 'tasks', 't', 'ledger.jsonl'), '{}\n');
    mkdirSync(path.join(sandbox, 'sealed', 'home', 'cwd', 'repo', '.ambicode', 'context'), { recursive: true });
    writeFileSync(path.join(sandbox, 'sealed', 'home', 'cwd', 'repo', '.ambicode', 'context', 'index.md'), 'x');
    mkdirSync(path.join(sandbox, 'sealed', 'home', 'cwd', 'repo', '.ambicode', 'context', 'modules', 'm'), { recursive: true });
    writeFileSync(path.join(sandbox, 'sealed', 'home', 'cwd', 'repo', '.ambicode', 'context', 'modules', 'm', 'a.md'), 'y');
    chmodSync(path.join(sandbox, 'sealed'), 0o000);
    writeFileSync(path.join(sandbox, 'out', 'trace.jsonl'), TRACE);
    const result = { cases: [{ name: 'task-fix', arms: { with: [{ tracePath: path.join(sandbox, 'out', 'trace.jsonl') }, { tracePath: path.join(tmp, 'e-Gone2', 'out', 'trace.jsonl') }] } }] };
    const traces = path.join(tmp, 'traces');
    const archive = path.join(tmp, 'archive');
    harvest(result, traces, { archiveDir: archive });
    const [kept, gone] = result.cases[0].arms.with;
    assert.equal(kept.context.peak, 21502);
    assert.equal(gone.context, undefined);
    assert.equal(readFileSync(path.join(traces, 'task-fix-1.jsonl'), 'utf8'), TRACE);
    assert.equal(readFileSync(path.join(archive, 'task-fix-1.ambicode', 'repo', '.ambicode', 'tasks', 't', 'ledger.jsonl'), 'utf8'), '{}\n', 'the route record is kept beside the trace');
    assert.equal(readFileSync(path.join(archive, 'task-fix-1.ambicode', 'repo', '.ambicode', 'context', 'index.md'), 'utf8'), 'x', 'the workspace context is kept');
    assert.equal(readFileSync(path.join(archive, 'task-fix-1.ambicode', 'repo', '.ambicode', 'context', 'modules', 'm', 'a.md'), 'utf8'), 'y', 'including modules/**');
    assert.equal(existsSync(path.join(traces, 'task-fix-1.ambicode')), false, 'no workspace copy beside the trace');
    assert.equal(existsSync(sandbox), false);
  });

  it('a review run leaves a record: final message, trace, and the plugin arm report, answer and brief', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'evals-review-record-'));
    const trace = `${TRACE}\n${JSON.stringify({ type: 'result', result: 'the final words' })}`;
    const make = (name, withReview) => {
      const sandbox = path.join(tmp, name);
      mkdirSync(path.join(sandbox, 'out'), { recursive: true });
      writeFileSync(path.join(sandbox, 'out', 'trace.jsonl'), trace);
      const run = path.join(sandbox, 'sealed', 'home', 'cwd', 'repo', '.ambicode', 'reviews', 'rev-1', '1');
      mkdirSync(run, { recursive: true });
      if (withReview) for (const file of ['report.txt', 'answer.json', 'brief.md', 'findings.json']) writeFileSync(path.join(run, file), `${file} body`);
      return path.join(sandbox, 'out', 'trace.jsonl');
    };
    const result = { cases: [{ name: 'review-x', arms: { with: [{ tracePath: make('e-Rev1', true) }, { tracePath: make('e-Rev2', false) }] } }, { name: 'task-fix', arms: { with: [{ tracePath: make('e-Rev3', true) }] } }] };
    const records = path.join(tmp, 'archive', 'review-runs', 'plugin', 'S1');
    harvest(result, path.join(tmp, 'traces'), { archiveDir: path.join(tmp, 'archive', 'x'), reviewRunsDir: records });
    const one = path.join(records, 'review-x-1');
    assert.equal(readFileSync(path.join(one, 'final-message.md'), 'utf8'), 'the final words');
    assert.equal(readFileSync(path.join(one, 'report.txt'), 'utf8'), 'report.txt body');
    assert.equal(readFileSync(path.join(one, 'brief.md'), 'utf8'), 'brief.md body');
    assert.equal(existsSync(path.join(one, 'findings.json')), false);
    assert.equal(readFileSync(path.join(one, 'trace.jsonl'), 'utf8'), trace);
    assert.deepEqual(JSON.parse(readFileSync(path.join(one, 'meta.json'), 'utf8')), { case: 'review-x', run: 1, arm: 'plugin', stamp: 'S1', finalMessage: true });
    assert.equal(existsSync(path.join(records, 'review-x-2', 'final-message.md')), true);
    assert.equal(existsSync(path.join(records, 'review-x-2', 'report.txt')), false, 'a run without a review keeps no report');
    assert.equal(existsSync(path.join(records, 'task-fix-1')), false, 'only review cases are recorded');
    assert.equal(finalMessageOf(TRACE), null);
    assert.equal(reviewRunsOf('bare', 'S', { AMBICODE_EVAL_ARCHIVE: '/a' }, '/r/repo'), path.resolve('/a/review-runs/bare/S'));
  });

  it('archiveOf mirrors the path relative to the repo under the archive root, overridable by AMBICODE_EVAL_ARCHIVE', () => {
    assert.equal(archiveOf('/r/repo/evals/x', {}, '/r/repo'), path.resolve('/r/eval-archive/evals/x'));
    assert.equal(archiveOf('/r/repo/evals/x', { AMBICODE_EVAL_ARCHIVE: '/a' }, '/r/repo'), path.resolve('/a/evals/x'));
  });
});

describe('delivery of the read step', () => {
  const hook = (body) => `${JSON.stringify({ type: 'attachment', attachment: { type: 'hook_additional_context', content: [body] } })}\n`;
  const STEP = '[ambicode] investigate \u00b7 task t \u00b7 step read (4/5)\nNow: read\n## map\n{"candidates":[]}';

  it('reports map, candidates and length from the read step text; a spill reference is reported as spilled', () => {
    const inline = deliveryOf([hook('# contract') + hook(STEP)]);
    assert.deepEqual(inline, { status: 'delivered', chars: STEP.length, map: true, candidates: true, spill: false });
    assert.equal(deliveryLine(inline), `delivery=delivered chars=${STEP.length} map=true candidates=true spill=false`);
    const spilled = deliveryOf([hook('Output saved to /x/tool-results/hook-ab-additionalContext.txt\nPreview: [ambicode] investigate \u00b7 step read')]);
    assert.equal(spilled.status, 'spilled');
    assert.equal(spilled.spill, true);
    assert.equal(deliveryOf([hook('[ambicode] investigate \u00b7 step read\nno map here')]).map, false);
  });

  it('finds the map at the step the route definition delivers it in: plan reads it at draft, a re-delivery without the map does not hide it', () => {
    assert.ok(mapStepsOf().has('investigate/read') && mapStepsOf().has('plan/draft'));
    assert.ok(!mapStepsOf().has('task/change'), 'a step with a work file carries no map in the hook text');
    const draft = '[ambicode] plan \u00b7 task t \u00b7 step draft (3/6)\nNow: draft\n## map\n{"candidates":[1]}';
    assert.deepEqual(deliveryOf([hook('# contract') + hook(draft)]), { status: 'delivered', chars: draft.length, map: true, candidates: true, spill: false });
    assert.equal(deliveryOf([hook('[ambicode] plan \u00b7 task t \u00b7 step plan-check\n## map')]).status, 'absent');
  });

  it('a route with its map at a step of its own is found from the definition alone', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'evals-routes-'));
    try {
      mkdirSync(path.join(dir, 'probe'));
      writeFileSync(path.join(dir, 'probe', 'probe.yaml'), 'skill: probe\nsteps:\n  - { id: look, actor: model, instruction: x, payload: [envelope, map] }\n  - { id: other, actor: model, instruction: y, work: z, payload: [map] }\n');
      assert.deepEqual([...mapStepsOf(dir)], ['probe/look']);
      assert.equal(deliveryOf([hook('[ambicode] probe \u00b7 task t \u00b7 step look\n## map')], mapStepsOf(dir)).map, true);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('no transcript is unknown, never false; a transcript with no read step is absent', () => {
    assert.deepEqual(deliveryOf(null), { status: 'unknown', chars: null, map: null, candidates: null, spill: null });
    assert.deepEqual(deliveryOf([]), deliveryOf(null));
    assert.equal(deliveryLine(deliveryOf(null)), 'delivery=unknown');
    assert.equal(deliveryOf(['{"type":"user"}\n']).status, 'absent');
  });

  it('harvest keeps the sandbox transcripts and hook spill files beside the trace and records delivery per run', () => {
    const tmp = mkdtempSync(path.join(tmpdir(), 'evals-delivery-'));
    const make = (name, transcript, spill) => {
      const sandbox = path.join(tmp, name);
      mkdirSync(path.join(sandbox, 'out'), { recursive: true });
      writeFileSync(path.join(sandbox, 'out', 'trace.jsonl'), TRACE);
      if (transcript !== null) {
        const project = path.join(sandbox, 'config', 'projects', '-p');
        mkdirSync(path.join(project, 'sess', 'tool-results'), { recursive: true });
        writeFileSync(path.join(project, 'sess.jsonl'), transcript);
        if (spill) writeFileSync(path.join(project, 'sess', 'tool-results', 'hook-1-additionalContext.txt'), 'full text');
      }
      return path.join(sandbox, 'out', 'trace.jsonl');
    };
    const result = { cases: [{ name: 'c', arms: { with: [
      { tracePath: make('e-D1', hook(STEP), false) },
      { tracePath: make('e-D2', hook('see tool-results/hook-1-additionalContext.txt'), true) },
      { tracePath: make('e-D3', null, false) },
    ] } }] };
    const traces = path.join(tmp, 'traces');
    const archive = path.join(tmp, 'archive');
    harvest(result, traces, { archiveDir: archive });
    const [inline, spilled, none] = result.cases[0].arms.with;
    assert.deepEqual([inline.delivery.status, inline.delivery.map], ['delivered', true]);
    assert.equal(spilled.delivery.status, 'spilled');
    assert.equal(readFileSync(path.join(archive, 'c-2.transcript', 'tool-results', 'hook-1-additionalContext.txt'), 'utf8'), 'full text');
    assert.equal(existsSync(path.join(archive, 'c-1.transcript', 'sess.jsonl')), true);
    assert.deepEqual([none.delivery.status, none.delivery.map, none.transcript], ['unknown', null, undefined]);
  });
});
