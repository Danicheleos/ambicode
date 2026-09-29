import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const GUARD = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'guard.mjs');
const root = mkdtempSync(path.join(os.tmpdir(), 'gym-guard-'));
const repo = path.join(root, 'repo');
const campaign = path.join(repo, 'gym', 'runs', 'c1');
mkdirSync(campaign, { recursive: true });
after(() => rmSync(root, { recursive: true, force: true }));

const env = { ...process.env, GYM_REPO_ROOT: repo, GYM_CAMPAIGN_DIR: campaign, GYM_SOFT_TOKENS: '300000', GYM_HARD_TOKENS: '500000', GYM_MAX_DENIALS: '3' };
function hook(input, extraEnv = {}) {
  const r = spawnSync(process.execPath, [GUARD], { input: JSON.stringify(input), env: { ...env, ...extraEnv }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout || '{}');
}
const state = (name) => path.join(campaign, 'supervisor', name);
const transcript = (tokens) => {
  const file = path.join(root, `t-${tokens}.jsonl`);
  writeFileSync(file, JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 0, cache_read_input_tokens: tokens, cache_creation_input_tokens: 0 } } }) + '\n');
  return file;
};

describe('guard hook process', () => {
  it('fails closed when the campaign environment is missing', () => {
    const out = hook({ hook_event_name: 'PreToolUse', tool_name: 'Bash', tool_input: { command: 'ls' } }, { GYM_REPO_ROOT: '', GYM_CAMPAIGN_DIR: '' });
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
  });

  it('records the session on start and re-primes after a compaction', () => {
    const start = hook({ hook_event_name: 'SessionStart', source: 'startup', session_id: 's1', transcript_path: '/x.jsonl' });
    assert.match(start.hookSpecificOutput.additionalContext, /soft 300000/);
    assert.equal(JSON.parse(readFileSync(state('session.json'), 'utf8')).sessionId, 's1');
    const compact = hook({ hook_event_name: 'SessionStart', source: 'compact', session_id: 's1' });
    assert.match(compact.hookSpecificOutput.additionalContext, /summary above is not evidence/);
    assert.ok(existsSync(state('compactions.jsonl')));
  });

  it('allows a benign call and denies a forbidden one with a counted reason', () => {
    assert.deepEqual(hook({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'npm run verify' } }), {});
    const out = hook({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'git push origin x' } });
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.match(out.hookSpecificOutput.permissionDecisionReason, /Denial 1 of 3/);
    assert.equal(existsSync(state('KILL')), false);
  });

  it('kills the session on a dangerous call: continue false plus a KILL marker for the supervisor', () => {
    const out = hook({ hook_event_name: 'PreToolUse', session_id: 's1', tool_name: 'Bash', tool_input: { command: 'cat ~/.ssh/id_rsa' } });
    assert.equal(out.continue, false);
    assert.equal(out.hookSpecificOutput.permissionDecision, 'deny');
    assert.equal(JSON.parse(readFileSync(state('KILL'), 'utf8')).rule, 'secret-path');
    rmSync(state('KILL'));
  });

  it('escalates repeated denials in one session to a kill', () => {
    for (let i = 0; i < 2; i += 1) hook({ hook_event_name: 'PreToolUse', session_id: 's2', tool_name: 'WebFetch', tool_input: { url: 'https://x' } });
    const third = hook({ hook_event_name: 'PreToolUse', session_id: 's2', tool_name: 'WebFetch', tool_input: { url: 'https://x' } });
    assert.equal(third.continue, false);
    assert.equal(JSON.parse(readFileSync(state('KILL'), 'utf8')).rule, 'repeated-denials');
    rmSync(state('KILL'));
  });

  it('redacts a credential found in tool output and kills', () => {
    const out = hook({ hook_event_name: 'PostToolUse', session_id: 's3', tool_name: 'Bash', tool_input: { command: 'x' }, tool_response: 'key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123' });
    assert.equal(out.continue, false);
    assert.match(out.hookSpecificOutput.updatedToolOutput, /redacted/);
    rmSync(state('KILL'));
  });

  it('measures context after each tool call, advises at the soft limit, and refuses heavy starts past the hard limit', () => {
    const soft = hook({ hook_event_name: 'PostToolUse', session_id: 's4', tool_name: 'Bash', tool_input: {}, tool_response: '', transcript_path: transcript(310_000) });
    assert.match(soft.hookSpecificOutput.additionalContext, /soft limit/);
    const quiet = hook({ hook_event_name: 'PostToolUse', session_id: 's4', tool_name: 'Bash', tool_input: {}, tool_response: '', transcript_path: transcript(312_000) });
    assert.deepEqual(quiet, {});
    assert.deepEqual(hook({ hook_event_name: 'PreToolUse', session_id: 's4', tool_name: 'Agent', tool_input: { prompt: 'w' } }), {});
    hook({ hook_event_name: 'PostToolUse', session_id: 's4', tool_name: 'Bash', tool_input: {}, tool_response: '', transcript_path: transcript(505_000) });
    const heavy = hook({ hook_event_name: 'PreToolUse', session_id: 's4', tool_name: 'Bash', tool_input: { command: 'npm run evals:record' } });
    assert.match(heavy.hookSpecificOutput.permissionDecisionReason, /context-hard-limit/);
    assert.deepEqual(hook({ hook_event_name: 'PreToolUse', session_id: 's4', tool_name: 'Bash', tool_input: { command: 'git commit -m record' } }), {});
  });

  it('blocks a stop mid-iteration and allows it at a safe point', () => {
    writeFileSync(path.join(campaign, 'PHASE'), 'it-003 measure\n');
    assert.equal(hook({ hook_event_name: 'Stop', session_id: 's4', stop_hook_active: false }).decision, 'block');
    writeFileSync(path.join(campaign, 'PHASE'), 'it-003 handoff\n');
    assert.deepEqual(hook({ hook_event_name: 'Stop', session_id: 's4', stop_hook_active: false }), {});
  });
});
