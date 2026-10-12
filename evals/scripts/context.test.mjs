import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { contextOf, harvest, sandboxOf } from './context.mjs';

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
    assert.deepEqual(contextOf(TRACE), { peak: 21502, final: 20101, calls: 3, tools: 3 });
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
    chmodSync(path.join(sandbox, 'sealed'), 0o000);
    writeFileSync(path.join(sandbox, 'out', 'trace.jsonl'), TRACE);
    const result = { cases: [{ name: 'task-fix', arms: { with: [{ tracePath: path.join(sandbox, 'out', 'trace.jsonl') }, { tracePath: path.join(tmp, 'e-Gone2', 'out', 'trace.jsonl') }] } }] };
    const traces = path.join(tmp, 'traces');
    harvest(result, traces);
    const [kept, gone] = result.cases[0].arms.with;
    assert.equal(kept.context.peak, 21502);
    assert.equal(gone.context, undefined);
    assert.equal(readFileSync(path.join(traces, 'task-fix-1.jsonl'), 'utf8'), TRACE);
    assert.equal(readFileSync(path.join(traces, 'task-fix-1.ambicode', 'repo', '.ambicode', 'tasks', 't', 'ledger.jsonl'), 'utf8'), '{}\n', 'the route record is kept beside the trace');
    assert.equal(existsSync(sandbox), false);
  });
});

describe('evals chain', async () => {
  const { chainOf, longestRun } = await import('./chain.mjs');
  const at = (seconds) => new Date(Date.UTC(2026, 9, 12, 0, 0, seconds)).toISOString();
  const event = (type, seconds, content, extra = {}) => JSON.stringify({ type, timestamp: at(seconds), parent_tool_use_id: null, message: { id: extra.id, usage: { input_tokens: 1, cache_read_input_tokens: 9999 }, content }, ...extra });
  const TRACE = [
    JSON.stringify({ type: 'system', subtype: 'hook_response', hook_event: 'UserPromptSubmit', output: 'step red' }),
    event('assistant', 0, [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'node ambicode.mjs check --phase red' } }], { id: 'm1' }),
    event('user', 2, [{ type: 'tool_result', tool_use_id: 't1', content: 'exit 1', is_error: true }]),
    event('assistant', 40, [{ type: 'thinking', thinking: '' }], { id: 'm2' }), // the call's first event prints nothing
    event('assistant', 40, [{ type: 'text', text: 'Fixed.' }], { id: 'm2' }),
    JSON.stringify({ type: 'result', subtype: 'success', stop_reason: 'end_turn', num_turns: 2, duration_ms: 41000, permission_denials: [{}] }),
  ].join('\n');

  it('numbers main-session calls, shows context, tool time, errors, hooks, the end, and flags a slow gap', () => {
    const { turns, lines } = chainOf(TRACE);
    assert.equal(turns, 2);
    assert.match(lines[0], /hook UserPromptSubmit: step red/);
    assert.match(lines[1], /^ #1 {3}\+0s ctx 10\.0k Bash: node ambicode\.mjs check --phase red$/);
    assert.match(lines[2], /→ ERROR 2\.0s exit 1/);
    assert.match(lines[3], /#2 {2}\+40s ⏱ 38s gap ctx 10\.0k says: Fixed\./);
    assert.match(lines[4], /end: success, stop end_turn, 2 turns, 41s, 1 permission denial/);
  });

  it('the longest run is the one with most turns, then the longest, among runs with a kept trace', () => {
    const result = { cases: [
      { name: 'a', arms: { with: [{ turns: 9, durationSeconds: 10, trace: 'a' }, { turns: 12, durationSeconds: 5 }] } },
      { name: 'b', arms: { with: [{ turns: 9, durationSeconds: 30, trace: 'b' }] } },
    ] };
    assert.equal(longestRun(result).name, 'b');
    assert.equal(longestRun({ cases: [] }), null);
  });
});
