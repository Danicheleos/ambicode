import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { routeFixture } from '#testing/fixtures/route-fixture';
import type { Handler } from '#types/harness';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const HEAD = (skill: string) => `skill: ${skill}\nversion: 3\nsteps:\n`;

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
    /** The message a hook gets: for the hook channel one link line, not the step text. */
    startRaw: (extra: object = {}) => fx.rawEngine.start({ ...base, ...extra }),
    next: (extra: object = {}) => fx.engine.advance({ task: 't1', cause: 'route-next', ...extra }),
    limits: async () => (await fx.kinds('t1', 'limit')).map((entry) => [entry['which'], entry['step']]),
  };
}
const codeOf = async (promise: Promise<unknown>): Promise<string> => promise.then(() => 'ok', (error: { code?: string }) => error.code ?? 'unknown');

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

const CHECKED = WRITER.replace('"note{investigation}"', '"check{green}"');

describe('F9 commands do not count as attempts', () => {
  it('03-F9b: red check causes while a delivered step is unmet write no limit and no repeat', async () => {
    const t = await make(CHECKED);
    try {
      await t.start();
      for (const cause of ['check', 'check', 'check', 'check']) {
        const message = await t.next({ cause });
        assert.equal(message.position, 'write');
      }
      assert.deepEqual(await t.limits(), []);
      assert.equal((await t.fx.kinds('t1', 'step')).filter((entry) => entry['status'] === 'repeated').length, 0);
    } finally {
      await t.fx.dispose();
    }
  });

  it('03-F9c: review and check causes at a step producing review write no limit', async () => {
    const t = await make(WRITER.replace('"note{investigation}"', '"review"'));
    try {
      await t.start();
      for (const cause of ['check', 'check']) assert.equal((await t.next({ cause })).position, 'write');
      assert.deepEqual(await t.limits(), []);
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

const LINK = /^Read (\S+\.md) whole now: it is this step \((\d+) bytes\)\.$/;

describe('E5 delivery channels', () => {
  it('the CLI prints the whole step text, whatever its size, and writes no step file', async () => {
    for (const size of [100, 8_010, 40_000]) {
      const box = newBox();
      box.payload = 'y'.repeat(size);
      const t = await make(BIG, box);
      try {
        const message = await t.startRaw({ channel: 'cli' });
        assert.equal(message.file, null, `${size}`);
        assert.ok(message.text.includes('y'.repeat(size)), `${size}`);
        assert.equal(message.bytes, Buffer.byteLength(message.text), `${size}`);
        assert.doesNotMatch(message.text, /whole now|Read it whole/);
        assert.deepEqual(await readdir(path.join(t.fx.repo.root, '.ambicode', 'tasks', 't1', 'steps')).then((names) => names.filter((name) => name.startsWith('step-'))), [], `${size}`);
      } finally {
        await t.fx.dispose();
      }
    }
  });

  it('a hook gets exactly one link line, and the file it names holds the whole step text', async () => {
    for (const size of [100, 8_010, 40_000]) {
      const box = newBox();
      box.payload = 'y'.repeat(size);
      const t = await make(BIG, box);
      try {
        const message = await t.startRaw({ channel: 'hook' });
        const link = LINK.exec(message.text);
        assert.ok(link !== null, `${size}: ${message.text}`);
        assert.equal(message.file, link[1], `${size}`);
        const written = await readFile(link[1]!, 'utf8');
        assert.match(written, /^<!-- ambicode step: r\/read, task t1, \d+ bytes -->\n\[ambicode\] r · task t1 · step /);
        const whole = written.replace(/^<!--.*-->\n/, '').trimEnd();
        assert.ok(whole.includes('y'.repeat(size)), `${size}`);
        assert.equal(message.bytes, Buffer.byteLength(whole), `${size}`);
        assert.equal(Number(link[2]), message.bytes, `${size}`);
        // The same step delivered again (a resume) names a file that exists too.
        const again = (await t.fx.rawEngine.deliver('t1'))!;
        const pointed = LINK.exec(again.text)![1]!;
        assert.equal((await readFile(pointed, 'utf8')).replace(/^<!--.*-->\n/, '').trimEnd(), whole, `${size}`);
      } finally {
        await t.fx.dispose();
      }
    }
  });
});

const ANSWERED = `${HEAD('r')}  - id: answer
    actor: model
    instruction: "Answer."
    produces: ["note{investigation}"]
    repeat: 2
  - id: verify
    actor: code
    run: [t.verify]
    onFail: revise answer
`;

describe('E5 the Stop block', () => {
  it('a saved answer whose check fails blocks with the hook form: one link line, naming a file that holds the whole step', async () => {
    const fx = await routeFixture({ routes: { r: ANSWERED }, handlers: { 't.verify': async () => ({ state: 'failed', code: 'bad', message: `bad ${'z'.repeat(20_000)}`, recoverable: true }) } });
    try {
      await fx.rawEngine.start({ skill: 'r', text: 'x', requirements: [], task: 't1', cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
      const stop = await fx.rawEngine.stopHook({ hook_event_name: 'Stop', session_id: A, cwd: fx.repo.root, scratchpad_dir: fx.scratchpad, last_assistant_message: 'the answer' }, { repositoryRoot: fx.repo.root, where: '.' });
      assert.equal(stop?.decision, 'block');
      const reason = stop?.reason ?? '';
      const [intro, blank, link, ...rest] = reason.split('\n');
      assert.match(intro!, /^Your answer was saved as the note, but a check failed\./, reason.slice(0, 300));
      assert.equal(blank, '');
      const found = LINK.exec(link!);
      assert.ok(found !== null && rest.length === 0, reason.slice(0, 300));
      assert.ok((await readFile(found[1]!, 'utf8')).includes('z'.repeat(20_000)));
    } finally {
      await fx.dispose();
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
      assert.deepEqual((await t.fx.kinds('ord-2', 'exit')).map((entry) => entry['reason']), ['interrupted']);
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
      await writeFile(path.join(t.fx.repo.root, '.ambicode', 'tasks', 't1', 'ledger.jsonl'), '{"id":"a-1"\nnot json\n');
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
