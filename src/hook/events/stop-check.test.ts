import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { LedgerEntry } from '../../task/ledger.ts';
import { buildChain, currentIn } from '../../route/fold.ts';
import { ledgerRouteContext } from '../../route/context.ts';
import { buildReport } from '../../task/report.ts';
import { saveNote } from '../../task/notes.ts';
import { routeFixture, type RouteFixture } from '../../testing/route-fixture.ts';
import { taskFixture } from '../../testing/task-fixture.ts';
import type { HookDeps } from './run-hook.ts';
import { runHook } from './run-hook.ts';
import { lastAssistantText, redBeforeGreen, REASON_LIMIT_BYTES, TRANSCRIPT_TAIL_BYTES } from './stop-check.ts';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TASK = 'ORD-17';
const INV = `skill: inv
version: 3
budget: { modelSteps: 6 }
exits: [done, blocked, human, inconclusive, superseded, budget]
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

interface Stopper { fx: RouteFixture; transcript: string; say(text: string): Promise<void>; stop(extra?: Record<string, unknown>): Promise<{ decision?: string; reason?: string }>; limits(): Promise<string[]>; saveNote(body: string): Promise<void>; dispose(): Promise<void> }

async function stopper(): Promise<Stopper> {
  const fx = await routeFixture({ routes: { inv: INV } });
  await fx.engine.start({ skill: 'inv', text: 'why is it slow', requirements: [], task: TASK, cwd: fx.repo.root, session: A, channel: 'hook', scratchpadDir: fx.scratchpad });
  const transcript = path.join(fx.scratchpad, 'transcript.jsonl');
  const deps: HookDeps = { pointer: fx.pointer, load: async () => ({ engine: fx.engine, routes: fx.routes, pointer: fx.pointer }) };
  const say = (text: string) => writeFile(transcript, `${JSON.stringify({ type: 'user', message: { role: 'user', content: 'go' } })}\n${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })}\n`);
  return {
    fx,
    transcript,
    say,
    stop: (extra = {}) => runHook(fx.runtime, JSON.stringify({ hook_event_name: 'Stop', session_id: A, cwd: fx.repo.root, scratchpad_dir: fx.scratchpad, transcript_path: transcript, ...extra }), deps) as Promise<{ decision?: string; reason?: string }>,
    limits: async () => (await fx.kinds(TASK, 'limit')).map((entry) => String(entry['which'])),
    async saveNote(body) {
      await saveNote({ runtime: fx.runtime, session: A, context: ledgerRouteContext({ runtime: fx.runtime, routes: fx.routes }) }, { task: TASK, kind: 'investigation', body, from: null, iteration: null, route: (await fx.kinds(TASK, 'route'))[0]!.id });
    },
    dispose: () => fx.dispose(),
  };
}
const toWrite = async (s: Stopper): Promise<void> => void (await s.fx.engine.advance({ task: TASK, session: A, cause: 'route-next', scratchpadDir: s.fx.scratchpad }));

describe('03-K1 conditions', () => {
  it('a conversational stop allows; a stop that opens with the last step heading is checked and blocks once on a bad citation', async () => {
    const s = await stopper();
    try {
      await toWrite(s);
      await s.fx.repo.write('src/a.ts', 'one\ntwo\n');
      await s.say('Which of the two modules do you mean? See src/a.ts:99.');
      assert.deepEqual(await s.stop(), {});
      await s.say('## Confirmed facts\nThe limit lives at src/a.ts:1-2 and src/missing.ts:3 and src/a.ts:99.');
      const blocked = await s.stop();
      assert.equal(blocked.decision, 'block');
      assert.match(blocked.reason!, /src\/a\.ts:99: src\/a\.ts has 2 lines/);
      assert.match(blocked.reason!, /src\/missing\.ts:3: src\/missing\.ts does not exist/);
      assert.doesNotMatch(blocked.reason!, /src\/a\.ts:1-2/);
      assert.match(blocked.reason!, /stop-check\.md/);
      assert.deepEqual(await s.limits(), ['stop-block']);
      assert.match(await readFile(path.join(s.fx.repo.root, '.ambicode', 'task', TASK, 'stop-check.md'), 'utf8'), /src\/missing\.ts:3/);
      assert.deepEqual(await s.stop(), {}, 'the second failure allows');
    } finally {
      await s.dispose();
    }
  });

  it('a subagent stop and a session with no route allow at once', async () => {
    const s = await stopper();
    try {
      await toWrite(s);
      await s.say('## Confirmed facts\nsrc/missing.ts:3');
      assert.deepEqual(await s.stop({ agent_id: 'sub' }), {});
      assert.deepEqual(await s.stop({ session_id: 'cccccccc-3333-4333-8333-333333333333' }), {});
    } finally {
      await s.dispose();
    }
  });

  it('03-K3: the generated note label is not an acceptance claim', async () => {
    const s = await stopper();
    try {
      await toWrite(s);
      await s.fx.repo.write('src/a.ts', 'one\ntwo\n');
      await s.saveNote('## Confirmed facts\nIt is at src/a.ts:1.\n');
      await s.fx.engine.advance({ task: TASK, session: A, cause: 'note save', scratchpadDir: s.fx.scratchpad });
      await s.say('Saved the note.');
      assert.deepEqual(await s.stop(), {});
      assert.deepEqual(await s.limits(), []);
    } finally {
      await s.dispose();
    }
  });

  it('03-K1(c): the note route is checked after note save completed it, from the saved file, through ended-route, which is then removed', async () => {
    const s = await stopper();
    try {
      await toWrite(s);
      await s.saveNote('## Confirmed facts\nIt is at src/missing.ts:7.\n');
      await s.fx.engine.advance({ task: TASK, session: A, cause: 'note save', scratchpadDir: s.fx.scratchpad });
      assert.equal(await s.fx.pointer.read(A, s.fx.scratchpad), null, 'the guard sees no active route');
      assert.ok((await s.fx.pointer.readEnded(A, s.fx.scratchpad)) !== null);
      await s.say('Saved the note.');
      const blocked = await s.stop();
      assert.equal(blocked.decision, 'block');
      assert.match(blocked.reason!, /src\/missing\.ts:7/);
      assert.equal(await s.fx.pointer.readEnded(A, s.fx.scratchpad), null);
      const reads: string[] = [];
      const spy = { ...s.fx.runtime, fs: new Proxy(s.fx.runtime.fs, { get: (target, key) => (key === 'readText' ? (file: string) => (reads.push(file), target.readText(file)) : (target as never as Record<string | symbol, unknown>)[key]) }) };
      const deps: HookDeps = { pointer: s.fx.pointer, load: async () => ({ engine: s.fx.engine, routes: s.fx.routes, pointer: s.fx.pointer }) };
      assert.deepEqual(await runHook(spy, JSON.stringify({ hook_event_name: 'Stop', session_id: A, cwd: s.fx.repo.root, scratchpad_dir: s.fx.scratchpad, transcript_path: s.transcript }), deps), {});
      assert.deepEqual(reads.filter((file) => file.endsWith('ledger.jsonl')), [], 'a second Stop reads no ledger');
    } finally {
      await s.dispose();
    }
  });

  it('03-K1(a): route stop makes the next Stop check the final message; the Stop after that allows', async () => {
    const s = await stopper();
    try {
      await toWrite(s);
      await s.fx.engine.stop(TASK, A, 'blocked', 'permission-denied: git push', s.fx.scratchpad);
      await s.say('I could not finish. See src/nowhere.ts:4.');
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
      assert.match(blocked.reason ?? '', /differs from the generated one/);
    } finally {
      await drift.dispose();
    }
  });

  it('"accepted" needs a bound acceptance; "tests pass" needs a counted green check', async () => {
    const s = await stopper();
    try {
      await toWrite(s);
      await s.say(`${heading}The plan was accepted and all tests pass.`);
      const blocked = await s.stop();
      assert.match(blocked.reason!, /no bound acceptance/);
      assert.match(blocked.reason!, /no check with exit 0/);
    } finally {
      await s.dispose();
    }
    const backed = await stopper();
    try {
      await toWrite(backed);
      const route = (await backed.fx.kinds(TASK, 'route'))[0]!.id;
      await writeFile(path.join(backed.fx.repo.root, '.ambicode', 'task', TASK, 'ledger.jsonl'), (await readFile(path.join(backed.fx.repo.root, '.ambicode', 'task', TASK, 'ledger.jsonl'), 'utf8')) + [
        { id: 'zzzzzzzz-901', at: '2026-10-05T10:00:00.000Z', kind: 'acceptance', route, gate: 'g', instance: 'x', answer: 'Accept', via: 'hook' },
        { id: 'zzzzzzzz-902', at: '2026-10-05T10:00:00.000Z', kind: 'check', route, key: 'app/unit', argv: ['npm', 'test'], only: [], exit: 0, phase: 'green', summary: { ran: 3, failed: 0 }, ms: 10 },
      ].map((entry) => `${JSON.stringify(entry)}\n`).join(''));
      await backed.say(`${heading}The plan was accepted and all tests pass.`);
      assert.deepEqual(await backed.stop(), {});
    } finally {
      await backed.dispose();
    }
  });

  it('03-K5: the reason is capped at 2,048 bytes and the full list is in stop-check.md', async () => {
    const s = await stopper();
    try {
      await toWrite(s);
      await s.say(`${heading}${Array.from({ length: 80 }, (_, index) => `src/missing-file-number-${index}.ts:${index + 1}`).join(' ')}`);
      const blocked = await s.stop();
      assert.ok(Buffer.byteLength(blocked.reason!) <= REASON_LIMIT_BYTES);
      const full = await readFile(path.join(s.fx.repo.root, '.ambicode', 'task', TASK, 'stop-check.md'), 'utf8');
      assert.equal(full.split('\n').filter((line) => line.startsWith('- ')).length, 80);
    } finally {
      await s.dispose();
    }
  });
});

describe('03-K6 transcript', () => {
  it('an unreadable transcript allows and records stop-unreadable once', async () => {
    const s = await stopper();
    try {
      await toWrite(s);
      assert.deepEqual(await s.stop({ transcript_path: path.join(s.fx.scratchpad, 'missing.jsonl') }), {});
      assert.deepEqual(await s.limits(), ['stop-unreadable']);
      await s.stop({ transcript_path: path.join(s.fx.scratchpad, 'missing.jsonl') });
      assert.deepEqual(await s.limits(), ['stop-unreadable']);
    } finally {
      await s.dispose();
    }
  });

  it('reads at most the last 1 MiB, dropping the cut first line', async () => {
    const s = await stopper();
    try {
      const filler = JSON.stringify({ type: 'user', message: { role: 'user', content: 'x'.repeat(2_000_000) } });
      await writeFile(s.transcript, `${filler}\n${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'the end' }] } })}\n`);
      assert.equal(await lastAssistantText(s.transcript), 'the end');
      await writeFile(s.transcript, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'too early' }] } })}\n${filler}\n`);
      assert.equal(await lastAssistantText(s.transcript), null, 'beyond the tail');
      assert.equal(TRANSCRIPT_TAIL_BYTES, 1_048_576);
    } finally {
      await s.dispose();
    }
  });
});

