import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { routeFixture } from '#testing/fixtures/route-fixture';
import { planFixture, PLAN_TASK } from '#testing/fixtures/plan-fixture';
import { gatePrintText, gateThen, instantiateGate, raiseGate } from './gates.ts';
import { withLedgerLock } from '#platform/ledger/ledger-lock';
import { resolveTaskDir } from '#modules/evidence/task/task-dir';
import type { Handler } from '#types/harness';

const A = 'aaaaaaaa-1111-4111-8111-111111111111';
const ROUTE = `skill: tbl
version: 3
revisable: []
steps:
  - id: ask
    actor: code
    run: [t.raise]
  - id: after
    actor: model
    instruction: "After."
  - id: review-run
    actor: model
    instruction: "Review."
  - id: review-cmd
    actor: model
    instruction: "Review again."
`;

const VALUES: Record<string, Record<string, string[]>> = {
  'requirements-not-captured-twice': {},
  'check-only-unauthorized': { key: ['unit'], files: ['src/a.ts'] },
  'review-again': {},
  'project-ambiguous': { projects: ['app', 'lib'] },
  'decision:db-choice': {},
};

function handlers(): Record<string, Handler> {
  const raised = new Set<string>();
  return {
    't.raise': async ({ args, view }) => {
      const key = `${view.task}`;
      if (raised.has(key)) return { state: 'ok', payload: null };
      raised.add(key);
      return { state: 'raise', gate: args.text, values: VALUES[args.text] ?? {} };
    },
  };
}

let counter = 0;
async function table() {
  const fx = await routeFixture({ routes: { tbl: ROUTE }, handlers: handlers() });
  const begin = async (gate: string, extra: { headless?: boolean; session?: string } = {}) => {
    counter += 1;
    const task = `g${counter}`;
    const message = await fx.engine.start({ skill: 'tbl', text: gate, requirements: [], task, cwd: fx.repo.root, session: extra.session ?? A, channel: 'hook', ...(extra.headless === true ? { headless: true } : {}) });
    return { task, message };
  };
  const advance = (task: string, input: object = {}) => fx.engine.advance({ task, session: A, cause: 'route-next', ...input });
  const hook = (task: string, gate: string, option: string, instance: string | undefined) => fx.engine.advance({ task, session: A, cause: 'gate-hook', answers: [{ gate, option, ...(instance === undefined ? {} : { instance }) }] });
  const definition = (gate: string) => fx.routes.gate(gate)!;
  const instantiated = (gate: string) => instantiateGate(definition(gate), { skill: 'tbl', values: VALUES[gate] ?? {} }, gate);
  const lastPrint = async (task: string, gate: string) => (await fx.kinds(task, 'gate')).filter((entry) => entry['gate'] === gate).at(-1)!;
  return { fx, begin, advance, hook, instantiated, lastPrint };
}

const REGISTRY = Object.keys(VALUES);

