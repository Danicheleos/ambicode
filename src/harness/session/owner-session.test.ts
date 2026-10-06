import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '#cli/args';
import { runNoteSave } from '#cli/commands/route/note';
import { runRouteNext, runRouteStart, runRouteStatus, runRouteStop } from '#cli/commands/route/route';
import { answerGates } from '#hook/events/gate-answer';
import { hookRunner, investigation, type Hooked } from '#testing/fixtures/owner-fixture';
import { planFixture, PLAN_TASK, type PlanFixture } from '#testing/fixtures/plan-fixture';
import { resolveActiveRoute } from './active-route.ts';
import { harnessOf, ownerOfHarness } from './harness.ts';
import { ownerOf } from './ownership.ts';
import { taskSessionSource } from './session.ts';
import { ledgerRouteContext } from '../engine/context.ts';
import { saveNote } from '#modules/evidence/notes';
import { NOTE_SAVE_OPTIONS, ROUTE_NEXT_OPTIONS, ROUTE_STATUS_OPTIONS, ROUTE_STOP_OPTIONS } from '#cli/types/commands';
import { ROUTE_START_OPTIONS } from '#types/cli';
import type { Runtime } from '#types/composition';
import type { HookDeps } from '#types/hook';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const CLAUDE_1 = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLAUDE_2 = '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CLAUDE_3 = '33333333-cccc-4ccc-8ccc-cccccccccccc';
const CLAUDE_4 = '44444444-dddd-4ddd-8ddd-dddddddddddd';

const args = <T extends Parameters<typeof parseArgs>[2]>(command: string, argv: string[], options: T) => parseArgs(command, argv, options);
const codeOf = (promise: Promise<unknown>): Promise<string> => promise.then(() => 'ok', (error: { code?: string }) => error.code ?? 'unknown');
const launch = (hooked: Hooked, text: string, session = CLAUDE_1) => hooked.event({ hook_event_name: 'UserPromptSubmit', prompt: text }, session);
const context = (output: unknown): string => (output as { hookSpecificOutput?: { additionalContext: string } }).hookSpecificOutput?.additionalContext ?? '';

describe('5.1 / 03-S1: a hook launch mints the owner id and records the Claude session beside it', () => {
  it('the route session is a fresh uuid, harnessSession is the Claude session, and the pointer names the owner', async () => {
    const inv = await investigation();
    try {
      await launch(inv.hooked, '/ambicode:investigate how does addToCart work --task cart');
      const [route, ...rest] = await inv.fx.kinds('cart', 'route');
      assert.equal(rest.length, 0);
      assert.match(String(route!['session']), UUID);
      assert.equal(route!['harnessSession'], CLAUDE_1);
      assert.deepEqual(await inv.fx.pointer.read(CLAUDE_1, inv.scratchpad(CLAUDE_1)), { task: 'cart', skill: 'investigate', owner: route!['session'] });
      const entries = await inv.fx.ledger('cart');
      assert.equal(ownerOfHarness(entries, CLAUDE_1), route!['session']);
      assert.equal(ownerOfHarness(entries, String(route!['session'])), null, 'the owner id is not a Claude session');
      assert.equal(harnessOf(route!), CLAUDE_1);
    } finally {
      await inv.dispose();
    }
  });

  it('the same Claude session launching the same request again keeps its owner and writes no second route', async () => {
    const inv = await investigation();
    try {
      await launch(inv.hooked, '/ambicode:investigate how does addToCart work --task cart');
      const before = await inv.fx.kinds('cart', 'route');
      await launch(inv.hooked, '/ambicode:investigate how does addToCart work --task cart');
      assert.deepEqual((await inv.fx.kinds('cart', 'route')).map((entry) => entry.id), before.map((entry) => entry.id));
    } finally {
      await inv.dispose();
    }
  });

  it('a route written before owner ids (no harnessSession) still belongs to its Claude session', async () => {
    const inv = await investigation();
    try {
      await inv.start();
      const entries = await inv.fx.ledger('cart');
      assert.equal(harnessOf(entries.find((entry) => entry.kind === 'route')!), 'aaaaaaaa-1111-4111-8111-111111111111');
      assert.equal(ownerOfHarness(entries, 'aaaaaaaa-1111-4111-8111-111111111111'), 'aaaaaaaa-1111-4111-8111-111111111111');
    } finally {
      await inv.dispose();
    }
  });
});

