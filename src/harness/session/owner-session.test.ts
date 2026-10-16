import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { answerGates } from '#hook/events/gate-answer';
import { hookRunner, investigation } from '#testing/fixtures/owner-fixture';
import { planFixture, PLAN_TASK } from '#testing/fixtures/plan-fixture';
import { commandContext } from '../engine/context.ts';
import { saveNote } from '#modules/evidence/notes';

const CLAUDE_1 = '11111111-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const CLAUDE_2 = '22222222-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('03-G3/03-G4: only a hook answer of the owning session is consent', () => {
  const answered = (question: string, label: string) => ({
    hook_event_name: 'PostToolUse',
    tool_name: 'AskUserQuestion',
    tool_input: { questions: [{ question, options: ['Accept', 'Revise', 'Reject'].map((value) => ({ label: value })) }] },
    tool_response: { answers: { [question]: label } },
  });

  it('an acting answer typed through the CLI path stays declined; only the hook marker of the owning Claude session is honoured', async () => {
    const plan = await planFixture();
    const hookDeps = { engine: plan.fx.engine, routes: plan.fx.routes };
    const hooked = hookRunner(plan.fx, plan.fx.runtime, { load: async () => hookDeps });
    try {
      await hooked.event({ hook_event_name: 'UserPromptSubmit', prompt: `/ambicode:plan add a limit --task ${PLAN_TASK}` }, CLAUDE_1);
      const advance = (extra: object = {}) => plan.fx.engine.advance({ task: PLAN_TASK, cause: 'route-next', scratchpadDir: hooked.scratchpad(CLAUDE_1), ...extra });
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
      assert.equal(await answerGates(plan.fx.runtime, stranger as never, hookDeps, { repositoryRoot: plan.fx.repo.root, where: '.' }, platform), null);
      assert.equal(await notes(), 0);

      const real = { session_id: CLAUDE_1, cwd: plan.fx.repo.root, scratchpad_dir: hooked.scratchpad(CLAUDE_1), ...answered(question, 'Accept') };
      assert.notEqual(await answerGates(plan.fx.runtime, real as never, hookDeps, { repositoryRoot: plan.fx.repo.root, where: '.' }, platform), null);
      const acceptance = (await plan.fx.kinds(PLAN_TASK, 'acceptance')).at(-1)!;
      assert.deepEqual([acceptance['via'], acceptance['instance']], ['hook', print.id]);
      assert.equal(await notes(), 1);
    } finally {
      await plan.dispose();
    }
  });
});

describe('03-H4: a CLI advance after a hook launch', () => {
  it('03-S7/03-K3: a CLI advance after a hook launch writes its state where the hook looks, so Stop still checks the finished note', async () => {
    const inv = await investigation();
    try {
      await inv.hooked.event({ hook_event_name: 'UserPromptSubmit', prompt: '/ambicode:investigate how does addToCart work --task cart' }, CLAUDE_1);
      await inv.fx.engine.advance({ task: 'cart', cause: 'route-next' });
      const context = commandContext({ runtime: inv.fx.runtime, routes: inv.fx.routes });
      await saveNote({ runtime: inv.fx.runtime, session: CLAUDE_1, context }, { task: 'cart', kind: 'investigation', body: '## Confirmed facts\n- appends (src/cart.ts:2)\n', from: null, route: (await inv.fx.kinds('cart', 'route'))[0]!.id });
      await inv.fx.engine.advance({ task: 'cart', cause: 'note save' });
      assert.equal((await inv.fx.kinds('cart', 'exit')).at(-1)?.['reason'], 'done');
      const stopped = (await inv.hooked.event({ hook_event_name: 'Stop', last_assistant_message: 'Evidence\nnothing was run' }, CLAUDE_1)) as { decision?: string; reason?: string };
      assert.equal(stopped.decision, 'block');
      assert.match(stopped.reason ?? '', /Not verified section is missing[\s\S]*\nEvidence\n/);
    } finally {
      await inv.dispose();
    }
  });
});
