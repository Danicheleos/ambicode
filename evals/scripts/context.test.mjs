import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { archiveOf, contextOf, harvest, sandboxOf } from './context.mjs';

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

  it('archiveOf mirrors the path relative to the repo under the archive root, overridable by AMBICODE_EVAL_ARCHIVE', () => {
    assert.equal(archiveOf('/r/repo/evals/x', {}, '/r/repo'), path.resolve('/r/eval-archive/evals/x'));
    assert.equal(archiveOf('/r/repo/evals/x', { AMBICODE_EVAL_ARCHIVE: '/a' }, '/r/repo'), path.resolve('/a/evals/x'));
  });
});