describe('5.1 / 03-S2: routed CLI calls find the owner from --task', () => {
  it('route status, route next and note save work with no Claude session at all', async () => {
    const inv = await investigation();
    try {
      await launch(inv.hooked, '/ambicode:investigate how does addToCart work --task cart');
      const owner = String((await inv.fx.kinds('cart', 'route'))[0]!['session']);
      const status = await runRouteStatus(inv.fx.runtime, args('route status', ['--task', 'cart'], ROUTE_STATUS_OPTIONS));
      assert.deepEqual(status.routes.map((route) => [route.skill, route.position, route.sessions.map((entry) => entry.session)]), [['investigate', 'read', [owner]]]);

      const next = await runRouteNext(inv.fx.runtime, args('route next', ['--task', 'cart'], ROUTE_NEXT_OPTIONS));
      assert.equal(next.position, 'read');

      const body = '## Confirmed facts\n- addToCart appends (src/cart.ts:2)\n';
      const runtime: Runtime = { ...inv.fx.runtime, stdin: { read: async () => body } };
      const saved = await runNoteSave(runtime, args('note save', ['--task', 'cart', '--kind', 'investigation'], NOTE_SAVE_OPTIONS));
      assert.match(saved.next ?? '', /The route is complete/);
      const note = (await inv.fx.kinds('cart', 'note'))[0]!;
      assert.equal(note['route'], next.routeId);
      assert.equal((await inv.fx.kinds('cart', 'exit')).at(-1)?.['reason'], 'done');
    } finally {
      await inv.dispose();
    }
  });

  it('route stop by --task ends the hook-started route; the Claude session no longer has an open route', async () => {
    const inv = await investigation();
    try {
      await launch(inv.hooked, '/ambicode:investigate how does addToCart work --task cart');
      const stopped = await runRouteStop(inv.fx.runtime, args('route stop', ['--task', 'cart', '--reason', 'human'], ROUTE_STOP_OPTIONS));
      assert.equal(stopped.reason, 'human');
      assert.equal((await inv.fx.kinds('cart', 'exit')).at(-1)?.['reason'], 'human');
      assert.equal(await resolveActiveRoute(inv.fx.runtime.fs, inv.fx.pointer, { repositoryRoot: inv.fx.repo.root, session: CLAUDE_1, scratchpad: inv.scratchpad(CLAUDE_1) }), null);
      assert.equal(await codeOf(runRouteNext(inv.fx.runtime, args('route next', ['--task', 'cart'], ROUTE_NEXT_OPTIONS))), 'route-not-open');
    } finally {
      await inv.dispose();
    }
  });

  it('a task with two live chains is route-ambiguous for route next and route stop; nothing is guessed', async () => {
    const inv = await investigation();
    try {
      await launch(inv.hooked, '/ambicode:investigate how does addToCart work --task cart', CLAUDE_1);
      await launch(inv.hooked, '/ambicode:investigate how does checkout work --task cart', CLAUDE_2);
      assert.equal((await inv.fx.kinds('cart', 'route')).length, 2);
      assert.deepEqual(await taskSessionSource('cart').resolve(inv.fx.runtime), { state: 'unbound', reason: 'ambiguous' });
      const before = await inv.fx.ledger('cart');
      assert.equal(await codeOf(runRouteNext(inv.fx.runtime, args('route next', ['--task', 'cart'], ROUTE_NEXT_OPTIONS))), 'route-ambiguous');
      assert.equal(await codeOf(runRouteStop(inv.fx.runtime, args('route stop', ['--task', 'cart', '--reason', 'human'], ROUTE_STOP_OPTIONS))), 'route-ambiguous');
      assert.deepEqual(await inv.fx.ledger('cart'), before);
    } finally {
      await inv.dispose();
    }
  });

  it('a CLI route start is a new owner of its own, untrusted, with no Claude session recorded', async () => {
    const inv = await investigation();
    try {
      const started = await runRouteStart(inv.fx.runtime, args('route start', ['investigate', 'how does addToCart work', '--task', 'cli-task'], ROUTE_START_OPTIONS));
      assert.equal(started.position, 'read');
      const route = (await inv.fx.kinds('cli-task', 'route'))[0]!;
      assert.match(String(route['session']), UUID);
      assert.deepEqual([route['channel'], route['trusted'], route['harnessSession']], ['cli', false, undefined]);
      assert.deepEqual(await taskSessionSource('cli-task').resolve(inv.fx.runtime), { state: 'bound', session: route['session'], via: 'task' });
      assert.equal((await runRouteNext(inv.fx.runtime, args('route next', ['--task', 'cli-task'], ROUTE_NEXT_OPTIONS))).position, 'read');
    } finally {
      await inv.dispose();
    }
  });
});

