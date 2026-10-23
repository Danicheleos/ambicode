import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { routeFixture, type RouteFixture , stopRoute } from '#testing/fixtures/route-fixture';
import { runHook } from './run-hook.ts';
import type { HookDeps } from '#types/hook';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const TASK = 'ORD-17';
const INV = `skill: inv
version: 3
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
  const deps: HookDeps = { load: async () => ({ engine: fx.engine, routes: fx.routes }) };
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
const toWrite = async (s: Stopper): Promise<void> => void (await s.fx.engine.advance({ task: TASK, cause: 'route-next', scratchpadDir: s.fx.scratchpad }));

const GAP = 'check-only-unauthorized: declined "approve" (acting-needs-human)';
const declined = { kind: 'declined', gate: 'check-only-unauthorized', instance: null, answer: 'approve', via: 'flag', reason: 'acting-needs-human', key: 'app/e2e' };
const HEADING = '## Confirmed facts\n';
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
const saved = async (s: Stopper): Promise<string[]> => (await s.fx.kinds(TASK, 'note')).filter((note) => note['note'] === 'result').map((note) => String(note['path']));

describe('03-K1 conditions', () => {
  it('a conversational stop allows; a stop that opens with the last step heading blocks once when it leaves a current gap unstated', async () => {
    await withStop(async (s) => {
      await append(s, [declined]);
      await s.say('Which of the two modules do you mean?');
      assert.deepEqual(await s.stop(), {});
      await s.say(`${HEADING}nothing was run`);
      const blocked = await s.stop();
      assert.equal(blocked.decision, 'block');
      assert.match(blocked.reason!, /1 gap\(s\) unstated[\s\S]*- check-only-unauthorized: declined "approve" \(acting-needs-human\)$/);
      assert.deepEqual(await s.limits(), ['stop-block']);
      assert.deepEqual(await saved(s), [], 'a blocked message is not the result');
      assert.deepEqual(await s.stop(), {}, 'the second failure allows');
    });
  });

  it('a subagent stop and a session with no route allow at once', async () => {
    await withStop(async (s) => {
      await append(s, [declined]);
      await s.say(`${HEADING}x`);
      assert.deepEqual(await s.stop({ agent_id: 'sub' }), {});
      assert.deepEqual(await s.stop({ session_id: 'cccccccc-3333-4333-8333-333333333333' }), {});
    });
  });

  it('03-K1(a): route stop makes the next Stop check the final message once; the Stop after that is not looked at', async () => {
    await withStop(async (s) => {
      await append(s, [declined]);
      await stopRoute(s.fx, TASK, A, 'blocked', 'permission-denied: git push');
      await s.say('I could not finish.');
      assert.equal((await s.stop()).decision, 'block');
      await s.say(`I could not finish. ${GAP}`);
      assert.deepEqual(await s.stop(), {});
      assert.equal((await saved(s)).length, 1, 'the corrected message is the result');
      await s.say('And one more thing.');
      assert.deepEqual(await s.stop(), {});
      assert.equal((await saved(s)).length, 1, 'later Stops are not looked at');
    });
  });
});

describe('the final message states the gaps, and needs no Evidence block', () => {
  it('with no gap, a message without Evidence or Not verified passes and is saved as the result note', async () => {
    await withStop(async (s) => {
      const message = `${HEADING}Done: nothing to add.`;
      await s.say(message);
      assert.deepEqual(await s.stop(), {});
      const [note] = await saved(s);
      assert.ok(note !== undefined);
      assert.equal((await readFile(path.join(s.fx.repo.root, note), 'utf8')).trim(), message.trim());
    });
  });

  it('a message that states the gap in its own words around the generated line passes, whatever its markup', async () => {
    await withStop(async (s) => {
      await append(s, [declined]);
      await s.say(`${HEADING}**Not verified**\n- *${GAP.toUpperCase()}*.\n`);
      assert.deepEqual(await s.stop(), {});
      assert.equal((await saved(s)).length, 1);
    });
  });

  it('a gap left out blocks naming it; restating it as the block reason gives it passes', async () => {
    await withStop(async (s) => {
      await append(s, [declined]);
      await s.say(`${HEADING}Done.\nNot verified\n- none`);
      const blocked = await s.stop();
      assert.equal(blocked.decision, 'block');
      const line = /- (.*)$/.exec(blocked.reason ?? '')?.[1];
      assert.equal(line, GAP);
      await s.say(`${HEADING}Done.\nNot verified\n- ${line}`);
      assert.deepEqual(await s.stop(), {});
    });
  });

  it('a message written before a gap was recorded blocks; a regenerated one passes', async () => {
    await withStop(async (s) => {
      await append(s, [declined]);
      await s.say(`${HEADING}Checks\n- web/unit: passed`);
      assert.equal((await s.stop()).decision, 'block');
    });
    await withStop(async (s) => {
      await append(s, [declined]);
      await s.say(`${HEADING}Checks\n- web/unit: passed\nNot verified\n- ${GAP}`);
      assert.deepEqual(await s.stop(), {});
    });
  });
});
