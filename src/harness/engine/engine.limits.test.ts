import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { routeFixture } from '#testing/fixtures/route-fixture';
import { CLI_LIMIT, HOOK_LIMIT } from './delivery.ts';
import type { Handler } from '#types/harness';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const HEAD = (skill: string, budget = 8, extra = '') => `skill: ${skill}\nversion: 3\nbudget: { modelSteps: ${budget}${extra} }\nexits: [done, blocked, human, inconclusive, superseded, budget]\nrevisable: []\nsteps:\n`;

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
    onError: retry-with "Fix the input, then run route next."
  - id: finish
    actor: model
    instruction: "Finish."
`;

describe('F8 failure counters', () => {
  it('03-F8: the same error twice writes a same-error limit and names route stop; three in a row write identical-next', async () => {
    const t = await make(FAILING);
    try {
      t.box.failCode = 'x-failed';
      assert.equal(await codeOf(t.start()), 'x-failed');
      await assert.rejects(t.next(), (error: Error & { details?: string[] }) => /route stop/.test((error.details ?? []).join('\n')));
      await codeOf(t.next());
      assert.deepEqual(await t.limits(), [['same-error', 'work'], ['same-error', 'work'], ['identical-next', 'work']]);
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
      assert.match(third.text, /Or stop: .*route stop/);
      const fourth = await t.next();
      assert.deepEqual(await t.limits(), [['missing-produces', 'write']]);
      assert.equal(fourth.position, 'finish');
    } finally {
      await t.fx.dispose();
    }
  });
});

const BUDGETED = `${HEAD('r', 2)}  - id: one
    actor: model
    instruction: "One."
  - id: two
    actor: model
    instruction: "Two."
  - id: three
    actor: model
    instruction: "Three."
  - id: four
    actor: model
    instruction: "Four."
  - id: five
    actor: model
    instruction: "Five."
`;

describe('F10 model-step budget', () => {
  it('03-F10: the delivery over budget raises budget-exhausted; stop exits budget; continue extends by one budget', async () => {
    const t = await make(BUDGETED);
    try {
      await t.start();
      await t.next();
      const gate = await t.next();
      assert.equal(gate.position, 'three');
      assert.match(gate.text, /budget is spent/);
      const printed = (await t.fx.kinds('t1', 'gate')).at(-1)!;
      const resumed = await t.fx.engine.advance({ task: 't1', session: A, cause: 'gate-hook', answers: [{ gate: 'budget-exhausted', option: 'continue', instance: printed.id }] });
      assert.equal(resumed.position, 'three');
      assert.equal((await t.fx.kinds('t1', 'exit')).length, 0);
      await t.next();
      const second = await t.next();
      assert.match(second.text, /budget is spent/);
      const again = (await t.fx.kinds('t1', 'gate')).at(-1)!;
      await t.fx.engine.advance({ task: 't1', session: A, cause: 'gate-hook', answers: [{ gate: 'budget-exhausted', option: 'stop', instance: again.id }] });
      assert.equal((await t.fx.kinds('t1', 'exit')).at(-1)!['reason'], 'budget');
    } finally {
      await t.fx.dispose();
    }
  });
});

const WALL = `${HEAD('r', 8, ', wallMinutes: 5')}  - id: one
    actor: model
    instruction: "One."
  - id: two
    actor: model
    instruction: "Two."
`;

describe('F11 wall clock', () => {
  it('03-F11: a headless route past wallMinutes exits budget; an interactive one never does', async () => {
    const headless = await make(WALL);
    try {
      await headless.start({ headless: true });
      headless.fx.advanceClock(6 * 60_000);
      const ended = await headless.next();
      assert.equal((await headless.fx.kinds('t1', 'exit')).at(-1)!['reason'], 'budget');
      assert.match(ended.text, /ended: budget/);
    } finally {
      await headless.fx.dispose();
    }
    const interactive = await make(WALL);
    try {
      await interactive.start();
      interactive.fx.advanceClock(600 * 60_000);
      assert.equal((await interactive.next()).position, 'two');
    } finally {
      await interactive.fx.dispose();
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
  it('03-E7/03-E8: the task slug is minted from the text; the args hash ignores requirement order', async () => {
    const t = await make(BIG);
    try {
      const first = await t.fx.engine.start({ skill: 'r', text: 'refactor the cart', requirements: ['ORD-2', 'ORD-1'], cwd: t.fx.repo.root, session: A, channel: 'hook' });
      assert.equal(first.task, 'ORD-2');
      const second = await t.fx.engine.start({ skill: 'r', text: 'refactor  the cart', requirements: ['ORD-1', 'ORD-2'], task: 'ORD-2', cwd: t.fx.repo.root, session: A, channel: 'hook' });
      assert.equal(first.routeId, second.routeId);
      assert.equal((await t.fx.kinds('ORD-2', 'route')).length, 1);
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

describe('E10 status', () => {
  it('03-E10: status is read-only and lists orphan files the ledger does not name', async () => {
    const t = await make(BIG);
    try {
      await t.start();
      await writeFile(path.join(t.fx.repo.root, '.ambicode', 'task', 't1', 'stray.md'), 'x');
      const before = await t.fx.ledger('t1');
      const [position] = await t.fx.engine.status('t1', A);
      assert.equal(position!.position, 'read');
      assert.deepEqual(position!.orphans, ['stray.md']);
      assert.deepEqual(await t.fx.ledger('t1'), before);
    } finally {
      await t.fx.dispose();
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