describe('5.1 / 03-O1: ownership is by owner id', () => {
  const asked = (plan: PlanFixture, hooked: Hooked, session: string, extra = '') => launch(hooked, `/ambicode:plan add a limit --task ${PLAN_TASK}${extra}`, session).then(context).then((text) => ({ text, plan }));

  it('a second Claude session starting the same plan task is route-busy and writes nothing; --adopt makes a new owner', async () => {
    const plan = await planFixture();
    const hooked = hookRunner(plan.fx, plan.fx.runtime, { pointer: plan.fx.pointer, load: async () => ({ engine: plan.fx.engine, routes: plan.fx.routes, pointer: plan.fx.pointer }) });
    try {
      assert.match((await asked(plan, hooked, CLAUDE_1)).text, /step design/);
      const first = (await plan.fx.kinds(PLAN_TASK, 'route'))[0]!;
      const busy = await asked(plan, hooked, CLAUDE_2);
      assert.match(busy.text, /could not start the plan route: route-busy/);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'route')).length, 1);

      assert.match((await asked(plan, hooked, CLAUDE_2, ' --adopt')).text, /\[ambicode\] plan/);
      const routes = await plan.fx.kinds(PLAN_TASK, 'route');
      assert.equal(routes.length, 2);
      assert.notEqual(routes[1]!['session'], first['session']);
      assert.deepEqual([routes[1]!['harnessSession'], routes[1]!['resumes'], routes[1]!['adopts']], [CLAUDE_2, first.id, true]);
      const owner = ownerOf(await plan.fx.ledger(PLAN_TASK), PLAN_TASK);
      assert.deepEqual(owner.state === 'owned' ? [owner.session, owner.takenOver] : null, [routes[1]!['session'], [first['session']]]);
    } finally {
      await plan.dispose();
    }
  });

  it('the CLI target of a plan task is the hook-minted owner; the slug alone cannot tell the owner from a second honest session', async () => {
    const plan = await planFixture();
    const hooked = hookRunner(plan.fx, plan.fx.runtime, { pointer: plan.fx.pointer, load: async () => ({ engine: plan.fx.engine, routes: plan.fx.routes, pointer: plan.fx.pointer }) });
    try {
      await asked(plan, hooked, CLAUDE_1);
      const route = (await plan.fx.kinds(PLAN_TASK, 'route'))[0]!;
      assert.deepEqual(await taskSessionSource(PLAN_TASK).resolve(plan.fx.runtime), { state: 'bound', session: route['session'], via: 'task' });
      assert.equal(await codeOf(plan.next({ session: String(route['session']) })), 'ok');
    } finally {
      await plan.dispose();
    }
  });

  it('two tasks in one repository keep separate owners, pointers and CLI targets', async () => {
    const inv = await investigation();
    try {
      await launch(inv.hooked, '/ambicode:investigate how does addToCart work --task cart', CLAUDE_1);
      await launch(inv.hooked, '/ambicode:investigate how does checkout work --task checkout', CLAUDE_2);
      const [cart] = await inv.fx.kinds('cart', 'route');
      const [checkout] = await inv.fx.kinds('checkout', 'route');
      assert.notEqual(cart!['session'], checkout!['session']);
      assert.equal((await inv.fx.pointer.read(CLAUDE_1, inv.scratchpad(CLAUDE_1)))?.task, 'cart');
      assert.equal((await inv.fx.pointer.read(CLAUDE_2, inv.scratchpad(CLAUDE_2)))?.task, 'checkout');

      const otherBefore = await inv.fx.ledger('checkout');
      assert.equal((await runRouteNext(inv.fx.runtime, args('route next', ['--task', 'cart'], ROUTE_NEXT_OPTIONS))).task, 'cart');
      assert.deepEqual(await inv.fx.ledger('checkout'), otherBefore);

      await runRouteStop(inv.fx.runtime, args('route stop', ['--task', 'cart', '--reason', 'human'], ROUTE_STOP_OPTIONS));
      assert.deepEqual(await taskSessionSource('checkout').resolve(inv.fx.runtime), { state: 'bound', session: checkout!['session'], via: 'task' });
      assert.equal((await inv.fx.pointer.read(CLAUDE_2, inv.scratchpad(CLAUDE_2)))?.task, 'checkout');
      assert.equal((await runRouteNext(inv.fx.runtime, args('route next', ['--task', 'checkout'], ROUTE_NEXT_OPTIONS))).task, 'checkout');
    } finally {
      await inv.dispose();
    }
  });
});

