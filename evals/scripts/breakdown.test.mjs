import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { breakdownOf, ledgerOf, meanOf, priceOf, verbOf } from './breakdown.mjs';

const call = (id, usage, content, parent = null) => JSON.stringify({ type: 'assistant', parent_tool_use_id: parent, message: { id, content, usage: { input_tokens: 0, cache_creation_input_tokens: 0, cache_read_input_tokens: 0, output_tokens: 1, ...usage } } });
const use = (id, name, input = {}) => ({ type: 'tool_use', id, name, input });
const result = (id, content, parent = null) => JSON.stringify({ type: 'user', parent_tool_use_id: parent, message: { content: [{ type: 'tool_result', tool_use_id: id, content }] } });
const NEXT = 'node "/p/scripts/ambicode.mjs" route next --task t';
const MESSAGE = 'ok\n\n[ambicode] task · task t · step review-cmd (7/13)\nNow: do it';

const TRACE = [
  JSON.stringify({ type: 'system', subtype: 'hook_response', hook_event: 'SessionStart', output: 'x'.repeat(100) }),
  call('m1', { input_tokens: 3, cache_creation_input_tokens: 1000 }, [use('t1', 'Read')]),
  call('m1', { input_tokens: 3, cache_creation_input_tokens: 1000 }, [use('t1', 'Read')]), // streamed twice
  result('t1', 'file'),
  call('m2', { input_tokens: 1, cache_read_input_tokens: 1000 }, [use('t2', 'Bash', { command: NEXT }), use('t3', 'Bash', { command: 'node "/p/scripts/ambicode.mjs" check --task t' })]),
  result('t2', MESSAGE),
  call('m3', { cache_read_input_tokens: 1200, output_tokens: 50 }, [use('t4', 'Agent')]),
  call('s1', { cache_read_input_tokens: 500 }, [use('u1', 'Read')], 't4'), // a subagent call
  JSON.stringify({ type: 'system', subtype: 'task_notification', usage: { total_tokens: 700 } }),
  call('m4', { cache_read_input_tokens: 1300 }, [use('t5', 'Bash', { command: 'ls' })]),
  JSON.stringify({ type: 'user', parent_tool_use_id: null, message: { content: [{ type: 'text', text: 'Stop hook feedback:\nfix it' }] } }),
  call('m5', { cache_read_input_tokens: 1400 }, [{ type: 'text', text: 'done' }]),
  JSON.stringify({ type: 'result', duration_ms: 12500, total_cost_usd: 0.01, usage: { input_tokens: 4, output_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 4900 }, subagent_stats: { spawned: 1 } }),
].join('\n');
const LEDGER = [
  { kind: 'route', skill: 'task' },
  { kind: 'step', step: 'change', status: 'delivered', channel: 'hook', bytes: 5000 },
  { kind: 'step', step: 'review-cmd', status: 'delivered', channel: 'cli', bytes: 900 },
  { kind: 'step', step: 'fix', status: 'skipped' },
].map((entry) => JSON.stringify(entry)).join('\n');

describe('evals breakdown', () => {
  const row = breakdownOf(TRACE, { ledgerText: LEDGER, skillBytes: 2000 });

  it('counts each main-session call once and keeps subagent calls apart', () => {
    assert.equal(row.modelCalls, 5);
    assert.equal(row.toolCalls, 5);
    assert.equal(row.inputTokens, 1003 + 1001 + 1200 + 1300 + 1400);
    assert.equal(row.outputTokens, 100);
    assert.equal(row.seconds, 12.5);
    assert.deepEqual(row.subagent, { calls: 1, inputTokens: 500, outputTokens: 1, reportedTotalTokens: 700, spawned: 1 });
  });

  it('splits plumbing from work: a check runs the project tests, so it is work; Agent is a delegation', () => {
    assert.equal(row.plumbingCalls, 1);
    assert.equal(row.workCalls, 3);
    assert.equal(row.delegateCalls, 1);
    assert.deepEqual(row.verbs, { 'route next': 1 });
  });

  it('attributes each call to the step the last tool result announced, the first one to the hook-delivered step', () => {
    assert.deepEqual(row.steps, { change: 2, 'review-cmd': 2, 'stop-feedback': 1 });
  });

  it('measures the injected blocks', () => {
    assert.equal(row.injected.sessionStartBytes, 100);
    assert.equal(row.injected.skillBytes, 2000);
    assert.deepEqual(row.injected.stepMessages, [{ step: 'review-cmd', bytes: Buffer.byteLength('[ambicode] task · task t · step review-cmd (7/13)\nNow: do it') }]);
    assert.deepEqual(row.injected.stopBlocks, [Buffer.byteLength('Stop hook feedback:\nfix it')]);
    assert.equal(row.injected.ledgerHookBytes, 5000);
    assert.equal(row.injected.ledgerCliBytes, 900);
  });

  it('charges the subagents what total_cost_usd holds beyond the main session usage', () => {
    const main = priceOf({ input_tokens: 4, output_tokens: 100, cache_creation_input_tokens: 1000, cache_read_input_tokens: 4900 });
    assert.ok(Math.abs(row.mainCostUsd - main) < 1e-12);
    assert.ok(Math.abs(row.subagentCostUsd - (0.01 - main)) < 1e-12);
  });

  it('splits time into model gaps (by step) and tool gaps (by tool or CLI verb) from the main-session timestamps', () => {
    const at = (seconds, event) => JSON.stringify({ ...JSON.parse(event), timestamp: new Date(Date.UTC(2026, 9, 12, 0, 0, seconds)).toISOString() });
    const timed = breakdownOf([
      at(0, call('m1', {}, [use('t1', 'Read')])),
      at(1, result('t1', 'file')),
      at(4, call('m2', {}, [use('t2', 'Bash', { command: NEXT })])),
      at(5, result('t2', MESSAGE)),
      at(7, call('m3', {}, [{ type: 'text', text: 'x' }])),
    ].join('\n'));
    assert.equal(timed.timing.toolSeconds, 2);
    assert.equal(timed.timing.modelSeconds, 5);
    assert.deepEqual(timed.timing.byTool, { Read: 1, 'ambicode route next': 1 });
    assert.deepEqual(timed.timing.byStep, { start: 3, 'review-cmd': 2 });
  });

  it('names the CLI verb of a command, and none for any other command', () => {
    assert.equal(verbOf(NEXT), 'route next');
    assert.equal(verbOf('node "/p/ambicode.mjs" review record --task t <<EOF'), 'review record');
    assert.equal(verbOf('node "/p/ambicode.mjs" format --task t'), 'format');
    assert.equal(verbOf('ls ambicode'), null);
    assert.equal(ledgerOf(LEDGER).skill, 'task');
  });

  it('a trace with no ledger and no result still reports calls, with a null cost rather than zero', () => {
    const bare = breakdownOf(call('m1', { cache_read_input_tokens: 10 }, [use('t1', 'Read')]));
    assert.equal(bare.costUsd, null);
    assert.equal(bare.subagentCostUsd, null);
    assert.deepEqual(bare.steps, { start: 1 });
  });

  it('averages runs field by field', () => {
    const mean = meanOf([row, { ...row, modelCalls: 7, steps: { change: 4 } }]);
    assert.equal(mean.modelCalls, 6);
    assert.equal(mean.steps.change, 3);
    assert.equal(mean.steps['review-cmd'], 1);
  });
});
