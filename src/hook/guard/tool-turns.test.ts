import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { TRANSCRIPT_TAIL_BYTES } from '../events/stop-check.ts';
import { fsGuardState, sessionStateDir, TRANSCRIPT_TAIL } from './guard-state.ts';
import { hookStateBaseDir } from '../session/markers.ts';
import { nodeFileSystem } from '#platform/ports/filesystem';
import { toolTurns, toolTurnsNotice, toolTurnsText } from './tool-turns.ts';
import { ACTIVE_ROUTE_FILE, GUARD_STATE_DIR_NAME, type GuardState } from '../types/guard.ts';

const prompt = (text = 'q') => ({ type: 'user', message: { content: text } });
const call = (message: string, ...ids: string[]) => ({ type: 'assistant', message: { id: message, content: ids.map((id) => ({ type: 'tool_use', id })) } });
const result = (id: string) => ({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: id }] } });
const lines = (events: object[]): string => events.map((event) => JSON.stringify(event)).join('\n');
/** `count` single-call turns, each followed by its result. */
const turns = (count: number, from = 1): object[] => Array.from({ length: count }, (_, index) => [call(`m${index + from}`, `t${index + from}`), result(`t${index + from}`)]).flat();

const state = (transcript: string, budget: number | undefined): GuardState =>
  ({ activeRoute: () => ({ task: 'T', skill: 'investigate', ...(budget === undefined ? {} : { toolTurns: budget }) }), transcriptTail: () => transcript }) as unknown as GuardState;
const notice = (transcript: string, toolUseId: string, extra: Record<string, unknown> = {}, budget: number | null = 12) =>
  toolTurnsNotice({ hook_event_name: 'PostToolUse', scratchpad_dir: '/s', transcript_path: '/t.jsonl', tool_use_id: toolUseId, ...extra }, state(transcript, budget ?? undefined));

describe('03b-B2 tool-turn notice', () => {
  it('counts tool turns since the last prompt; parallel calls and split message lines count once; sidechains are skipped', () => {
    const transcript = lines([prompt('old'), ...turns(3), prompt(), call('a', 'x1', 'x2'), call('a', 'x3'), result('x1'), { ...call('side', 's1'), isSidechain: true }, { type: 'user', isMeta: true, message: { content: 'meta' } }, call('b', 'y1')]);
    assert.deepEqual(toolTurns(transcript), [['x1', 'x2', 'x3'], ['y1']]);
  });

  it('11 turns give nothing, the 12th turn gives the notice once, and its parallel calls and later turns stay silent', () => {
    assert.deepEqual(notice(lines([prompt(), ...turns(11)]), 't11'), {});
    const twelve = lines([prompt(), ...turns(11), call('m12', 'a', 'b'), result('a'), result('b')]);
    assert.deepEqual(notice(twelve, 'a'), { hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: toolTurnsText(12) } });
    assert.deepEqual(notice(twelve, 'b'), {});
    assert.deepEqual(notice(lines([prompt(), ...turns(14)]), 't14'), {});
  });

  it('a call of the 12th turn not yet in the transcript gives the notice; one of the 13th does not', () => {
    const eleven = lines([prompt(), ...turns(11)]);
    assert.match(JSON.stringify(notice(eleven, 'unwritten')), /12 tool turns/);
    assert.deepEqual(notice(lines([prompt(), ...turns(12)]), 'unwritten'), {});
  });

  it('a subagent, another event, or a route without a budget gives nothing', () => {
    const twelve = lines([prompt(), ...turns(12)]);
    assert.deepEqual(notice(twelve, 't12', { agent_id: 'sub' }), {});
    assert.deepEqual(notice(twelve, 't12', { hook_event_name: 'PreToolUse' }), {});
    assert.deepEqual(notice(twelve, 't12', {}, null), {});
  });

  it('without scratchpad_dir (PostToolUse carries none) reads the session pointer where route start writes it', () => {
    const session = `tool-turns-${process.pid}-${Date.now()}`;
    const dir = sessionStateDir(session);
    assert.equal(dir, hookStateBaseDir(nodeFileSystem, session));
    mkdirSync(dir, { recursive: true });
    after(() => rmSync(dir, { recursive: true, force: true }));
    writeFileSync(path.join(dir, ACTIVE_ROUTE_FILE), JSON.stringify({ task: 'T', skill: 'investigate', toolTurns: 1 }));
    const transcript = path.join(dir, 't.jsonl');
    writeFileSync(transcript, `${lines([prompt(), ...turns(1)])}\n`);
    const out = toolTurnsNotice({ hook_event_name: 'PostToolUse', session_id: session, transcript_path: transcript, tool_use_id: 't1' }, fsGuardState);
    assert.match(JSON.stringify(out), /1 tool turns in this answer/);
  });

  it('reads the budget from the pointer and the transcript tail from disk; the tail equals the Stop check one', () => {
    assert.equal(TRANSCRIPT_TAIL, TRANSCRIPT_TAIL_BYTES);
    const dir = mkdtempSync(path.join(tmpdir(), 'tool-turns-'));
    after(() => rmSync(dir, { recursive: true, force: true }));
    mkdirSync(path.join(dir, GUARD_STATE_DIR_NAME), { recursive: true });
    writeFileSync(path.join(dir, GUARD_STATE_DIR_NAME, ACTIVE_ROUTE_FILE), JSON.stringify({ task: 'T', skill: 'investigate', owner: 'o', toolTurns: 2 }));
    const transcript = path.join(dir, 't.jsonl');
    writeFileSync(transcript, `${lines([prompt(), ...turns(2)])}\n`);
    const out = toolTurnsNotice({ hook_event_name: 'PostToolUse', scratchpad_dir: dir, transcript_path: transcript, tool_use_id: 't2' }, fsGuardState);
    assert.match(JSON.stringify(out), /2 tool turns in this answer/);
  });
});