describe('5.1 / 03-G3/03-G4: the owner id is never consent', () => {
  const answered = (question: string, label: string) => ({
    hook_event_name: 'PostToolUse',
    tool_name: 'AskUserQuestion',
    tool_input: { questions: [{ question, options: ['Accept', 'Revise', 'Reject'].map((value) => ({ label: value })) }] },
    tool_response: { answers: { [question]: label } },
  });

  it('an acting answer typed through the CLI path stays declined; only the hook marker of the attached Claude session is honoured', async () => {
    const plan = await planFixture();
    const hookDeps = { engine: plan.fx.engine, routes: plan.fx.routes, pointer: plan.fx.pointer };
    const hooked = hookRunner(plan.fx, plan.fx.runtime, { pointer: plan.fx.pointer, load: async () => hookDeps });
    try {
      await launch(hooked, `/ambicode:plan add a limit --task ${PLAN_TASK}`, CLAUDE_1);
      const owner = (await taskSessionSource(PLAN_TASK).resolve(plan.fx.runtime)) as { session: string };
      const advance = (extra: object = {}) => plan.fx.engine.advance({ task: PLAN_TASK, session: owner.session, cause: 'route-next', scratchpadDir: hooked.scratchpad(CLAUDE_1), ...extra });
      await advance();
      await plan.body('# Plan\n\n1. Do it.\n');
      await advance();
      const print = (await plan.prints()).at(-1)!;
      const platform = { askBinding: 'supported', answerContext: 'supported' } as const;
      const notes = async () => (await plan.fx.kinds(PLAN_TASK, 'note')).filter((entry) => entry['note'] === 'plan').length;

      await advance({ answers: [{ gate: 'plan-accept', option: 'Accept' }] });
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'declined')).at(-1)!['reason'], 'acting-needs-human');
      assert.equal(await notes(), 0);

      const question = `Accept this plan? [ambicode gate plan-accept ${print.id}]`;
      const stranger = { session_id: CLAUDE_2, cwd: plan.fx.repo.root, scratchpad_dir: hooked.scratchpad(CLAUDE_2), ...answered(question, 'Accept') };
      assert.equal(await answerGates(plan.fx.runtime, stranger as never, hookDeps, platform), null);
      const asOwner = { ...stranger, session_id: owner.session, scratchpad_dir: hooked.scratchpad(CLAUDE_1) };
      assert.equal(await answerGates(plan.fx.runtime, asOwner as never, hookDeps, platform), null, 'the owner id is not a Claude session');
      assert.equal(await notes(), 0);

      const real = { session_id: CLAUDE_1, cwd: plan.fx.repo.root, scratchpad_dir: hooked.scratchpad(CLAUDE_1), ...answered(question, 'Accept') };
      assert.notEqual(await answerGates(plan.fx.runtime, real as never, hookDeps, platform), null);
      const acceptance = (await plan.fx.kinds(PLAN_TASK, 'acceptance')).at(-1)!;
      assert.deepEqual([acceptance['via'], acceptance['instance']], ['hook', print.id]);
      assert.equal(await notes(), 1);
    } finally {
      await plan.dispose();
    }
  });
});