describe('gate table: every registry gate', () => {
  it('03-G12/03-R8: the fixture values cover every registry entry', async () => {
    const t = await table();
    try {
      assert.deepEqual(t.fx.routes.gates().map((gate) => gate.id).sort(), [...REGISTRY.filter((id) => !id.startsWith('decision:')), 'decision:*'].sort());
    } finally {
      await t.fx.dispose();
    }
  });

  it('03-G4/03-G11: a hook answer to the printed instance records an acceptance for every offered option, acting ones included', async () => {
    const t = await table();
    try {
      for (const gate of REGISTRY) {
        const options = t.instantiated(gate).options;
        for (const option of options) {
          const { task, message } = await t.begin(gate);
          assert.match(message.text, new RegExp(`\\[ambicode gate ${gate} `), `${gate} prints its marker`);
          const print = await t.lastPrint(task, gate);
          await t.hook(task, gate, option, print.id);
          const accepted = (await t.fx.kinds(task, 'acceptance')).at(-1);
          assert.equal(accepted?.['answer'], option, `${gate}/${option}`);
          assert.equal(accepted?.['via'], 'hook');
          assert.equal(accepted?.['instance'], print.id);
        }
      }
    } finally {
      await t.fx.dispose();
    }
  });

  it('03-G1: a flag answer selects non-acting options and declines acting ones; free text never acts', async () => {
    const t = await table();
    try {
      for (const gate of REGISTRY) {
        const resolved = t.instantiated(gate);
        for (const option of resolved.options) {
          const { task } = await t.begin(gate);
          await t.advance(task, { answers: [{ gate, option }] });
          const entries = await t.fx.ledger(task);
          const answer = entries.findLast((entry) => ['acceptance', 'declined'].includes(entry.kind) && entry['gate'] === gate);
          if (resolved.acting.includes(option)) assert.equal(answer?.['reason'], 'acting-needs-human', `${gate}/${option}`);
          else assert.equal(answer?.kind, 'acceptance', `${gate}/${option}`);
          assert.equal(answer?.['via'], 'flag');
        }
      }
    } finally {
      await t.fx.dispose();
    }
  });

  it('03-G7/03-G8: an unanswered interactive gate is re-shown as it was, never defaulted; headless takes the default at once; the default never acts', async () => {
    const t = await table();
    try {
      for (const gate of REGISTRY) {
        const resolved = t.instantiated(gate);
        assert.equal(resolved.acting.includes(resolved.default), false, `${gate} default is not acting`);
        const { task } = await t.begin(gate);
        const prints = (await t.fx.kinds(task, 'gate')).length;
        for (let turn = 0; turn < 4; turn += 1) await t.advance(task);
        assert.equal((await t.fx.kinds(task, 'gate')).length, prints, gate);
        assert.equal((await t.fx.kinds(task, 'default-taken')).length, 0, gate);
        const headless = await t.begin(gate, { headless: true });
        assert.equal((await t.fx.kinds(headless.task, 'default-taken')).at(-1)?.['via'], 'headless', gate);
        assert.equal((await t.fx.kinds(headless.task, 'note')).length, 0);
      }
    } finally {
      await t.fx.dispose();
    }
  });

  it('03-G12: the review policy override leaves a stop option as the default', async () => {
    const t = await table();
    try {
      for (const gate of t.fx.routes.gates().filter((candidate) => Object.keys(candidate.policy).length > 0)) {
        const stopped = instantiateGate(gate, { skill: 'review', values: VALUES[gate.id] ?? {} });
        assert.equal(stopped.default, 'stop');
        assert.ok(stopped.options.includes('stop'));
        assert.equal(instantiateGate(gate, { skill: 'investigate', values: VALUES[gate.id] ?? {} }).default, gate.default);
      }
    } finally {
      await t.fx.dispose();
    }
  });

  it('03-R8/03-G14: dynamic options expand from the values and a non-offered answer is declined, not bound', async () => {
    const t = await table();
    try {
      const { task, message } = await t.begin('project-ambiguous');
      assert.match(message.text, /- app\n.*- lib\n/s);
      const print = await t.lastPrint(task, 'project-ambiguous');
      await t.hook(task, 'project-ambiguous', 'other', print.id);
      assert.equal((await t.fx.kinds(task, 'declined')).at(-1)!['reason'], 'option-not-offered');
      assert.equal((await t.fx.kinds(task, 'acceptance')).length, 0);
    } finally {
      await t.fx.dispose();
    }
  });

  it('03-G13: a command-side raiseGate writes the same print a handler raise writes', async () => {
    const t = await table();
    try {
      const { task } = await t.begin('check-only-unauthorized');
      const handlerPrint = (await t.fx.kinds(task, 'gate'))[0]!;
      const dir = await resolveTaskDir(t.fx.runtime, task);
      const written = await withLedgerLock(t.fx.runtime.fs, dir.root, () => new Date(), A, async (ledger) => {
        const head = (await t.fx.kinds(task, 'route'))[0]!;
        return raiseGate(ledger, { task, routeId: head.id, chainIds: [head.id], skill: 'tbl', session: A, mode: 'interactive', channel: 'hook', trusted: true, position: 'ask' }, { gate: 'check-only-unauthorized', values: VALUES['check-only-unauthorized']!, raisedBy: 'ask' }, t.fx.routes);
      });
      const strip = (entry: Record<string, unknown>) => Object.fromEntries(Object.entries(entry).filter(([key]) => !['id', 'at', 'print'].includes(key)));
      assert.deepEqual(strip(written), strip(handlerPrint));
    } finally {
      await t.fx.dispose();
    }
  });

  it('03-G9/03-L3/03-L4: the print carries the instructions for the platform flags; the shipped default is supported and offers no model-typed answer', async () => {
    const t = await table();
    try {
      const { task, message } = await t.begin('check-only-unauthorized');
      assert.match(message.text, /Ask the user with AskUserQuestion, with the marker line verbatim in the question text\. The answer is recorded for you\.\nThe next step arrives with the user's answer\. Do not run a route command before then\./);
      assert.doesNotMatch(message.text, /--answer/);
      assert.match(message.text, /Then: the user's answer brings the next step\n/);
      const input = { task, gate: t.instantiated('check-only-unauthorized'), entry: await t.lastPrint(task, 'check-only-unauthorized'), object: null, revisesLeft: null };
      const text = (askBinding: 'supported' | 'unsupported', answerContext: 'supported' | 'unsupported') => gatePrintText({ ...input, platform: { askBinding, answerContext } });
      const flagged = input.gate.options.filter((option) => !input.gate.acting.includes(option)).join(', ');
      assert.match(text('unsupported', 'unsupported'), new RegExp(`For an answer that does not act \\(${flagged}\\) run: ambicode route next --task ${task} --answer check-only-unauthorized=<option>`));
      assert.match(text('unsupported', 'unsupported'), new RegExp(`\\nAfter the user answers, run: ambicode route next --task ${task}$`));
      assert.match(text('unsupported', 'supported'), /--answer check-only-unauthorized=<option>/);
      assert.doesNotMatch(text('unsupported', 'supported'), /After the user answers, run/);
      assert.doesNotMatch(text('supported', 'unsupported'), /--answer/);
      assert.match(text('supported', 'unsupported'), /\nAfter the user answers, run: /);
      assert.equal(gateThen(task, 'ambicode', { askBinding: 'supported', answerContext: 'unsupported' }), `ambicode route next --task ${task}`);
    } finally {
      await t.fx.dispose();
    }
  });

  it('03-F7: $raisedBy revises are keyed by the raising step, so two raisers do not share a counter', async () => {
    const t = await table();
    try {
      const { task } = await t.begin('check-only-unauthorized');
      const print = await t.lastPrint(task, 'check-only-unauthorized');
      await t.hook(task, 'check-only-unauthorized', 'approve', print.id);
      const revise = (await t.fx.kinds(task, 'revise')).at(-1);
      assert.equal(revise?.['from'], 'ask');
      assert.equal(revise?.['via'], 'gate');
    } finally {
      await t.fx.dispose();
    }
  });
});

describe('gate table: the shipped plan-accept gate', () => {
  it('03-G7: route next on an unanswered plan-accept re-shows the print and promotes nothing', async () => {
    const plan = await planFixture({ shipped: true });
    try {
      await plan.toGate();
      const before = (await plan.prints()).length;
      await plan.next();
      await plan.next();
      await plan.next();
      assert.equal((await plan.prints()).length, before);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'default-taken')).length, 0);
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'note')).filter((entry) => entry['note'] === 'plan').length, 0);
    } finally {
      await plan.dispose();
    }
  });

  it('03-F7: a gate Revise past repeat is declined as max-revises', async () => {
    const plan = await planFixture({ shipped: true });
    try {
      await plan.toGate();
      for (let cycle = 0; cycle < 4; cycle += 1) {
        const print = (await plan.prints()).at(-1)!;
        await plan.hook('plan-accept', 'Revise', print.id);
        if (cycle < 3) {
          for (let turn = 0; turn < 4 && (await plan.prints()).at(-1)!.id === print.id; turn += 1) {
            await plan.body(`# Plan ${cycle}\n`);
            await plan.next();
          }
        }
      }
      assert.equal((await plan.fx.kinds(PLAN_TASK, 'declined')).at(-1)!['reason'], 'max-revises');
    } finally {
      await plan.dispose();
    }
  });
});
