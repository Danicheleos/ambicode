import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { commandContext } from '#harness/engine/context';
import { loadPayload } from '#harness/engine/execute';
import { skillHandlers } from '#skills/handlers';
import { saveNote } from '#modules/evidence/notes';
import { assembleEngine, CONFIG, routeFixture , stopRoute } from '#testing/fixtures/route-fixture';
import { NodeProcessRunner } from '#platform/ports/node-process-runner';
import { REPO_ROOT } from '#testing/paths';
import { contentHash, hash12 } from '#util/hash';
import type { StartInput } from '#types/harness';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const STEPS = ['investigate/fetch', 'investigate/read'];

async function investigation() {
  const step: Record<string, string> = {};
  for (const name of STEPS) step[`routes/${name}.md`] = await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8');
  const fx = await routeFixture({ routes: { investigate: await readFile(path.join(REPO_ROOT, 'routes', 'investigate', 'investigate.yaml'), 'utf8') }, handlers: skillHandlers(), step });
  await fx.repo.write('src/cart.ts', 'export function addToCart(items: string[], item: string): string[] {\n  return [...items, item];\n}\n');
  await fx.repo.write('src/checkout.ts', "import { addToCart } from '#route/cart';\n\nexport const checkout = (): string[] => addToCart([], 'book');\n");
  await fx.repo.commitAll('cart');
  const start = (input: Partial<StartInput> = {}) =>
    fx.engine.start({ skill: 'investigate', text: 'how does addToCart work', requirements: [], task: 'cart', cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad, ...input });
  const next = (input: Partial<Parameters<typeof fx.engine.advance>[0]> = {}) =>
    fx.engine.advance({ task: 'cart', session: A, cause: 'route-next', scratchpadDir: fx.scratchpad, ...input });
  const rows = async (): Promise<string[]> => (await fx.ledger('cart')).filter((entry) => entry.kind === 'step').map((entry) => `${entry['step']}:${entry['status']}`);
  return { fx, start, next, rows };
}