describe('5.1 / 03-S7: a Claude session change re-attaches the session only when that is unambiguous', () => {
  const planTask = async (hooked: Hooked, plan: PlanFixture, task: string, session: string) => {
    await launch(hooked, `/ambicode:plan add a limit --task ${task}`, session);
    assert.equal((await plan.fx.kinds(task, 'route')).length, 1);
  };
  const setup = async () => {
    const plan = await planFixture();
    const deps: HookDeps = { pointer: plan.fx.pointer, load: async () => ({ engine: plan.fx.engine, routes: plan.fx.routes, pointer: plan.fx.pointer }) };
    const tmp = await plan.fx.runtime.fs.temporaryDirectory('ambicode-ended-');
    const runtime: Runtime = { ...plan.fx.runtime, fs: { ...plan.fx.runtime.fs, temporaryRoot: () => tmp } };
    return { plan, hooked: hookRunner(plan.fx, runtime, deps), tmp };
  };
  const routes = (plan: PlanFixture, task = PLAN_TASK) => plan.fx.kinds(task, 'route');

  it('one live route whose Claude session ended is re-attached to the new session, keeping its owner', async () => {
    const { plan, hooked } = await setup();
    try {
      await planTask(hooked, plan, PLAN_TASK, CLAUDE_1);
      const first = (await routes(plan))[0]!;
      await hooked.event({ hook_event_name: 'SessionEnd' }, CLAUDE_1);
      await hooked.event({ hook_event_name: 'SessionStart', source: 'clear' }, CLAUDE_2);

      const all = await routes(plan);
      assert.equal(all.length, 2);
      assert.deepEqual([all[1]!['session'], all[1]!['harnessSession'], all[1]!['resumes'], all[1]!['adopts'], all[1]!['channel'], all[1]!['trusted']], [first['session'], CLAUDE_2, first.id, true, first['channel'], first['trusted']]);
      const owner = ownerOf(await plan.fx.ledger(PLAN_TASK), PLAN_TASK);
      assert.deepEqual(owner.state === 'owned' ? [owner.session, owner.takenOver] : null, [first['session'], []]);

      const resolve = (session: string) => resolveActiveRoute(plan.fx.runtime.fs, plan.fx.pointer, { repositoryRoot: plan.fx.repo.root, session, scratchpad: hooked.scratchpad(session) });
      assert.equal((await resolve(CLAUDE_2))?.owner, first['session']);
      assert.equal(await resolve(CLAUDE_1), null, 'the ended session is detached');
      assert.deepEqual(await plan.fx.pointer.read(CLAUDE_2, hooked.scratchpad(CLAUDE_2)), { task: PLAN_TASK, skill: 'plan', owner: first['session'] });
      assert.match(context(await launch(hooked, 'continue', CLAUDE_2)), /\[ambicode\] plan · task ORD-17 · step design/);
      assert.equal((await taskSessionSource(PLAN_TASK).resolve(plan.fx.runtime) as { session: string }).session, first['session']);
    } finally {
      await plan.dispose();
    }
  });

  it('nothing is attached when the route session has not ended, on a fresh startup, or for a subagent', async () => {
    const { plan, hooked } = await setup();
    try {
      await planTask(hooked, plan, PLAN_TASK, CLAUDE_1);
      await hooked.event({ hook_event_name: 'SessionStart', source: 'clear' }, CLAUDE_2);
      await hooked.event({ hook_event_name: 'SessionEnd' }, CLAUDE_1);
      await hooked.event({ hook_event_name: 'SessionStart', source: 'startup' }, CLAUDE_3);
      await hooked.event({ hook_event_name: 'SessionStart', source: 'clear', agent_id: 'sub' }, CLAUDE_4);
      assert.equal((await routes(plan)).length, 1);
    } finally {
      await plan.dispose();
    }
  });

  it('two live routes of ended sessions are ambiguous: nothing is attached, and --adopt stays the way', async () => {
    const { plan, hooked } = await setup();
    try {
      await planTask(hooked, plan, PLAN_TASK, CLAUDE_1);
      await planTask(hooked, plan, 'ORD-18', CLAUDE_2);
      await hooked.event({ hook_event_name: 'SessionEnd' }, CLAUDE_1);
      await hooked.event({ hook_event_name: 'SessionEnd' }, CLAUDE_2);
      await hooked.event({ hook_event_name: 'SessionStart', source: 'resume' }, CLAUDE_3);
      assert.equal((await routes(plan)).length, 1);
      assert.equal((await routes(plan, 'ORD-18')).length, 1);
      assert.equal(await plan.fx.pointer.read(CLAUDE_3, hooked.scratchpad(CLAUDE_3)), null);
      assert.match(context(await launch(hooked, `/ambicode:plan add a limit --task ${PLAN_TASK}`, CLAUDE_3)), /route-busy/);
    } finally {
      await plan.dispose();
    }
  });

  it('a session that already holds a route is not re-attached to another, and a resumed id clears its ended mark', async () => {
    const { plan, hooked } = await setup();
    try {
      await planTask(hooked, plan, PLAN_TASK, CLAUDE_1);
      await planTask(hooked, plan, 'ORD-18', CLAUDE_2);
      await hooked.event({ hook_event_name: 'SessionEnd' }, CLAUDE_1);
      await hooked.event({ hook_event_name: 'SessionStart', source: 'resume' }, CLAUDE_2);
      assert.equal((await routes(plan)).length, 1, 'CLAUDE_2 holds ORD-18 already');
      await hooked.event({ hook_event_name: 'SessionStart', source: 'resume' }, CLAUDE_1);
      await hooked.event({ hook_event_name: 'SessionStart', source: 'resume' }, CLAUDE_3);
      assert.equal((await routes(plan)).length, 1, 'CLAUDE_1 is alive again, so its route is not an orphan');
    } finally {
      await plan.dispose();
    }
  });

  it('an owner id written by the CLI has no Claude session to end, so it is never re-attached', async () => {
    const { plan, hooked } = await setup();
    try {
      await plan.start({ session: 'cli-owner-0001', channel: 'cli' });
      await hooked.event({ hook_event_name: 'SessionStart', source: 'resume' }, CLAUDE_3);
      assert.equal((await routes(plan)).length, 1);
    } finally {
      await plan.dispose();
    }
  });
});

