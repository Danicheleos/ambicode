import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs } from '#util/args';
import { runNoteSave, NOTE_SAVE_OPTIONS } from '#cli/commands/route/note';
import { stopRoute } from '#testing/fixtures/route-fixture';
import { runRouteNext, runRouteStart, ROUTE_NEXT_OPTIONS } from '#cli/commands/route/route';
import { answerGates } from '#hook/events/gate-answer';
import { hookRunner, investigation, type Hooked } from '#testing/fixtures/owner-fixture';
import { planFixture, PLAN_TASK, type PlanFixture } from '#testing/fixtures/plan-fixture';
import { resolveActiveRoute } from './active-route.ts';
import { harnessOf, ownerOfHarness } from './harness.ts';
import { ownerOf } from '#modules/evidence/ownership';
import { taskSessionSource } from './session.ts';
import { commandContext } from '../engine/context.ts';
import { saveNote } from '#modules/evidence/notes';
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

  it('the same Claude session launching the same request again supersedes its route and mints a new owner', async () => {
    const inv = await investigation();
    try {
      await launch(inv.hooked, '/ambicode:investigate how does addToCart work --task cart');
      const [first] = await inv.fx.kinds('cart', 'route');
      await launch(inv.hooked, '/ambicode:investigate how does addToCart work --task cart');
      const routes = await inv.fx.kinds('cart', 'route');
      assert.equal(routes.length, 2);
      assert.deepEqual((await inv.fx.kinds('cart', 'exit')).map((entry) => [entry['route'], entry['reason']]), [[first!.id, 'superseded']]);
      assert.deepEqual(await inv.fx.pointer.read(CLAUDE_1, inv.scratchpad(CLAUDE_1)), { task: 'cart', skill: 'investigate', owner: routes[1]!['session'] });
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
  it('route next and note save work with no Claude session at all', async () => {
    const inv = await investigation();
    try {
      await launch(inv.hooked, '/ambicode:investigate how does addToCart work --task cart');
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

  it('a task with two live chains is route-ambiguous for route next; nothing is guessed', async () => {
    const inv = await investigation();
    try {
      await launch(inv.hooked, '/ambicode:investigate how does addToCart work --task cart', CLAUDE_1);
      await launch(inv.hooked, '/ambicode:investigate how does checkout work --task cart', CLAUDE_2);
      assert.equal((await inv.fx.kinds('cart', 'route')).length, 2);
      assert.deepEqual(await taskSessionSource('cart').resolve(inv.fx.runtime), { state: 'unbound', reason: 'ambiguous' });
      const before = await inv.fx.ledger('cart');
      assert.equal(await codeOf(runRouteNext(inv.fx.runtime, args('route next', ['--task', 'cart'], ROUTE_NEXT_OPTIONS))), 'route-ambiguous');
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

  it('a second Claude session starting the same plan task is route-busy and writes nothing; --fresh supersedes the first owner and makes a new one', async () => {
    const plan = await planFixture();
    const hooked = hookRunner(plan.fx, plan.fx.runtime, { pointer: plan.fx.pointer, load: async () => ({ engine: plan.fx.engine, routes: plan.fx.routes, pointer: plan.fx.pointer }) });
    try {
      assert.match((await asked(plan, hooked, CLAUDE_1)).text, /step design/);
      const first = (await plan.fx.kinds(PLAN_TASK, 'route'))[0]!;
      const busy = await asked(plan, hooked, CLAUDE_2);
      assert.match(busy.text, /could not start the plan route: route-busy/);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'route')).length, 1);

      assert.match((await asked(plan, hooked, CLAUDE_2, ' --fresh')).text, /\[ambicode\] plan/);
      const routes = await plan.fx.kinds(PLAN_TASK, 'route');
      assert.equal(routes.length, 2);
      assert.notEqual(routes[1]!['session'], first['session']);
      assert.equal(routes[1]!['harnessSession'], CLAUDE_2);
      assert.deepEqual((await plan.fx.kinds(PLAN_TASK, 'exit')).map((entry) => [entry['route'], entry['reason']]), [[first.id, 'superseded']]);
      const owner = ownerOf(await plan.fx.ledger(PLAN_TASK), PLAN_TASK);
      assert.equal(owner.state === 'owned' ? owner.session : null, routes[1]!['session']);
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

      await stopRoute(inv.fx, 'cart', String(cart!['session']), 'human', undefined, inv.scratchpad(CLAUDE_1));
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

describe('03-S7/03-H4: the same Claude session resumed, and a CLI advance after a hook launch', () => {
  it('03-S7/03-K3: a CLI advance after a hook launch writes its state where the hook looks, so Stop still checks the finished note', async () => {
    const inv = await investigation();
    try {
      await launch(inv.hooked, '/ambicode:investigate how does addToCart work --task cart');
      const owner = String((await inv.fx.kinds('cart', 'route'))[0]!['session']);
      await inv.fx.engine.advance({ task: 'cart', session: owner, cause: 'route-next' });
      const context = commandContext({ runtime: inv.fx.runtime, routes: inv.fx.routes });
      await saveNote({ runtime: inv.fx.runtime, session: owner, context }, { task: 'cart', kind: 'investigation', body: '## Confirmed facts\n- appends (src/cart.ts:2)\n', from: null, iteration: null, route: (await inv.fx.kinds('cart', 'route'))[0]!.id });
      await inv.fx.engine.advance({ task: 'cart', session: owner, cause: 'note save' });
      assert.equal((await inv.fx.kinds('cart', 'exit')).at(-1)?.['reason'], 'done');
      const stopped = (await inv.hooked.event({ hook_event_name: 'Stop', last_assistant_message: 'Evidence\nnothing was run' }, CLAUDE_1)) as { decision?: string; reason?: string };
      assert.equal(stopped.decision, 'block');
      assert.match(stopped.reason ?? '', /stop-check\.md/);
    } finally {
      await inv.dispose();
    }
  });
});
