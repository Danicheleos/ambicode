import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { appendFile, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { routeFixture } from '#testing/fixtures/route-fixture';
import { CLI_LIMIT, HOOK_LIMIT } from './execute.ts';
import type { Handler } from '#types/harness';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const HEAD = (skill: string) => `skill: ${skill}\nversion: 3\nrevisable: []\nsteps:\n`;

interface Box { failCode: string | null; ran: number; crashAfterOutputs: boolean; payload: string }
const newBox = (): Box => ({ failCode: null, ran: 0, crashAfterOutputs: false, payload: 'x' });
const handlers = (box: Box): Record<string, Handler> => ({
  't.work': async ({ ledger }) => {
    box.ran += 1;
    if (box.failCode !== null) return { state: 'failed', code: box.failCode, message: 'boom', recoverable: true };
    await ledger.append({ kind: 'policy', stage: 'before-work', packs: [], rules: 0, omitted: 0, bytes: 1 });
    if (box.crashAfterOutputs) {
      box.crashAfterOutputs = false;
      throw new Error('crash');
    }
    return { state: 'ok', payload: box.payload };
  },
});

async function make(route: string, box = newBox(), config?: string | null) {
  const fx = await routeFixture({ routes: { r: route }, handlers: handlers(box), ...(config === undefined ? {} : { config }) });
  const base = { skill: 'r', text: 'do the thing', requirements: [] as string[], task: 't1', cwd: fx.repo.root, session: A, channel: 'hook' as const };
  return {
    fx,
    box,
    start: (extra: object = {}) => fx.engine.start({ ...base, ...extra }),
    next: (extra: object = {}) => fx.engine.advance({ task: 't1', session: A, cause: 'route-next', ...extra }),
    limits: async () => (await fx.kinds('t1', 'limit')).map((entry) => [entry['which'], entry['step']]),
  };
}
const codeOf = async (promise: Promise<unknown>): Promise<string> => promise.then(() => 'ok', (error: { code?: string }) => error.code ?? 'unknown');

const FAILING = `${HEAD('r')}  - id: work
    actor: code
    run: [t.work]
    produces: ["policy{before-work}"]
  - id: finish
    actor: model
    instruction: "Finish."
`;

describe('F8 failure counters', () => {
  it('03-F8: three identical failures in a row write identical-next and no other limit', async () => {
    const t = await make(FAILING);
    try {
      t.box.failCode = 'x-failed';
      assert.equal(await codeOf(t.start()), 'x-failed');
      await codeOf(t.next());
      await codeOf(t.next());
      assert.deepEqual(await t.limits(), [['identical-next', 'work']]);
      assert.equal(t.box.ran, 3);
    } finally {
      await t.fx.dispose();
    }
  });
});

const WRITER = `${HEAD('r')}  - id: write
    actor: model
    instruction: "Write the note."
    produces: ["note{investigation}"]
  - id: finish
    actor: model
    instruction: "Finish."
`;

describe('F9 missing produces', () => {
  it('03-F9: the third explicit advance without the output writes missing-produces and moves on', async () => {
    const t = await make(WRITER);
    try {
      await t.start();
      const second = await t.next();
      assert.match(second.text, /Not done yet: note\{investigation\}/);
      const third = await t.next();
      assert.match(third.text, /Not done yet: note\{investigation\}/);
      const fourth = await t.next();
      assert.deepEqual(await t.limits(), [['missing-produces', 'write']]);
      assert.equal(fourth.position, 'finish');
    } finally {
      await t.fx.dispose();
    }
  });
});

const BIG = `${HEAD('r')}  - id: work
    actor: code
    run: [t.work]
    produces: ["policy{before-work}"]
  - id: read
    actor: model
    payload: [t.work]
    instruction: "Read it."
`;

describe('E5 delivery overflow', () => {
  it('03-E5: over 8000 characters on the CLI and 9800 in a hook goes to a file behind a 300-character preview, with the same bytes', async () => {
    for (const [channel, limit] of [['cli', CLI_LIMIT], ['hook', HOOK_LIMIT]] as const) {
      const box = newBox();
      box.payload = 'y'.repeat(limit + 10);
      const t = await make(BIG, box);
      try {
        const message = await t.start({ channel });
        assert.ok(message.file !== null, `${channel} wrote a file`);
        assert.match(message.text, /Read it whole: \d+ bytes: /);
        assert.ok(message.text.length < 1200);
        const written = await readFile(message.file!, 'utf8');
        assert.ok(written.includes('y'.repeat(limit)));
        assert.equal(message.bytes, Buffer.byteLength(written.replace(/^<!--.*-->\n/, '').trimEnd()));
        const edge = newBox();
        edge.payload = 'z'.repeat(100);
        const small = await make(BIG, edge);
        try {
          assert.equal((await small.start({ channel })).file, null);
        } finally {
          await small.fx.dispose();
        }
      } finally {
        await t.fx.dispose();
      }
    }
  });
});

describe('E1 crash recovery (S10 engine halves)', () => {
  it('S10: a crash after outputs and before the completion reruns the step once on the next entry', async () => {
    const t = await make(BIG);
    try {
      t.box.crashAfterOutputs = true;
      assert.equal(await codeOf(t.start()), 'unknown');
      assert.equal(t.box.ran, 1);
      const message = await t.next();
      assert.equal(t.box.ran, 2);
      assert.equal(message.position, 'read');
      const policies = await t.fx.kinds('t1', 'policy');
      assert.equal(policies.length, 2);
    } finally {
      await t.fx.dispose();
    }
  });
});

describe('E7 slug and args hash', () => {
  it('03-E7/03-E8: the task slug is minted from the text; a restart supersedes the live route', async () => {
    const t = await make(BIG);
    try {
      const first = await t.fx.engine.start({ skill: 'r', text: 'refactor the cart', requirements: ['ORD-2', 'ORD-1'], cwd: t.fx.repo.root, session: A, channel: 'hook' });
      assert.equal(first.task, 'ord-2');
      const second = await t.fx.engine.start({ skill: 'r', text: 'refactor  the cart', requirements: ['ORD-1', 'ORD-2'], task: 'ord-2', cwd: t.fx.repo.root, session: A, channel: 'hook' });
      assert.notEqual(first.routeId, second.routeId);
      assert.equal((await t.fx.kinds('ord-2', 'route')).length, 2);
      assert.deepEqual((await t.fx.kinds('ord-2', 'exit')).map((entry) => entry['reason']), ['superseded']);
      const plain = await t.fx.engine.start({ skill: 'r', text: 'Refactor the cart totals', requirements: [], cwd: t.fx.repo.root, session: A, channel: 'hook' });
      assert.match(plain.task, /^[a-z0-9][a-z0-9-]*$/);
    } finally {
      await t.fx.dispose();
    }
  });
});

describe('E9 onError', () => {
  it('03-E9: onError stop exits with the declared reason; a recoverable failure keeps the route open', async () => {
    const stopping = BIG.replace('produces: ["policy{before-work}"]', 'produces: ["policy{before-work}"]\n    onError: stop:blocked');
    const t = await make(stopping);
    try {
      t.box.failCode = 'broken';
      const ended = await t.start();
      assert.match(ended.text, /ended: blocked/);
      assert.equal((await t.fx.kinds('t1', 'exit')).at(-1)!['reason'], 'blocked');
    } finally {
      await t.fx.dispose();
    }
    const open = await make(BIG);
    try {
      open.box.failCode = 'broken';
      assert.equal(await codeOf(open.start()), 'broken');
      assert.equal((await open.fx.kinds('t1', 'exit')).length, 0);
    } finally {
      await open.fx.dispose();
    }
  });
});

describe('E11/E12 done versus complete', () => {
  it('03-E11: a route with nothing unverified exits done and complete; a stop exit is not complete', async () => {
    const t = await make(`${HEAD('r')}  - id: one\n    actor: model\n    instruction: "One."\n`);
    try {
      await t.start();
      const done = await t.next();
      assert.equal(done.position, 'complete');
      const exit = (await t.fx.kinds('t1', 'exit')).at(-1)!;
      assert.deepEqual([exit['reason'], exit['complete']], ['done', true]);
    } finally {
      await t.fx.dispose();
    }
  });
});

describe('E13 recovery paths', () => {
  it('03-E13: a corrupt ledger is ledger-unreadable on every entry point; a missing config is config-missing for routes that need it', async () => {
    const t = await make(BIG);
    try {
      await t.start();
      await writeFile(path.join(t.fx.repo.root, '.ambicode', 'task', 't1', 'ledger.jsonl'), '{"id":"a-1"\nnot json\n');
      assert.equal(await codeOf(t.next()), 'ledger-unreadable');
      assert.equal(await codeOf(t.start()), 'ledger-unreadable');
    } finally {
      await t.fx.dispose();
    }
    const missing = await make(BIG, newBox(), null);
    try {
      assert.equal(await codeOf(missing.start()), 'config-missing');
    } finally {
      await missing.fx.dispose();
    }
  });
});

describe('A3 exits on a dirty completion', () => {
  it('a completion with unverified items writes exit complete with the count, once', async () => {
    const t = await make(WRITER);
    try {
      await t.start();
      await t.next();
      await t.next();
      await t.next();
      const done = await t.next();
      assert.equal(done.position, 'complete');
      const exits = await t.fx.kinds('t1', 'exit');
      assert.equal(exits.length, 1);
      assert.deepEqual([exits[0]!['reason'], exits[0]!['complete'], exits[0]!['unverified']], ['done', true, 1]);
    } finally {
      await t.fx.dispose();
    }
  });

});