describe('investigate route (03-I1, 03-I2)', () => {
  it('D4: a note with a bad citation sends the route back to read once, then lets the corrected note complete it', async () => {
    const { fx, start, next } = await investigation();
    try {
      const first = await start();
      const context = commandContext({ runtime: fx.runtime, routes: fx.routes });
      const save = (body: string) => saveNote({ runtime: fx.runtime, session: A, context }, { task: 'cart', kind: 'investigation', body, from: null, iteration: null, route: first.routeId });
      await save('## Files\n- src/missing.ts:3\n');
      const back = await next({ cause: 'note save' });
      assert.equal(back.position, 'read');
      assert.match(back.text, /bad citation: src\/missing\.ts:3 missing-file/);
      await save('## Files\n- src/cart.ts:2\n');
      assert.equal((await next({ cause: 'note save' })).position, 'complete');
    } finally {
      await fx.dispose();
    }
  });

  it('D4: read.md tells the model to save the note before answering, and no Stop hook saves it', async () => {
    assert.match(await readFile(path.join(REPO_ROOT, 'routes', 'investigate', 'read.md'), 'utf8'), /\{cli\} note save --task \{task\} --kind investigation/);
  });

  it('03-I1: with no requirement the start runs ground synchronously and delivers read with the map and stage text', async () => {
    const { fx, start, rows } = await investigation();
    try {
      const first = await start();
      assert.equal(first.position, 'read');
      assert.deepEqual(await rows(), ['fetch:skipped', 'ground:completed', 'scope:skipped', 'read:delivered']);
      assert.match(first.text, /Now: Read the code the question is about\./);
      assert.match(first.text, /Then: .*note save --task cart --kind investigation/);
      assert.match(first.text, /Save the answer before giving it: `.*note save --task cart --kind investigation`/);
      assert.match(first.text, /## map\n/);
      assert.match(first.text, /src\/cart\.ts/);
      assert.ok(first.bytes <= 8_192, `03-X1: ground-and-read message is ${first.bytes} bytes`);
      const dir = path.join(fx.repo.root, '.ambicode', 'tasks', 'cart');
      for (const [key, limit] of [['map', 6_144], ['policy:before-work', 8_192]] as const) {
        const payload = await loadPayload(fx.runtime.fs, { steps: path.join(dir, 'steps') } as never, (await fx.kinds('cart', 'route'))[0]!.id, key);
        assert.ok(Buffer.byteLength(payload ?? '') <= limit, `03-X1: ${key} payload`);
      }
      // The map entry names what the model was shown, by path and by the hash of the exact payload.
      const map = (await fx.kinds('cart', 'map'))[0]!;
            const payload = (await loadPayload(fx.runtime.fs, { steps: path.join(dir, 'steps') } as never, (await fx.kinds('cart', 'route'))[0]!.id, 'map'))!;
      assert.ok(payload.includes('src/cart.ts'), payload);
      assert.equal(map['bytes'], Buffer.byteLength(payload));
      assert.ok(first.text.includes(payload.split("\n")[0]!), "the model is handed the map payload");
    } finally {
      await fx.dispose();
    }
  });

  it('the header carries the route: done and current steps named, skipped ones left out', async () => {
    const { fx, start } = await investigation();
    try {
      assert.match((await start()).text, /^Route: ground \(done\) · read \(now\) · check-citations$/m);
    } finally {
      await fx.dispose();
    }
  });

  it('03b-C1/03b-C2/03b-C3/03b-C4: the read step carries no request echo, no empty policy pointer and its first line once', async () => {
    const { fx, start } = await investigation();
    try {
      const first = await start();
      assert.doesNotMatch(first.text, /## envelope|## ARGS|## policy:before-work|rulesOmitted/);
      assert.equal(first.text.split('Read the code the question is about.').length - 1, 1, 'the Now: line is not repeated in the body');
      const dir = path.join(fx.repo.root, '.ambicode', 'tasks', 'cart');
      const chain = (await fx.kinds('cart', 'route'))[0]!.id;
      for (const key of ['envelope', 'policy:before-work']) {
        assert.equal(await loadPayload(fx.runtime.fs, { steps: path.join(dir, 'steps') } as never, chain, key), '', `${key}: an empty payload is saved, so no earlier one is delivered`);
      }
      assert.equal((await fx.kinds('cart', 'envelope')).length, 1, 'the envelope is still recorded');
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

  it('03b-N2/03b-N3: read is the last step; route next re-delivers it as it was, and its note completes the route', async () => {
    const { fx, start, next, rows } = await investigation();
    try {
      const first = await start();
      const again = await next();
      assert.equal(again.position, 'read');
      assert.match(again.text, /Not done yet: note\{investigation\} is not on record/);
      assert.ok((await rows()).includes('read:repeated'));
      const context = commandContext({ runtime: fx.runtime, routes: fx.routes });
      await saveNote({ runtime: fx.runtime, session: A, context }, { task: 'cart', kind: 'investigation', body: '## Files\n- src/cart.ts:2 appends\n', from: null, iteration: null, route: first.routeId });
      const done = await next({ cause: 'note save' });
      assert.equal(done.position, 'complete');
      assert.match(done.text, /The route is complete/);
      assert.equal((await fx.kinds('cart', 'exit')).at(-1)?.['reason'], 'done');
      assert.deepEqual(fx.routes.route('investigate')!.steps.map((step) => step.id), ['fetch', 'ground', 'scope', 'read', 'check-citations']);
    } finally {
      await fx.dispose();
    }
  });
});

const B = 'bbbbbbbb-2222-4222-8222-222222222222';

describe('reopen: typing the skill again continues a finished route', () => {
  type Fixture = Awaited<ReturnType<typeof investigation>>;
  const finish = async (t: Fixture, first: { task: string; routeId: string }, session = A) => {
    const context = commandContext({ runtime: t.fx.runtime, routes: t.fx.routes });
    await saveNote({ runtime: t.fx.runtime, session, context }, { task: first.task, kind: 'investigation', body: '## Files\n- src/cart.ts:2 appends\n', from: null, iteration: null, route: first.routeId });
    return t.fx.engine.advance({ task: first.task, session, cause: 'note save', scratchpadDir: t.fx.scratchpad });
  };
  const maps = async (t: Fixture) => (await t.fx.kinds('cart', 'map')).length;
  const bare = (t: Fixture, input: Partial<StartInput> = {}) =>
    t.fx.engine.start({ skill: 'investigate', text: 'how does addToCart work', requirements: [], cwd: t.fx.repo.root, session: A, channel: 'hook', scratchpadDir: t.fx.scratchpad, ...input });

  it('the scope question tells how to come back with more context', async () => {
    const t = await investigation();
    try {
      const first = await t.start({ text: 'zzqqxx wwvvuu' });
      assert.match(first.text, /type \/ambicode:investigate again/);
    } finally {
      await t.fx.dispose();
    }
  });

  it('order: without --task a finished route is continued only by text that names its task; other text is new work', async () => {
    const t = await investigation();
    try {
      const first = await t.start();
      await finish(t, first);
      const again = await bare(t, { text: 'unrelated wording entirely' });
      assert.notEqual(again.task, 'cart');
      assert.equal((await t.fx.kinds('cart', 'route')).length, 1);
    } finally {
      await t.fx.dispose();
    }
  });

  it('order: an explicit --task wins over the session\'s latest route', async () => {
    const t = await investigation();
    try {
      await finish(t, await t.start({ task: 'other' }));
      await finish(t, await t.start({ task: 'cart' }));
      const again = await t.start({ task: 'other', text: 'more' });
      assert.equal(again.task, 'other');
      assert.equal((await t.fx.kinds('other', 'route')).length, 2);
      assert.equal((await t.fx.kinds('cart', 'route')).length, 1);
    } finally {
      await t.fx.dispose();
    }
  });

  it('--fresh starts a new route', async () => {
    const t = await investigation();
    try {
      await finish(t, await t.start());
      await t.start({ fresh: true });
      assert.equal((await t.fx.kinds('cart', 'route')).at(-1)?.['resumes'], undefined);
    } finally {
      await t.fx.dispose();
    }
  });
});

describe('--fresh supersedes only its own session\'s routes', () => {
  const setup = async () => {
    const t = await investigation();
    const mine = await t.start({ text: 'first question' });
    const theirs = await t.start({ session: B, harnessSession: B, text: 'second question entirely' });
    await t.start({ text: 'third question', fresh: true });
    const exits = (await t.fx.kinds('cart', 'exit')).map((entry) => `${entry['route']}:${entry['reason']}`);
    return { t, mine, theirs, exits };
  };

  it('another live session\'s route stays live', async () => {
    const { t, mine, exits } = await setup();
    try {
      assert.deepEqual(exits, [`${mine.routeId}:superseded`]);
    } finally {
      await t.fx.dispose();
    }
  });

});

async function materialized(): Promise<string> {
  const destination = path.join(await mkdtemp(path.join(tmpdir(), 'ambicode-investigate-')), 'repo');
  const outcome = await new NodeProcessRunner().run({
    argv: ['node', path.join(REPO_ROOT, 'fixtures', 'materialize.mjs'), 'ts-feature-boundary', destination],
    cwd: REPO_ROOT,
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
      for (const name of STEPS) step[`routes/${name}.md`] = await readFile(path.join(REPO_ROOT, 'routes', `${name}.md`), 'utf8');
      const routes = { investigate: await readFile(path.join(REPO_ROOT, 'routes', 'investigate', 'investigate.yaml'), 'utf8') };
      const assembled = await assembleEngine({ root, routes, step });
      const engine = assembled.build({ ...skillHandlers(), 'requirements.normalize': async ({ ledger, view }) => {
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
        if (message.position === 'read') {
          const context = commandContext({ runtime: assembled.runtime, routes: assembled.routes });
          await saveNote({ runtime: assembled.runtime, session: A, context }, { task: 'invoices', kind: 'investigation', body: '## Confirmed facts\n- none\n', from: null, iteration: null, route: message.routeId });
        }
        message = await engine.advance({ task: 'invoices', session: A, cause: message.position === 'read' ? 'note save' : 'route-next', scratchpadDir });
      }
      positions.push(message.position);
      return { positions, modelSteps: positions.filter((position) => ['fetch', 'read'].includes(position)).length, texts };
    } finally {
      await rm(path.dirname(root), { recursive: true, force: true });
    }
  };

  it('03b-N3: without a requirement the model sees one step, read', async () => {
    const result = await walk([]);
    assert.deepEqual(result.positions, ['read', 'complete']);
    assert.equal(result.modelSteps, 1);
    assert.match(result.texts[0]!, /src\/(invoices|routes|reports|legacy)\//);
  });

  it('03b-N3: with a requirement the model sees two, fetch first', async () => {
    const result = await walk(['https://example.atlassian.net/browse/ORD-17']);
    assert.ok(Buffer.byteLength(result.texts[0]!) <= 4_096, '03-X1: a start that delivers fetch');
    assert.deepEqual(result.positions, ['fetch', 'read', 'complete']);
    assert.equal(result.modelSteps, 2);
  });
});

describe('investigate route: tasks and chains on one repository', () => {
  it('03-S7: starting a second task keeps the new route pointer, after an open older route and after an ended one', async () => {
    const { fx, start } = await investigation();
    try {
      await start({ task: 'first' });
      await start({ task: 'second' });
      assert.equal((await fx.pointer.read(A, fx.scratchpad))?.task, 'second');
      await stopRoute(fx, 'second', A, 'blocked');
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

