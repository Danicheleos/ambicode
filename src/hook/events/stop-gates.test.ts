import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { skillHandlers } from '#skills/handlers';
import { isRejection, rejectedGateMarker } from '#platform/claude/transcript';
import { routeFixture } from '#testing/fixtures/route-fixture';
import { EVAL_EXPORT_VARIABLE } from '#harness/engine/stop';
import { runHook } from './run-hook.ts';
import type { HookDeps } from '#types/hook';
import type { StartInput } from '#types/harness';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const REJECTION = "The user doesn't want to proceed with this tool use. The tool use was rejected (eg. if it was a file edit, the new_string was NOT written to the file). STOP what you are doing and wait for the user to tell you how to proceed.";

const asking = (id: string, question: string) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'AskUserQuestion', input: { questions: [{ question, options: [{ label: 'pause' }] }] } }] } });
const result = (id: string, content: unknown, isError: boolean) => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, is_error: isError, content }] } });
const lines = (...entries: object[]): string => `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`;

describe('rejected question predicate', () => {
  it('a tool_result error that starts with the rejection sentence is a rejection, however its content is shaped', () => {
    assert.equal(isRejection({ type: 'tool_result', is_error: true, content: REJECTION }), true);
    assert.equal(isRejection({ type: 'tool_result', is_error: true, content: [{ type: 'text', text: REJECTION }] }), true);
    assert.equal(isRejection({ type: 'tool_result', is_error: false, content: REJECTION }), false);
    assert.equal(isRejection({ type: 'tool_result', is_error: true, content: 'Exit code 1' }), false);
  });
});

