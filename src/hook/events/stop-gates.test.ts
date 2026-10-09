import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { skillHandlers } from '#skills/handlers';
import { routeFixture } from '#testing/fixtures/route-fixture';
import { EVAL_EXPORT_VARIABLE } from '#harness/engine/stop';
import { contentHash } from '#util/hash';
import { runHook } from './run-hook.ts';
import type { HookDeps } from '#types/hook';
import type { StartInput } from '#types/harness';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';

const lines = (...entries: object[]): string => `${entries.map((entry) => JSON.stringify(entry)).join('\n')}\n`;

describe('Stop eval export', () => {
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

  it('the eval export lists each file with its hash and copy result, and a missing note makes it incomplete', async () => {
    const t = await paused();
    const exported = await t.fx.runtime.fs.temporaryDirectory('ambicode-export-');
    const errors: string[] = [];
    const write = process.stderr.write;
    process.env[EVAL_EXPORT_VARIABLE] = exported;
    process.stderr.write = ((chunk: string) => errors.push(String(chunk)) > 0) as typeof process.stderr.write;
    try {
      await writeFile(t.transcript, lines({ type: 'user', message: { role: 'user', content: 'go' } }));
      const ledgerFile = path.join(t.fx.repo.root, '.ambicode', 'task', 'cart', 'ledger.jsonl');
      const last = JSON.parse((await readFile(ledgerFile, 'utf8')).trimEnd().split('\n').at(-1)!) as Record<string, unknown>;
      await appendFile(ledgerFile, `${JSON.stringify({ id: 'aaaaaaaa-90', at: last['at'], route: last['route'], kind: 'note', note: 'investigation', path: '.ambicode/task/cart/steps/gone.md', contentHash: 'sha256:0' })}\n`);
      await t.hook('Stop');
      const source = JSON.parse(await readFile(path.join(exported, A, 'cart', 'source.json'), 'utf8')) as { complete: boolean; files: { to: string; present: boolean; bytes: number | null; hash: string | null; copied: boolean; error?: string }[] };
      const ledger = await readFile(ledgerFile);
      assert.deepEqual(source.files.map((f) => [f.to, f.present, f.bytes, f.hash, f.copied, f.error]), [
        ['ledger.jsonl', true, ledger.length, contentHash(ledger), true, undefined],
        [path.join('notes', 'gone.md'), false, null, null, false, 'missing'],
      ]);
      assert.equal(source.complete, false);
      assert.ok(errors.some((line) => line.startsWith(`ambicode stop: export incomplete, ${path.join('notes', 'gone.md')}`)), errors.join(''));
    } finally {
      process.stderr.write = write;
      delete process.env[EVAL_EXPORT_VARIABLE];
      await t.fx.runtime.fs.remove(exported);
      await t.fx.dispose();
    }
  });
});
