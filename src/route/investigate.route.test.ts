import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { ledgerRouteContext } from './context.ts';
import { loadPayload } from './delivery.ts';
import { defaultHandlers } from './handlers.ts';
import type { StartInput } from './engine.ts';
import { saveNote } from '../task/notes.ts';
import { assembleEngine, CONFIG, routeFixture } from '../testing/route-fixture.ts';
import { NodeProcessRunner } from '../ports/node-process-runner.ts';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const STEPS = ['investigate-fetch', 'investigate-read', 'investigate-write'];

async function investigation() {
  const step: Record<string, string> = {};
  for (const name of STEPS) step[`routes/steps/${name}.md`] = await readFile(path.join(ROOT, 'routes', 'steps', `${name}.md`), 'utf8');
  const fx = await routeFixture({ routes: { investigate: await readFile(path.join(ROOT, 'routes', 'investigate.yaml'), 'utf8') }, handlers: defaultHandlers(), step });
  await fx.repo.write('src/cart.ts', 'export function addToCart(items: string[], item: string): string[] {\n  return [...items, item];\n}\n');
  await fx.repo.write('src/checkout.ts', "import { addToCart } from './cart.ts';\n\nexport const checkout = (): string[] => addToCart([], 'book');\n");
  await fx.repo.commitAll('cart');
  const start = (input: Partial<StartInput> = {}) =>
    fx.engine.start({ skill: 'investigate', text: 'how does addToCart work', requirements: [], task: 'cart', cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad, ...input });
  const next = (input: Partial<Parameters<typeof fx.engine.advance>[0]> = {}) =>
    fx.engine.advance({ task: 'cart', session: A, cause: 'route-next', scratchpadDir: fx.scratchpad, ...input });
  const rows = async (): Promise<string[]> => (await fx.ledger('cart')).filter((entry) => entry.kind === 'step').map((entry) => `${entry['step']}:${entry['status']}`);
  return { fx, start, next, rows };
}

