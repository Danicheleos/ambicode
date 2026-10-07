import assert from 'node:assert/strict';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { commandShape, turnSummary } from './transcript.ts';

const assistant = (id: string, usage: object, ...blocks: object[]) => JSON.stringify({ type: 'assistant', message: { id, role: 'assistant', content: blocks, usage } });
const tool = (name: string, command?: string) => ({ type: 'tool_use', id: `t-${name}`, name, input: command === undefined ? {} : { command } });
const prompt = (text: string) => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] } });
const toolResult = JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't-Bash', content: 'ok' }] } });

test('commands are classified by shape', () => {
  const shapes = ['npm test', 'pnpm run build', 'cargo test', 'node scripts/x.mjs --a', 'node -e 1', 'git status', 'FOO=1 node scripts/ambicode.mjs route next', 'cd app && ls', 'ls -la'].map(commandShape);
  assert.deepEqual(shapes, ['package-script', 'package-script', 'package-script', 'node-script', 'other', 'git', 'ambicode', 'other', 'other']);
});

test('the turn since the latest prompt: tools, commands, and per-message context', async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), 'turn-')), 't.jsonl');
  await writeFile(file, [
    prompt('old'),
    assistant('m0', { input_tokens: 999, cache_read_input_tokens: 999 }, tool('Read')),
    prompt('do it'),
    assistant('m1', { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 5, output_tokens: 7 }, tool('Bash', 'npm test'), tool('Read')),
    assistant('m1', { input_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 5, output_tokens: 7 }, tool('Bash', 'curl -H "Authorization: Bearer abc" x')),
    toolResult,
    assistant('m2', { input_tokens: 20, cache_read_input_tokens: 200, cache_creation_input_tokens: 0, output_tokens: 3 }, tool('Bash', 'git diff')),
    'not json',
  ].join('\n'));
  const turn = await turnSummary(file);
  assert.deepEqual(turn?.tools, { Bash: 3, Read: 1 });
  assert.deepEqual(turn?.commands.map((command) => command.kind), ['package-script', 'other', 'git']);
  assert.match(turn?.commands[1]?.text ?? '', /\[redacted\]/);
  assert.deepEqual(turn?.context, { input: 30, cacheRead: 300, cacheCreate: 5, output: 10, peak: 220 });
});

test('a second summary starts after the last message the first one counted', async () => {
  const file = path.join(await mkdtemp(path.join(tmpdir(), 'turn-')), 't.jsonl');
  await writeFile(file, [prompt('do it'), assistant('m1', { input_tokens: 10 }, tool('Read')), assistant('m2', { input_tokens: 20 }, tool('Bash', 'git diff'))].join('\n'));
  const first = await turnSummary(file);
  assert.equal(first?.lastMessage, 'm2');
  assert.equal(await turnSummary(file, 'm2'), null, 'nothing new since the last Stop');
  assert.deepEqual((await turnSummary(file, 'm1'))?.tools, { Bash: 1 });
});

test('an unreadable or empty transcript gives null', async () => {
  assert.equal(await turnSummary('/nonexistent/t.jsonl'), null);
  const file = path.join(await mkdtemp(path.join(tmpdir(), 'turn-')), 't.jsonl');
  await writeFile(file, prompt('hi'));
  assert.equal(await turnSummary(file), null);
});
