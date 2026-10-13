import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildChain, currentIn } from '#harness/engine/fold';
import { buildReport } from '#modules/evidence/report/report';
import { routeFixture, type RouteFixture , stopRoute } from '#testing/fixtures/route-fixture';
import { runHook } from './run-hook.ts';
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
    produces: ["note{notes}"]
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
      assert.match(blocked.reason!, /Not verified section is missing[\s\S]*\nEvidence\n/);
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

  it('a message with both report headings passes whatever its wording; a missing Not verified blocks and the stop-check file carries the generated block', async () => {
    const s = await stopper();
    try {
      await toWrite(s);
      await s.say(`${heading}Evidence\n  Requirements: ORD-99 (asked)\nNot verified\n  none recorded\n`);
      assert.deepEqual(await s.stop(), {}, 'a paraphrased Evidence was the 36-of-39 false block');
    } finally {
      await s.dispose();
    }
    const missing = await stopper();
    try {
      await toWrite(missing);
      await missing.say(`${heading}Evidence\n  Requirements: ORD-99 (asked)\n`);
      const blocked = await missing.stop();
      assert.equal(blocked.decision, 'block');
      assert.match(blocked.reason ?? '', /Not verified section is missing/);
      assert.match(blocked.reason ?? '', /\nNot verified\n  none recorded$/, 'the block reason carries the generated text');
      const file = await readFile(path.join(missing.fx.repo.root, '.ambicode', 'tasks', TASK, 'stop-check.md'), 'utf8');
      const block = /\nEvidence\n[\s\S]*$/.exec(file)?.[0].trim();
      assert.ok(block !== undefined, file);
      assert.doesNotMatch(file, /ambicode report/, 'the report carries no hash comment');
      await missing.say(`${heading}${block}`);
      assert.deepEqual(await missing.stop(), {}, 'the block the file carries is the one that passes');
    } finally {
      await missing.dispose();
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
      assert.match(out.reason!, /Evidence section is missing/);
    } finally {
      await fx.dispose();
    }
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
  async function withStop(body: (s: Stopper) => Promise<void>): Promise<void> {
    const s = await stopper();
    try {
      await toWrite(s);
      await body(s);
    } finally {
      await s.dispose();
    }
  }

  const generated = async (s: Stopper): Promise<string> => {
    const entries = await s.fx.ledger(TASK);
    const chain = buildChain(entries, entries.find((entry) => entry.kind === 'route')!);
    const report = buildReport(chain.entries, { current: currentIn(s.fx.routes.route('inv')!, chain) });
    return `${report.evidence}\n${report.notVerified}`;
  };
  const declined = { kind: 'declined', gate: 'check-only-unauthorized', instance: null, answer: 'approve', via: 'flag', reason: 'acting-needs-human', key: 'app/e2e' };

  it('07-S3: a declined key missing from the pasted Not verified blocks; the regenerated block allows', async () => {
    await withStop(async (s) => {
      const stale = await generated(s);
      await append(s, [declined]);
      await s.say(`${heading}${stale}`);
      const blocked = await s.stop();
      assert.equal(blocked.decision, 'block');
      assert.match(blocked.reason!, /Not verified section hides/);
    });
    await withStop(async (s) => {
      await append(s, [declined]);
      const fresh = await generated(s);
      assert.match(fresh, /check-only-unauthorized: declined "approve" \(acting-needs-human\)/);
      await s.say(`${heading}${fresh}`);
      assert.deepEqual(await s.stop(), {});
    });
  });

  it('07-S3: a Not verified section with the declined line deleted blocks even though the heading is kept', async () => {
    await withStop(async (s) => {
      await append(s, [declined]);
      const fresh = await generated(s);
      await s.say(`${heading}${fresh.replace(/ {2}check-only-unauthorized: declined[^\n]*\n?/, "  none recorded\n")}`);
      assert.equal((await s.stop()).decision, 'block');
    });
  });
});