describe('investigate route (03-I1, 03-I2)', () => {
  it('03-I1: with no requirement the start runs ground synchronously and delivers read with the map and stage text', async () => {
    const { fx, start, rows } = await investigation();
    try {
      const first = await start();
      assert.equal(first.position, 'read');
      assert.deepEqual(await rows(), ['template:skipped', 'fetch:skipped', 'ground:completed', 'scope:skipped', 'read:delivered']);
      assert.match(first.text, /Now: Read the code the map points at/);
      assert.match(first.text, /## map\n/);
      assert.match(first.text, /src\/cart\.ts/);
      assert.match(first.text, /ambicode\.mjs" find <name>/);
      assert.ok(first.bytes <= 8_192, `03-X1: ground-and-read message is ${first.bytes} bytes`);
      const dir = path.join(fx.repo.root, '.ambicode', 'task', 'cart');
      for (const [key, limit] of [['map', 6_144], ['policy:before-work', 8_192]] as const) {
        const payload = await loadPayload(fx.runtime.fs, { steps: path.join(dir, 'steps') } as never, (await fx.kinds('cart', 'route'))[0]!.id, key);
        assert.ok(Buffer.byteLength(payload ?? '') <= limit, `03-X1: ${key} payload`);
      }
    } finally {
      await fx.dispose();
    }
  });

  it('03-I1: a nothing-matched map raises the scope gate, and a free-text answer revises ground with that term', async () => {
    const { fx, start, next, rows } = await investigation();
    try {
      const first = await start({ text: 'zzqqxx wwvvuu' });
      assert.equal(first.position, 'scope');
      assert.match(first.text, /Nothing matched the request/);
      const second = await next({ answers: [{ gate: 'scope', option: 'addToCart' }] });
      assert.equal(second.position, 'read');
      assert.match(second.text, /src\/cart\.ts/);
      assert.ok((await rows()).includes('ground:completed'));
    } finally {
      await fx.dispose();
    }
  });

  it('03-I1: backticked boilerplate that matches nothing does not hide the request words, so no scope gate is raised', async () => {
    const { fx, start } = await investigation();
    try {
      const first = await start({ text: `FR-A-1 FR-A-2 FR-A-3 FR-A-4 FR-A-5 FR-A-6 FR-A-7 FR-A-8 FR-A-9 FR-A-10 FR-A-11 FR-A-12 FR-A-13. ${'Which files would the checkout change touch? End with a `## Files` section; run `cd repo` first, under `repo/`.'}` });
      assert.equal(first.position, 'read');
      assert.match(first.text, /src\/checkout\.ts/);
    } finally {
      await fx.dispose();
    }
  });

  it('03-I1: pausing at the scope gate ends the route as human without reading anything, and the gate offers no search without a term', async () => {
    const { fx, start, next } = await investigation();
    try {
      const first = await start({ text: 'zzqqxx wwvvuu' });
      assert.doesNotMatch(first.text, /search anyway/i);
      const paused = await next({ answers: [{ gate: 'scope', option: 'pause' }] });
      assert.equal(paused.position, 'complete');
      assert.equal((await fx.kinds('cart', 'exit')).at(-1)?.['reason'], 'human');
    } finally {
      await fx.dispose();
    }
  });

  it('03-I1/03-I2: read completes without a search call, report-step runs, write saves the note and the route ends done', async () => {
    const { fx, start, next } = await investigation();
    try {
      const first = await start();
      const write = await next();
      assert.equal(write.position, 'write');
      assert.match(write.text, /^\[ambicode\] investigate · task cart · step write \(7\/7\)\nNow: Write the investigation note, then save it\./);
      assert.match(write.text, /note save --task cart --kind investigation/);
      assert.match(write.text, /## navigation\n/);
      const hold = await next();
      assert.equal(hold.position, 'write');
      assert.match(hold.text, /Not done yet: note\{investigation\}/);
      const context = ledgerRouteContext({ runtime: fx.runtime, routes: fx.routes });
      await saveNote({ runtime: fx.runtime, session: A, context }, { task: 'cart', kind: 'investigation', body: '## Confirmed facts\n- addToCart appends (src/cart.ts:2)\n', from: null, iteration: null, route: first.routeId });
      const done = await next();
      assert.equal(done.position, 'complete');
      assert.match(done.text, /The route is complete/);
      assert.equal((await fx.kinds('cart', 'exit')).at(-1)?.['reason'], 'done');
    } finally {
      await fx.dispose();
    }
  });
});

async function materialized(): Promise<string> {
  const destination = path.join(await mkdtemp(path.join(tmpdir(), 'ambicode-investigate-')), 'repo');
  const outcome = await new NodeProcessRunner().run({
    argv: ['node', path.join(ROOT, 'fixtures', 'materialize.mjs'), 'ts-feature-boundary', destination],
    cwd: ROOT,
    timeoutMs: 60_000,
    maxOutputBytes: 262_144,
    env: { kind: 'inherited' },
  });
  assert.equal(outcome.exitCode, 0, outcome.stderr);
  await mkdir(path.join(destination, '.ambicode'), { recursive: true });
  await writeFile(path.join(destination, '.ambicode', 'config.yaml'), `${CONFIG}\n`);
  return destination;
}

describe('investigate route: a synthetic walk on ts-feature-boundary (03-I1, 03-I2)', () => {
  const walk = async (requirements: readonly string[]): Promise<{ positions: string[]; modelSteps: number; texts: string[] }> => {
    const root = await materialized();
    try {
      const step: Record<string, string> = {};
      for (const name of STEPS) step[`routes/steps/${name}.md`] = await readFile(path.join(ROOT, 'routes', 'steps', `${name}.md`), 'utf8');
      const routes = { investigate: await readFile(path.join(ROOT, 'routes', 'investigate.yaml'), 'utf8') };
      const assembled = await assembleEngine({ root, routes, step });
      const engine = assembled.build({ ...defaultHandlers(), 'requirements.normalize': async ({ ledger, view }) => {
        await ledger.append({ kind: 'envelope', route: view.routeId, sources: [], builtFrom: 'args', asked: [], missingAsked: [], hash: 'stub' });
        return { state: 'ok', payload: 'ORD-17: invoice totals' };
      } });
      const scratchpadDir = await assembled.runtime.fs.temporaryDirectory('ambicode-scratch-');
      const positions: string[] = [];
      const texts: string[] = [];
      let message = await engine.start({ skill: 'investigate', text: 'where do invoice totals get computed', requirements, task: 'invoices', cwd: root, session: A, channel: 'hook', scratchpadDir });
      for (let turn = 0; turn < 6 && message.position !== 'complete'; turn += 1) {
        positions.push(message.position);
        texts.push(message.text);
        if (message.position === 'write') {
          const context = ledgerRouteContext({ runtime: assembled.runtime, routes: assembled.routes });
          await saveNote({ runtime: assembled.runtime, session: A, context }, { task: 'invoices', kind: 'investigation', body: '## Confirmed facts\n- none\n', from: null, iteration: null, route: message.routeId });
        }
        message = await engine.advance({ task: 'invoices', session: A, cause: 'route-next', scratchpadDir });
      }
      positions.push(message.position);
      return { positions, modelSteps: positions.filter((position) => ['fetch', 'read', 'write'].includes(position)).length, texts };
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  };

  it('03-I1: without a requirement the model sees two steps, read and write', async () => {
    const result = await walk([]);
    assert.deepEqual(result.positions, ['read', 'write', 'complete']);
    assert.equal(result.modelSteps, 2);
    assert.match(result.texts[0]!, /src\/(invoices|routes|reports|legacy)\//);
  });

  it('03-I1: with a requirement the model sees three, fetch first with the template in its payload', async () => {
    const result = await walk(['https://example.atlassian.net/browse/ORD-17']);
    assert.ok(Buffer.byteLength(result.texts[0]!) <= 4_096, '03-X1: a start that delivers fetch');
    assert.deepEqual(result.positions, ['fetch', 'read', 'write', 'complete']);
    assert.equal(result.modelSteps, 3);
    assert.match(result.texts[0]!, /## template\n/);
  });
});

describe('investigate route: tasks and chains on one repository', () => {
  it('03-S7: starting a second task keeps the new route pointer, after an open older route and after an ended one', async () => {
    const { fx, start } = await investigation();
    try {
      await start({ task: 'first' });
      await start({ task: 'second' });
      assert.equal((await fx.pointer.read(A, fx.scratchpad))?.task, 'second');
      await fx.engine.stop('second', A, 'blocked', undefined, fx.scratchpad);
      await start({ task: 'third' });
      assert.equal((await fx.pointer.read(A, fx.scratchpad))?.task, 'third');
    } finally {
      await fx.dispose();
    }
  });

  it('03-F1: a second investigation on the same task does not change what the first one is shown', async () => {
    const { fx, start } = await investigation();
    const B = 'bbbbbbbb-2222-4222-8222-222222222222';
    try {
      await start();
      const before = await fx.engine.deliver('cart', A, fx.scratchpad);
      const other = await start({ text: 'how does checkout work', session: B });
      assert.notEqual(other.text, before?.text);
      assert.equal((await fx.engine.deliver('cart', A, fx.scratchpad))?.text, before?.text);
      assert.equal((await fx.engine.deliver('cart', B, fx.scratchpad))?.text, other.text);
    } finally {
      await fx.dispose();
    }
  });
});