describe('03-S7/03-H4: the same Claude session resumed, and a CLI advance after a hook launch', () => {
  it('03-H4: a resumed session with the same id gets its pointer back and the active step is re-injected without a relaunch', async () => {
    const inv = await investigation();
    try {
      await launch(inv.hooked, '/ambicode:investigate how does addToCart work --task cart');
      await inv.hooked.event({ hook_event_name: 'SessionEnd' }, CLAUDE_1);
      assert.equal(await inv.fx.pointer.read(CLAUDE_1, inv.scratchpad(CLAUDE_1)), null);
      await inv.hooked.event({ hook_event_name: 'SessionStart', source: 'resume' }, CLAUDE_1);
      assert.equal((await inv.fx.pointer.read(CLAUDE_1, inv.scratchpad(CLAUDE_1)))?.task, 'cart');
      assert.match(context(await launch(inv.hooked, 'continue', CLAUDE_1)), /step read/);
    } finally {
      await inv.dispose();
    }
  });

  it('03-S7/03-K3: a CLI advance after a hook launch writes its state where the hook looks, so Stop still checks the finished note', async () => {
    const inv = await investigation();
    try {
      await launch(inv.hooked, '/ambicode:investigate how does addToCart work --task cart');
      const owner = String((await inv.fx.kinds('cart', 'route'))[0]!['session']);
      await inv.fx.engine.advance({ task: 'cart', session: owner, cause: 'route-next' });
      const context = ledgerRouteContext({ runtime: inv.fx.runtime, routes: inv.fx.routes });
      await saveNote({ runtime: inv.fx.runtime, session: owner, context }, { task: 'cart', kind: 'investigation', body: '## Confirmed facts\n- missing (src/missing.ts:999)\n', from: null, iteration: null, route: (await inv.fx.kinds('cart', 'route'))[0]!.id });
      await inv.fx.engine.advance({ task: 'cart', session: owner, cause: 'note save' });
      const stopped = (await inv.hooked.event({ hook_event_name: 'Stop' }, CLAUDE_1)) as { decision?: string; reason?: string };
      assert.equal(stopped.decision, 'block');
      assert.match(stopped.reason ?? '', /src\/missing\.ts:999/);
    } finally {
      await inv.dispose();
    }
  });
});