describe('03-K4 redBeforeGreen', () => {
  const check = (exit: number, failed: number, ran = 2): LedgerEntry => ({ id: 'a-1', at: 'x', kind: 'check', key: 'k', exit, summary: { ran, failed } });
  it('is true only when a failing run precedes the first green one', () => {
    assert.equal(redBeforeGreen([check(1, 1), check(0, 0)], 'k'), true);
    assert.equal(redBeforeGreen([check(0, 0)], 'k'), false);
    assert.equal(redBeforeGreen([check(1, 0, 0), check(0, 0)], 'k'), false, 'exit 1 with no failed test is not a red run');
    assert.equal(redBeforeGreen([check(1, 1)], 'k'), true, 'no green yet');
    assert.equal(redBeforeGreen([], 'k'), true);
  });
});

const ANSWER = `skill: inv
version: 3
budget: { modelSteps: 6 }
exits: [done, blocked, human, inconclusive, superseded, budget]
revisable: []
steps:
  - id: read
    actor: model
    instruction: "Read the code, then answer."
    produces: ["note{investigation}"]
    answer: note
`;
const CLAUDE = 'cccccccc-3333-4333-8333-333333333333';

/** The route is owned by A and was started for the Claude session CLAUDE, as a hook start records it. */
async function answering(options: { headless?: boolean } = {}) {
  const fx = await routeFixture({ routes: { inv: ANSWER } });
  await fx.repo.write('src/cart/add-item.ts', 'one\ntwo\nthree\n');
  await fx.repo.write('src/a/index.ts', 'x\n');
  await fx.repo.write('src/b/index.ts', 'y\n');
  await fx.repo.commitAll('files');
  await fx.engine.start({ skill: 'inv', text: 'where are items added', requirements: [], task: TASK, cwd: fx.repo.root, session: A, harnessSession: CLAUDE, channel: 'hook', scratchpadDir: fx.scratchpad, ...options });
  const transcript = path.join(fx.scratchpad, 'transcript.jsonl');
  const deps: HookDeps = { pointer: fx.pointer, load: async () => ({ engine: fx.engine, routes: fx.routes, pointer: fx.pointer }) };
  return {
    fx,
    say: (text: string) => writeFile(transcript, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })}\n`),
    stop: () => runHook(fx.runtime, JSON.stringify({ hook_event_name: 'Stop', session_id: CLAUDE, cwd: fx.repo.root, scratchpad_dir: fx.scratchpad, transcript_path: transcript }), deps) as Promise<{ decision?: string; reason?: string }>,
    notes: () => fx.kinds(TASK, 'note'),
    exits: async () => (await fx.kinds(TASK, 'exit')).map((entry) => String(entry['reason'])),
  };
}

describe('03b-N: the answer is the note', () => {
  it('03b-N4: a stop that cites no repository file allows and saves nothing', async () => {
    const s = await answering();
    try {
      await s.say('Do you mean the cart or the wishlist?');
      assert.deepEqual(await s.stop(), {});
      assert.deepEqual(await s.notes(), []);
    } finally {
      await s.fx.dispose();
    }
  });

  it('03b-N6/03b-N7: a clean report-shaped answer is saved under the owner, the route exits done, and the next Stop checks nothing', async () => {
    const s = await answering();
    try {
      await s.say('Items are added in src/cart/add-item.ts:2.\n\n## Files\n- src/cart/add-item.ts');
      assert.deepEqual(await s.stop(), {});
      const [note] = await s.notes();
      assert.equal(note?.['note'], 'investigation');
      const body = await readFile(path.join(s.fx.repo.root, String(note!['path'])), 'utf8');
      assert.match(body, /src\/cart\/add-item\.ts:2/);
      assert.match(body, /Navigation \(CLI calls\)/);
      assert.deepEqual(await s.exits(), ['done']);
      assert.equal(await s.fx.pointer.read(CLAUDE, s.fx.scratchpad), null);
      assert.equal(await s.fx.pointer.readEnded(CLAUDE, s.fx.scratchpad), null, 'this Stop already checked the ended route');
      assert.deepEqual(await s.stop(), {});
      assert.equal((await s.notes()).length, 1);
    } finally {
      await s.fx.dispose();
    }
  });

  it('03b-N5: an answer with a bad citation blocks once and is saved on the next stop with its problem recorded', async () => {
    const s = await answering();
    try {
      await s.say('It is in src/cart/add-item.ts:9.');
      const blocked = await s.stop();
      assert.equal(blocked.decision, 'block');
      assert.match(blocked.reason!, /src\/cart\/add-item\.ts has 3 lines/);
      assert.match(blocked.reason!, /AskUserQuestion/, '03b-N11: an interactive session asks the user to keep or rewrite');
      assert.match(blocked.reason!, /whole answer again/);
      assert.deepEqual(await s.notes(), []);
      await s.say('It is in src/cart/add-item.ts:9, as said.');
      assert.deepEqual(await s.stop(), {});
      assert.equal((await s.notes()).length, 1);
      assert.deepEqual(await s.exits(), [], 'the recorded block leaves an unverified item, so the route completes without an exit');
    } finally {
      await s.fx.dispose();
    }
  });

  it('03b-N11: a headless block demands the whole answer again, since nobody can be asked', async () => {
    const s = await answering({ headless: true });
    try {
      await s.say('It is in src/cart/add-item.ts:9.\n\n## Files\n- src/cart/add-item.ts');
      const blocked = await s.stop();
      assert.equal(blocked.decision, 'block');
      assert.doesNotMatch(blocked.reason!, /AskUserQuestion/);
      assert.match(blocked.reason!, /whole answer again with the citations fixed; it replaces the previous one/);
      const kept = await readFile(path.join(s.fx.repo.root, '.ambicode', 'task', TASK, 'answer-blocked.md'), 'utf8');
      assert.match(kept, /## Files/);
    } finally {
      await s.fx.dispose();
    }
  });

  it('03b-N12: after a block, a stop with only path-less corrections saves the blocked answer with its problems and the corrections', async () => {
    const s = await answering({ headless: true });
    try {
      await s.say('It is in src/cart/add-item.ts:9.\n\n## Files\n- src/cart/add-item.ts');
      assert.equal((await s.stop()).decision, 'block');
      await s.say('I cited `:9` wrongly; it is `:2`. The Files list is the same.');
      assert.deepEqual(await s.stop(), {});
      const [note] = await s.notes();
      const body = await readFile(path.join(s.fx.repo.root, String(note!['path'])), 'utf8');
      assert.match(body, /## Files\n- src\/cart\/add-item\.ts/);
      assert.match(body, /## Citation problems\n\n- src\/cart\/add-item\.ts:9: src\/cart\/add-item\.ts has 3 lines\./);
      assert.match(body, /it is `:2`/);
      assert.equal(await s.fx.pointer.read(CLAUDE, s.fx.scratchpad), null, 'the route is no longer active');
    } finally {
      await s.fx.dispose();
    }
  });

  it('03b-N12: a conversational stop with no block before it still saves nothing', async () => {
    const s = await answering({ headless: true });
    try {
      await s.say('The Files list is the same.');
      assert.deepEqual(await s.stop(), {});
      assert.deepEqual(await s.notes(), []);
    } finally {
      await s.fx.dispose();
    }
  });

  it('03b-N5: an answer is checked for its citations only, by the first cited line; a sentence about tests or acceptance is not a claim here', async () => {
    const s = await answering();
    try {
      await s.say('Items are added at src/cart/add-item.ts:2-4. I did not run the specs, so I cannot say whether the existing tests pass; nothing was accepted.');
      assert.deepEqual(await s.stop(), {});
      assert.equal((await s.notes()).length, 1);
    } finally {
      await s.fx.dispose();
    }
  });

  it('03b-N8: a bare name or a partial path is resolved by its unique path suffix; a shared one is not reported; an unknown one is', async () => {
    const s = await answering();
    try {
      await s.say('See add-item.ts:2, cart/add-item.ts:3, index.ts:1 and gone.ts:4.');
      const blocked = await s.stop();
      assert.equal(blocked.decision, 'block');
      assert.doesNotMatch(blocked.reason!, /add-item\.ts:[23]|index\.ts:1/);
      assert.match(blocked.reason!, /gone\.ts:4: gone\.ts does not exist/);
    } finally {
      await s.fx.dispose();
    }
  });
});

describe('07-S task stop inputs', () => {
  const heading = '## Confirmed facts\n';
  const LEDGER = (s: Stopper): string => path.join(s.fx.repo.root, '.ambicode', 'task', TASK, 'ledger.jsonl');
  let serial = 0;
  const append = async (s: Stopper, entries: Record<string, unknown>[]): Promise<void> => {
    const route = (await s.fx.kinds(TASK, 'route'))[0]!.id;
    const lines = entries.map((fields) => `${JSON.stringify({ id: `zzzzzzzz-${(serial += 1)}`, at: '2026-10-05T10:00:00.000Z', route, ...fields })}\n`);
    await writeFile(LEDGER(s), (await readFile(LEDGER(s), 'utf8')) + lines.join(''));
  };
  const BRIEF = { kind: 'step', step: 'ground', actor: 'code', status: 'completed', cause: 'route-next', defectBrief: true };
  const run = (phase: string, exit: number, summary: { ran: number; failed: number } | null, key = 'app/unit'): Record<string, unknown> => ({ kind: 'check', key, argv: ['jest'], only: ['a.spec.ts'], exit, phase, summary, ms: 3 });
  async function withStop(body: (s: Stopper) => Promise<void>): Promise<void> {
    const s = await stopper();
    try {
      await toWrite(s);
      await body(s);
    } finally {
      await s.dispose();
    }
  }

  it('07-S1/07-S4: each "tests pass" phrasing without a green check that ran tests blocks once, then the second failure allows', async () => {
    for (const phrase of ['tests pass', 'All tests pass.', 'The tests are green.', 'test passed']) {
      await withStop(async (s) => {
        await s.say(`${heading}Done: ${phrase}`);
        const blocked = await s.stop();
        assert.equal(blocked.decision, 'block', phrase);
        assert.match(blocked.reason!, /says tests pass/);
        assert.deepEqual(await s.limits(), ['stop-block']);
        assert.deepEqual(await s.stop(), {}, '07-S4 second failure allows');
        assert.deepEqual(await s.limits(), ['stop-block']);
      });
    }
  });

  it('07-S1: a text without the phrase is not blocked for lack of a green check', async () => {
    await withStop(async (s) => {
      await s.say(`${heading}The failing test now fails for the right reason; nothing was run to completion.`);
      assert.deepEqual(await s.stop(), {});
    });
  });

  it('07-S1: a green check that ran tests allows the claim', async () => {
    await withStop(async (s) => {
      await append(s, [run('red', 1, { ran: 1, failed: 1 }), run('green', 0, { ran: 3, failed: 0 })]);
      await s.say(`${heading}All tests pass.`);
      assert.deepEqual(await s.stop(), {});
      assert.deepEqual(await s.limits(), []);
    });
  });

  it('07-S1: a red-phase check shaped green, a zero-test green and a green with failures do not count', async () => {
    const cases: [string, Record<string, unknown>][] = [
      ['red phase shaped green', run('red', 0, { ran: 3, failed: 0 })],
      ['zero tests', run('green', 0, { ran: 0, failed: 0 })],
      ['null summary', run('green', 0, null)],
      ['failures', run('green', 0, { ran: 3, failed: 1 })],
      ['nonzero exit', run('green', 1, { ran: 3, failed: 0 })],
    ];
    for (const [name, entry] of cases) {
      await withStop(async (s) => {
        await append(s, [entry]);
        await s.say(`${heading}Tests pass.`);
        const blocked = await s.stop();
        assert.equal(blocked.decision, 'block', name);
        assert.match(blocked.reason!, /says tests pass/, name);
      });
    }
  });

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

  it('07-S2: a red run with no failed test does not satisfy red-before-green; without a defect brief no red is required', async () => {
    await withStop(async (s) => {
      await append(s, [BRIEF, run('red', 1, { ran: 0, failed: 0 }), run('green', 0, { ran: 3, failed: 0 })]);
      await s.say(`${heading}Fixed it.`);
      assert.equal((await s.stop()).decision, 'block');
    });
    await withStop(async (s) => {
      await append(s, [run('green', 0, { ran: 3, failed: 0 })]);
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
      const missing = Array.from({ length: 60 }, (_, index) => `src/missing-${index}.ts:${index + 1}`).join(' ');
      await s.say(`${heading}All tests pass. ${missing}`);
      const blocked = await s.stop();
      assert.equal(blocked.decision, 'block');
      assert.ok(Buffer.byteLength(blocked.reason!) <= REASON_LIMIT_BYTES, `${Buffer.byteLength(blocked.reason!)} bytes`);
      const full = await readFile(path.join(s.fx.repo.root, '.ambicode', 'task', TASK, 'stop-check.md'), 'utf8');
      assert.equal(full.split('\n').filter((line) => line.startsWith('- ')).length, 61);
      assert.match(full, /says tests pass/);
      assert.match(blocked.reason!, /stop-check\.md/);
    });
  });

  it('07-S2: on the shipped task route a defect request is recorded by ground and a green check with no red blocks the report', async () => {
    const t = await taskFixture();
    try {
      await t.start({ text: 'fix the defect in `total`', headless: true });
      assert.equal((await t.kinds('step')).find((entry) => entry['step'] === 'ground' && entry['defectBrief'] === true) !== undefined, true);
      await t.check('green', { ran: 1, failed: 0 });
      const transcript = path.join(t.fx.scratchpad, 'transcript.jsonl');
      await writeFile(transcript, `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '# Task report\nDone: fixed it.' }] } })}\n`);
      const deps: HookDeps = { pointer: t.fx.pointer, load: async () => ({ engine: t.fx.engine, routes: t.fx.routes, pointer: t.fx.pointer }) };
      const out = (await runHook(t.fx.runtime, JSON.stringify({ hook_event_name: 'Stop', session_id: A, cwd: t.fx.repo.root, scratchpad_dir: t.fx.scratchpad, transcript_path: transcript }), deps)) as { decision?: string; reason?: string };
      assert.equal(out.decision, 'block');
      assert.match(out.reason!, /app\/unit: no failing run precedes the first green one/);
    } finally {
      await t.fx.dispose();
    }
  });
});