describe('a dismissed gate question', () => {
  async function paused() {
    const step = { 'routes/investigate/fetch.md': await readFile('routes/investigate/fetch.md', 'utf8'), 'routes/investigate/read.md': await readFile('routes/investigate/read.md', 'utf8') };
    const fx = await routeFixture({ routes: { investigate: await readFile('routes/investigate/investigate.yaml', 'utf8') }, handlers: skillHandlers(), step });
    await fx.repo.write('src/cart.ts', 'export const a = 1;\n');
    await fx.repo.commitAll('cart');
    const start = (input: Partial<StartInput> = {}) => fx.engine.start({ skill: 'investigate', text: 'zzqqxx wwvvuu', requirements: [], task: 'cart', cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad, ...input });
    await start();
    const print = (await fx.kinds('cart', 'gate')).at(-1)!;
    const marker = `[ambicode gate ${String(print['gate'])} ${print.id}]`;
    const transcript = path.join(fx.scratchpad, 'transcript.jsonl');
    const deps: HookDeps = { pointer: fx.pointer, load: async () => ({ engine: fx.engine, routes: fx.routes, pointer: fx.pointer }) };
    const hook = (event: string) => runHook(fx.runtime, JSON.stringify({ hook_event_name: event, session_id: A, cwd: fx.repo.root, scratchpad_dir: fx.scratchpad, transcript_path: transcript, prompt: 'hello' }), deps);
    return { fx, start, marker, transcript, hook };
  }

  it('finds the marker of the rejected question and ignores an answered one', async () => {
    const t = await paused();
    try {
      await writeFile(t.transcript, lines(asking('t1', `${t.marker}\nPause?`), result('t1', 'User has answered', false)));
      assert.equal(await rejectedGateMarker(t.transcript), null);
      await appendFile(t.transcript, lines(asking('t2', `${t.marker}\nPause?`), result('t2', REJECTION, true)));
      assert.equal((await rejectedGateMarker(t.transcript))?.marker, t.marker);
    } finally {
      await t.fx.dispose();
    }
  });

  it('Stop writes exit dismissed once and typing the skill again reopens the route', async () => {
    const t = await paused();
    try {
      await writeFile(t.transcript, lines(asking('t2', `${t.marker}\nPause?`), result('t2', REJECTION, true)));
      assert.deepEqual(await t.hook('Stop'), {});
      const exits = await t.fx.kinds('cart', 'exit');
      assert.deepEqual(exits.map((entry) => [entry['reason'], entry['source']]), [['dismissed', 'stop']]);
      assert.equal(await t.fx.pointer.read(A, t.fx.scratchpad), null);
      assert.deepEqual(await t.hook('Stop'), {});
      assert.equal((await t.fx.kinds('cart', 'exit')).length, 1);
      const again = await t.start({ text: 'addToCart in src/cart.ts' });
      assert.equal(again.position, 'read');
      assert.equal((await t.fx.kinds('cart', 'revise')).at(-1)?.['via'], 'reopen');
    } finally {
      await t.fx.dispose();
    }
  });

  it('Stop records the turn from the transcript and its own timing', async () => {
    const t = await paused();
    try {
      const usage = { input_tokens: 4, cache_read_input_tokens: 40, cache_creation_input_tokens: 1, output_tokens: 2 };
      await writeFile(t.transcript, lines(
        { type: 'user', message: { role: 'user', content: 'go' } },
        { type: 'assistant', message: { id: 'm1', role: 'assistant', usage, content: [{ type: 'tool_use', id: 'b1', name: 'Bash', input: { command: 'git status' } }] } },
      ));
      await t.hook('Stop');
      const [turn] = await t.fx.kinds('cart', 'turn');
      assert.deepEqual([turn?.['tools'], turn?.['commands'], turn?.['context']], [{ Bash: 1 }, [{ text: 'git status', kind: 'git' }], { input: 4, cacheRead: 40, cacheCreate: 1, output: 2, peak: 45 }]);
      assert.deepEqual((await t.fx.kinds('cart', 'hook')).map((entry) => entry['name']), ['stop']);
    } finally {
      await t.fx.dispose();
    }
  });

  it('Stop under an eval copies the final ledger out of the repository, and says so when it cannot', async () => {
    const t = await paused();
    const exported = await t.fx.runtime.fs.temporaryDirectory('ambicode-export-');
    // The engine reads the fixture runtime's env, which is process.env itself.
    const evalHook = async (root: string) => {
      process.env[EVAL_EXPORT_VARIABLE] = root;
      try {
        return await t.hook('Stop');
      } finally {
        delete process.env[EVAL_EXPORT_VARIABLE];
      }
    };
    try {
      await writeFile(t.transcript, lines({ type: 'user', message: { role: 'user', content: 'go' } }));
      await evalHook(exported);
      const target = path.join(exported, A, 'cart');
      const ledger = await readFile(path.join(t.fx.repo.root, '.ambicode', 'task', 'cart', 'ledger.jsonl'), 'utf8');
      assert.equal(await readFile(path.join(target, 'ledger.jsonl'), 'utf8'), ledger, 'the copy is the ledger as Stop left it');
      const source = JSON.parse(await readFile(path.join(target, 'source.json'), 'utf8')) as { ledger: string; entries: number };
      assert.deepEqual([path.basename(source.ledger), source.entries], ['ledger.jsonl', ledger.trimEnd().split('\n').length]);
      const blocker = path.join(exported, 'file');
      await writeFile(blocker, '');
      const errors: string[] = [];
      const write = process.stderr.write;
      process.stderr.write = ((chunk: string) => errors.push(String(chunk)) > 0) as typeof process.stderr.write;
      try {
        await evalHook(blocker);
      } finally {
        process.stderr.write = write;
      }
      assert.ok(errors.some((line) => line.startsWith('ambicode stop: export failed, ')), errors.join(''));
    } finally {
      await t.fx.runtime.fs.remove(exported);
      await t.fx.dispose();
    }
  });

  it('UserPromptSubmit pauses the route before the prompt is read', async () => {
    const t = await paused();
    try {
      await writeFile(t.transcript, lines(asking('t2', `${t.marker}\nPause?`), result('t2', REJECTION, true)));
      await t.hook('UserPromptSubmit');
      assert.deepEqual((await t.fx.kinds('cart', 'exit')).map((entry) => [entry['reason'], entry['source']]), [['dismissed', 'prompt']]);
    } finally {
      await t.fx.dispose();
    }
  });

  it('a marker without an instance pauses only on a dismissal after the latest print', async () => {
    const t = await paused();
    try {
      const bare = t.marker.replace(/ [^ \]]+\]$/, ']');
      const at = (timestamp: string, entry: object) => ({ ...entry, timestamp });
      await writeFile(t.transcript, lines(asking('t2', `${bare}\nPause?`), at('2026-01-01T00:00:00.000Z', result('t2', REJECTION, true))));
      await t.hook('Stop');
      assert.equal((await t.fx.kinds('cart', 'exit')).length, 0, 'the dismissal is older than the print');
      await writeFile(t.transcript, lines(asking('t3', `${bare}\nPause?`), at('2027-01-01T00:00:00.000Z', result('t3', REJECTION, true))));
      await t.hook('Stop');
      assert.deepEqual((await t.fx.kinds('cart', 'exit')).map((entry) => entry['reason']), ['dismissed']);
    } finally {
      await t.fx.dispose();
    }
  });

  it('an answered gate is not paused by an older rejection', async () => {
    const t = await paused();
    try {
      await t.fx.engine.advance({ task: 'cart', session: A, cause: 'gate-hook', answers: [{ gate: 'scope', option: 'pause' }], scratchpadDir: t.fx.scratchpad });
      await writeFile(t.transcript, lines(asking('t2', `${t.marker}\nPause?`), result('t2', REJECTION, true)));
      await t.hook('Stop');
      assert.equal((await t.fx.kinds('cart', 'exit')).filter((entry) => entry['reason'] === 'dismissed').length, 0);
    } finally {
      await t.fx.dispose();
    }
  });
});
