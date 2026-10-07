import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { skillHandlers } from '#skills/handlers';
import { routeFixture } from '#testing/fixtures/route-fixture';
import { logInvocation } from './command-log.ts';

const RECORD = { argv: ['npm test --token [redacted]'], type: 'check' as const, exit: 1, ms: 5, outBytes: 9 };

async function fixture() {
  const step = { 'routes/investigate/fetch.md': await readFile('routes/investigate/fetch.md', 'utf8'), 'routes/investigate/read.md': await readFile('routes/investigate/read.md', 'utf8') };
  const fx = await routeFixture({ routes: { investigate: await readFile('routes/investigate/investigate.yaml', 'utf8') }, handlers: skillHandlers(), step });
  await fx.repo.write('src/cart.ts', 'export const a = 1;\n');
  await fx.repo.commitAll('cart');
  return fx;
}

test('a task invocation writes command entries to the task ledger, its own last', async () => {
  const fx = await fixture();
  try {
    await fx.engine.start({ skill: 'investigate', text: 'zzqqxx wwvvuu', requirements: [], task: 'cart', cwd: fx.repo.root, session: 'aaaaaaaa-1111-4111-8111-111111111111', channel: 'hook', scratchpadDir: fx.scratchpad });
    await logInvocation(fx.runtime, [RECORD], { name: 'check', argv: ['--task', 'cart', '--token', 'sekret', '--text', 'the user said something private'], task: 'cart', exit: 1, ms: 20, out: 100 });
    const commands = await fx.kinds('cart', 'command');
    assert.deepEqual(commands.map((entry) => entry['type']), ['check', 'ambicode']);
    assert.deepEqual(commands[1]?.['argv'], ['ambicode check --task --token [redacted]']);
    assert.doesNotMatch(JSON.stringify(commands), /private|sekret/);
  } finally {
    await fx.dispose();
  }
});

test('without a task the rows go to .ambicode/metrics.jsonl, and init adds its own row', async () => {
  const fx = await fixture();
  try {
    await logInvocation(fx.runtime, [], { name: 'init', argv: [], task: null, exit: 0, ms: 3, out: 1 });
    await logInvocation(fx.runtime, [], { name: 'rules apply', argv: [], task: null, exit: 0, ms: 4, out: 1 });
    const rows = (await readFile(path.join(fx.repo.root, '.ambicode', 'metrics.jsonl'), 'utf8')).trim().split('\n').map((line) => JSON.parse(line) as { kind: string });
    assert.deepEqual(rows.map((row) => row.kind), ['command', 'init', 'command', 'rules']);
  } finally {
    await fx.dispose();
  }
});
