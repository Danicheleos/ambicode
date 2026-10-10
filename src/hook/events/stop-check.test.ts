import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildChain, currentIn } from '#harness/engine/fold';
import { buildReport } from '#modules/evidence/report/report';
import { routeFixture, type RouteFixture , stopRoute } from '#testing/fixtures/route-fixture';
import { taskFixture } from '#testing/fixtures/task-fixture';
import { runHook } from './run-hook.ts';
import { redBeforeGreen, REASON_LIMIT_BYTES } from './stop-check.ts';
import type { LedgerEntry } from '#types/modules/evidence';
import type { HookDeps } from '#types/hook';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TASK = 'ORD-17';
const INV = `skill: inv
version: 3
revisable: []
steps:
  - id: read
    actor: model
    instruction: "Read the code."
  - id: write
    actor: model
    instruction: "## Confirmed facts\\nWrite the note."
    produces: ["note{investigation}"]
`;

interface Stopper { fx: RouteFixture; say(text: string): Promise<void>; stop(extra?: Record<string, unknown>): Promise<{ decision?: string; reason?: string }>; limits(): Promise<string[]>; dispose(): Promise<void> }

async function stopper(): Promise<Stopper> {
  const fx = await routeFixture({ routes: { inv: INV } });
  await fx.engine.start({ skill: 'inv', text: 'why is it slow', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
  const deps: HookDeps = { pointer: fx.pointer, load: async () => ({ engine: fx.engine, routes: fx.routes, pointer: fx.pointer }) };
  let last = '';
  const say = async (text: string) => void (last = text);
  return {
    fx,
    say,
    stop: (extra = {}) => runHook(fx.runtime, JSON.stringify({ hook_event_name: 'Stop', session_id: A, cwd: fx.repo.root, scratchpad_dir: fx.scratchpad, last_assistant_message: last, ...extra }), deps) as Promise<{ decision?: string; reason?: string }>,
    limits: async () => (await fx.kinds(TASK, 'limit')).map((entry) => String(entry['which'])),
    dispose: () => fx.dispose(),
  };
}
const toWrite = async (s: Stopper): Promise<void> => void (await s.fx.engine.advance({ task: TASK, session: A, cause: 'route-next', scratchpadDir: s.fx.scratchpad }));

describe('03-K1 conditions', () => {
  it('a conversational stop allows; a stop that opens with the last step heading is checked and blocks once on a drifted report', async () => {
    const s = await stopper();
    try {
      await toWrite(s);
      await s.say('Which of the two modules do you mean?');
      assert.deepEqual(await s.stop(), {});
      await s.say('## Confirmed facts\nEvidence\nnothing was run');
      const blocked = await s.stop();
      assert.equal(blocked.decision, 'block');
      assert.match(blocked.reason!, /stop-check\.md/);
      assert.deepEqual(await s.limits(), ['stop-block']);
      assert.deepEqual(await s.stop(), {}, 'the second failure allows');
    } finally {
      await s.dispose();
    }
  });

  it('a subagent stop and a session with no route allow at once', async () => {
    const s = await stopper();
    try {
      await toWrite(s);
      await s.say('## Confirmed facts\nEvidence\nx');
      assert.deepEqual(await s.stop({ agent_id: 'sub' }), {});
      assert.deepEqual(await s.stop({ session_id: 'cccccccc-3333-4333-8333-333333333333' }), {});
    } finally {
      await s.dispose();
    }
  });

  it('03-K1(a): route stop makes the next Stop check the final message once; the Stop after that is not looked at', async () => {
    const s = await stopper();
    try {
      await toWrite(s);
      await stopRoute(s.fx, TASK, A, 'blocked', 'permission-denied: git push');
      await s.say('Evidence\nI could not finish.');
      const blocked = await s.stop();
      assert.equal(blocked.decision, 'block');
      assert.deepEqual(await s.stop(), {});
    } finally {
      await s.dispose();
    }
  });
});

describe('03-K3 checks', () => {
  const heading = '## Confirmed facts\n';

  it('a generated Evidence and Not verified block must match the report; drift blocks, the exact copy passes', async () => {
    const s = await stopper();
    try {
      await toWrite(s);
      const entries = await s.fx.ledger(TASK);
      const chain = buildChain(entries, entries.find((entry) => entry.kind === 'route')!);
      const report = buildReport(chain.entries, { current: currentIn(s.fx.routes.route('inv')!, chain) });
      await s.say(`${heading}${report.evidence}\n${report.notVerified}\n<!-- ambicode report ${report.hash} -->`);
      assert.deepEqual(await s.stop(), {});
    } finally {
      await s.dispose();
    }
    const drift = await stopper();
    try {
      await toWrite(drift);
      await drift.say(`${heading}Evidence\n  Requirements: ORD-99 (asked)\nNot verified\n  none recorded\n`);
      const blocked = await drift.stop();
      assert.match(blocked.reason ?? '', /differs from the generated one: copy the generated block \(below in the stop-check file\)/);
      // 17_1451: the stop-check file named the problem but not the block, and a route that ended early never printed it.
      const file = await readFile(path.join(drift.fx.repo.root, '.ambicode', 'tasks', TASK, 'stop-check.md'), 'utf8');
      const block = /\nEvidence\n[\s\S]*<!-- ambicode report \S+ -->/.exec(file)?.[0].trim();
      assert.ok(block !== undefined, file);
      await drift.say(`${heading}${block}`);
      assert.deepEqual(await drift.stop(), {}, 'the block the file carries is the one that passes');
    } finally {
      await drift.dispose();
    }
  });

  it('the generated sections are checked once the report was written, even with neither heading in the text', async () => {
    const withReport = INV.replace('instruction: "## Confirmed facts\\nWrite the note."', 'payload: [report]\n    instruction: "## Confirmed facts\\nWrite the note."');
    const fx = await routeFixture({ routes: { inv: withReport } });
    try {
      await fx.engine.start({ skill: 'inv', text: 'why is it slow', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
      await fx.engine.advance({ task: TASK, session: A, cause: 'route-next', scratchpadDir: fx.scratchpad });
      const deps: HookDeps = { pointer: fx.pointer, load: async () => ({ engine: fx.engine, routes: fx.routes, pointer: fx.pointer }) };
      const out = (await runHook(fx.runtime, JSON.stringify({ hook_event_name: 'Stop', session_id: A, cwd: fx.repo.root, scratchpad_dir: fx.scratchpad, last_assistant_message: `${heading}Done, nothing else to add.` }), deps)) as { decision?: string; reason?: string };
      assert.equal(out.decision, 'block');
      assert.match(out.reason!, /differs from the generated one/);
    } finally {
      await fx.dispose();
    }
  });

});

describe('03-K4 redBeforeGreen', () => {
  const check = (exit: number, _failed = 0, _ran = 2): LedgerEntry => ({ id: 'a-1', at: 'x', kind: 'check', key: 'k', exit });
  it('is true only when a failing run precedes the first green one', () => {
    assert.equal(redBeforeGreen([check(1, 1), check(0, 0)], 'k'), true);
    assert.equal(redBeforeGreen([check(0, 0)], 'k'), false);
    assert.equal(redBeforeGreen([check(1, 1)], 'k'), true, 'no green yet');
    assert.equal(redBeforeGreen([], 'k'), true);
  });
});

describe('07-S task stop inputs', () => {
  const heading = '## Confirmed facts\n';
  const LEDGER = (s: Stopper): string => path.join(s.fx.repo.root, '.ambicode', 'tasks', TASK, 'ledger.jsonl');
  let serial = 0;
  const append = async (s: Stopper, entries: Record<string, unknown>[]): Promise<void> => {
    const route = (await s.fx.kinds(TASK, 'route'))[0]!.id;
    const lines = entries.map((fields) => `${JSON.stringify({ id: `zzzzzzzz-${(serial += 1)}`, at: '2026-10-05T10:00:00.000Z', route, ...fields })}\n`);
    await writeFile(LEDGER(s), (await readFile(LEDGER(s), 'utf8')) + lines.join(''));
  };
  const BRIEF = { kind: 'step', step: 'ground', actor: 'code', status: 'completed', cause: 'route-next', defectBrief: true };
  const run = (phase: string, exit: number, _summary: { ran: number; failed: number } | null, key = 'app/unit'): Record<string, unknown> => ({ kind: 'check', key, files: ['a.spec.ts'], exit, phase, ms: 3 });
  async function withStop(body: (s: Stopper) => Promise<void>): Promise<void> {
    const s = await stopper();
    try {
      await toWrite(s);
      await body(s);
    } finally {
      await s.dispose();
    }
  }

  it('07-S2: a defect brief with a green check and no failing run before it blocks; a failing run first allows', async () => {
    await withStop(async (s) => {
      await append(s, [BRIEF, run('green', 0, { ran: 3, failed: 0 })]);
      await s.say(`${heading}Fixed it.`);
      const blocked = await s.stop();
      assert.equal(blocked.decision, 'block');
      assert.match(blocked.reason!, /app\/unit: no failing run precedes the first green one/);
    });
    await withStop(async (s) => {
      await append(s, [BRIEF, run('red', 1, { ran: 1, failed: 1 }), run('green', 0, { ran: 3, failed: 0 })]);
      await s.say(`${heading}Fixed it.`);
      assert.deepEqual(await s.stop(), {});
    });
  });

  it('07-S2: without a defect brief no red is required', async () => {
    await withStop(async (s) => {
      await append(s, [run('green', 0, null)]);
      await s.say(`${heading}Fixed it.`);
      assert.deepEqual(await s.stop(), {});
    });
  });

  it('07-S2: the red-before-green rule applies to each key with a green check', async () => {
    await withStop(async (s) => {
      await append(s, [BRIEF, run('red', 1, { ran: 1, failed: 1 }), run('green', 0, { ran: 1, failed: 0 }), run('green', 0, { ran: 2, failed: 0 }, 'app/e2e')]);
      await s.say(`${heading}Fixed it.`);
      const blocked = await s.stop();
      assert.match(blocked.reason!, /app\/e2e: no failing run/);
      assert.doesNotMatch(blocked.reason!, /app\/unit: no failing/);
    });
  });

  const generated = async (s: Stopper): Promise<string> => {
    const entries = await s.fx.ledger(TASK);
    const chain = buildChain(entries, entries.find((entry) => entry.kind === 'route')!);
    const report = buildReport(chain.entries, { current: currentIn(s.fx.routes.route('inv')!, chain) });
    return `${report.evidence}\n${report.notVerified}\n<!-- ambicode report ${report.hash} -->`;
  };
  const declined = { kind: 'declined', gate: 'check-only-unauthorized', instance: null, answer: 'approve', via: 'flag', reason: 'acting-needs-human', key: 'app/e2e' };

  it('07-S3: a declined key missing from the pasted Not verified blocks; the regenerated block allows', async () => {
    await withStop(async (s) => {
      const stale = await generated(s);
      await append(s, [declined]);
      await s.say(`${heading}${stale}`);
      const blocked = await s.stop();
      assert.equal(blocked.decision, 'block');
      assert.match(blocked.reason!, /differs from the generated one/);
    });
    await withStop(async (s) => {
      await append(s, [declined]);
      const fresh = await generated(s);
      assert.match(fresh, /check-only-unauthorized: declined "approve" \(acting-needs-human\)/);
      await s.say(`${heading}${fresh}`);
      assert.deepEqual(await s.stop(), {});
    });
  });

  it('07-S3: a Not verified section with the declined line deleted blocks even when the hash comment is kept', async () => {
    await withStop(async (s) => {
      await append(s, [declined]);
      const fresh = await generated(s);
      await s.say(`${heading}${fresh.replace(/ {2}check-only-unauthorized: declined[^\n]*\n/, '  none recorded\n')}`);
      assert.equal((await s.stop()).decision, 'block');
    });
  });

  it('07-S5: with many problems the reason stays within the limit and stop-check.md lists them all', async () => {
    await withStop(async (s) => {
      await append(s, [BRIEF, ...Array.from({ length: 60 }, (_, index) => run('green', 0, { ran: 1, failed: 0 }, `app/key-${index}`))]);
      await s.say(`${heading}Fixed it.`);
      const blocked = await s.stop();
      assert.equal(blocked.decision, 'block');
      assert.ok(Buffer.byteLength(blocked.reason!) <= REASON_LIMIT_BYTES, `${Buffer.byteLength(blocked.reason!)} bytes`);
      const full = await readFile(path.join(s.fx.repo.root, '.ambicode', 'tasks', TASK, 'stop-check.md'), 'utf8');
      assert.equal(full.split('\n').filter((line) => line.startsWith('- ')).length, 60);
      assert.match(blocked.reason!, /stop-check\.md/);
    });
  });

  it('07-S2: on the shipped task route a defect request is recorded by ground and a green check with no red blocks the report', async () => {
    const t = await taskFixture();
    try {
      await t.start({ text: 'fix the defect in `total`', headless: true });
      assert.equal((await t.kinds('step')).find((entry) => entry['step'] === 'ground' && entry['defectBrief'] === true) !== undefined, true);
      await t.check('green', { ran: 1, failed: 0 });
      const deps: HookDeps = { pointer: t.fx.pointer, load: async () => ({ engine: t.fx.engine, routes: t.fx.routes, pointer: t.fx.pointer }) };
      const out = (await runHook(t.fx.runtime, JSON.stringify({ hook_event_name: 'Stop', session_id: A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad, last_assistant_message: '# Task report\nDone: fixed it.' }), deps)) as { decision?: string; reason?: string };
      assert.equal(out.decision, 'block');
      assert.match(out.reason!, /app\/unit: no failing run precedes the first green one/);
    } finally {
      await t.fx.dispose();
    }
  });
});

